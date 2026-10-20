/* =========================================================================
   SAA GROUP: admin panel (admin/index.html)
   Talks to the recruitment backend (Google Apps Script web app) exactly as
   admin-system/API.md "Transport" says: one POST per action, text/plain JSON,
   redirect follow, 30 s timeout (60 s for addApp with a CV file).

   Everything in an application comes from the public, so it is treated as
   hostile: the DOM is built with createElement and textContent only, links
   are only mailto:/tel:/blob: links built here, CV files are typed from their
   own bytes (PDF, JPG, PNG open in a tab; anything else downloads), and the
   CSV export guards against spreadsheet formulas.
   The login token lives in sessionStorage only. Browsers can bring that back with
   "Reopen closed tab" or session restore, so the panel also logs out after
   30 minutes without activity, and a restored tab that was idle longer opens on
   the login screen.
   ========================================================================= */
(function () {
  'use strict';

  /* Never run inside another site's frame (clickjacking) */
  if (window.top !== window.self) {
    document.body.textContent = 'This page cannot be shown inside another page.';
    return;
  }

  /* ---------- Settings and constants ---------- */
  var CFG = window.SAA_CONFIG || {};
  var ENDPOINT = typeof CFG.recruitApi === 'string' ? CFG.recruitApi.trim() : '';
  var SESSION_KEY = 'saa-admin-session';
  var PREFS_KEY = 'saa-admin-prefs';
  var MAX_CV = 5 * 1024 * 1024;
  var T_NORMAL = 30000;
  var T_UPLOAD = 60000;
  var STATUSES = [['new', 'New'], ['shortlisted', 'Shortlisted'], ['contacted', 'Contacted'], ['rejected', 'Not suitable'], ['hired', 'Hired']];
  var KINDS = [['job', 'Job'], ['general', 'General'], ['emiratisation', 'Emiratisation']];
  var STATUS_LABEL = new Map(STATUSES);
  var KIND_LABEL = new Map(KINDS);
  var ROLE_GENERAL = 'General application';
  var ROLE_EMIRATI = 'Emiratisation registration (UAE Nationals)';
  var EXPERIENCE = ['Less than 1 year', '1 to 2 years', '3 to 5 years', '6 to 10 years', 'More than 10 years'];
  var LANGS = { en: 'English', ar: 'Arabic', hi: 'Hindi', ru: 'Russian', ur: 'Urdu', zh: 'Chinese' };
  var CV_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  var SESSION_ENDED = 'Your session ended, please log in again';
  var IDLE_MS = 30 * 60 * 1000;
  var IDLE_ENDED = 'You were logged out after 30 minutes without activity. Please log in again.';

  var COUNTRIES = Array.isArray(window.SAA_COUNTRIES) ? window.SAA_COUNTRIES.filter(function (c) {
    return c && typeof c.code === 'string' && /^[A-Z]{2}$/.test(c.code) && typeof c.name === 'string';
  }) : [];
  var COUNTRY_NAME = new Map(COUNTRIES.map(function (c) { return [c.code, c.name]; }));

  var EMPTY_FILTER = { position: '', nationality: '', kind: '', status: '', q: '', from: '', to: '' };
  var state = {
    session: null,
    filter: Object.assign({}, EMPTY_FILTER),
    page: 1, pageSize: 25, sort: 'new',
    rows: [], total: 0, facets: null, loadedOnce: false, appsStale: false,
    jobs: null, jobsLoading: null,
    selected: new Set(),
    seq: 0,
    drawerRow: null, notesDirty: false,
    jobEditing: null,
    authLost: false,
    pickers: {},
    expiryTimer: 0, idleTimer: 0, activeSaved: 0
  };

  /* ---------- Small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function str(v, max) {
    var s = typeof v === 'string' ? v : (v == null ? '' : String(v));
    return s.length > (max || 20000) ? s.slice(0, max || 20000) : s;
  }
  function toInt(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : (d || 0); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clip(s, n) { s = str(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function plural(n, one, many) { return fmtNum(n) + ' ' + (n === 1 ? one : many); }
  function fmtNum(n) { try { return Number(n).toLocaleString('en-GB'); } catch (_) { return String(n); } }

  function isSafeHref(v) {
    if (typeof v !== 'string') return false;
    if (/^(mailto:|tel:|#|\.\.\/)/.test(v)) return true;
    return v.indexOf('blob:') === 0 && (v.indexOf('blob:' + location.origin + '/') === 0 || v.indexOf('blob:null/') === 0);
  }

  /* h('tag', {attrs}, ...children): the only way this file builds DOM. Text is always textContent. */
  function h(tag, props) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'href') { if (isSafeHref(v)) n.setAttribute('href', v); }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(n, arguments[i]);
    return n;
  }
  function append(n, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(n, x); }); return; }
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(name) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('class', 'ic');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = document.createElementNS(SVG_NS, 'use');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  }
  function setBtnText(btn, text) {
    var span = btn.querySelector('span:not(.badge)');
    if (span) span.textContent = text; else btn.textContent = text;
  }
  function busy(btn, on, text) {
    if (!btn) return;
    if (on) {
      if (!btn.dataset.label) { var s = btn.querySelector('span'); btn.dataset.label = s ? s.textContent : btn.textContent; }
      btn.classList.add('is-busy'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      if (text) setBtnText(btn, text);
    } else {
      btn.classList.remove('is-busy'); btn.disabled = false; btn.removeAttribute('aria-busy');
      if (btn.dataset.label) { setBtnText(btn, btn.dataset.label); delete btn.dataset.label; }
    }
  }
  function store(kind) {
    try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch (_) { return null; }
  }
  function readJSON(kind, key) {
    try { var s = store(kind); var v = s && s.getItem(key); return v ? JSON.parse(v) : null; } catch (_) { return null; }
  }
  function writeJSON(kind, key, val) {
    try { var s = store(kind); if (!s) return; if (val == null) s.removeItem(key); else s.setItem(key, JSON.stringify(val)); } catch (_) { /* storage blocked */ }
  }

  /* ---------- Dates (shown in Gulf time, like the backend's from/to filter) ---------- */
  function makeDTF(opts) {
    try { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'Asia/Dubai' }, opts)); }
    catch (_) { return new Intl.DateTimeFormat('en-GB', opts); }
  }
  var DTF_DATE = makeDTF({ day: 'numeric', month: 'short', year: 'numeric' });
  var DTF_TIME = makeDTF({ hour: '2-digit', minute: '2-digit', hour12: false });
  var DTF_ISO = makeDTF({ year: 'numeric', month: '2-digit', day: '2-digit' });
  function parseDate(s) { var d = new Date(str(s)); return isNaN(d.getTime()) ? null : d; }
  function fmtDate(s) { var d = parseDate(s); return d ? DTF_DATE.format(d) : ''; }
  function fmtTime(s) { var d = parseDate(s); return d ? DTF_TIME.format(d) : ''; }
  function fmtDateTime(s) { var d = parseDate(s); return d ? DTF_DATE.format(d) + ', ' + DTF_TIME.format(d) : '—'; }
  function gulfISODate(d) {
    var p = {}; DTF_ISO.formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function fmtPosted(s) {
    s = str(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
    var d = new Date(s + 'T12:00:00Z');
    return isNaN(d.getTime()) ? s : DTF_DATE.format(d);
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n <= 0) return '';
    if (n < 1024) return n + ' bytes';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ---------- Data cleaning ---------- */
  var ROW_FIELDS = ['id', 'ref', 'created', 'updated', 'name', 'email', 'phone', 'nationality', 'nationalityName', 'position',
    'kind', 'experience', 'location', 'message', 'lang', 'cvName', 'cvType', 'status', 'notes', 'source'];
  function cleanRow(r) {
    if (!r || typeof r !== 'object') return null;
    var o = {};
    ROW_FIELDS.forEach(function (k) { o[k] = str(r[k], k === 'message' || k === 'notes' ? 20000 : 2000); });
    o.cvSize = Number(r.cvSize) > 0 ? Number(r.cvSize) : 0;
    o.nationality = o.nationality.toUpperCase();
    return o.id ? o : null;
  }
  function cleanJob(j) {
    if (!j || typeof j !== 'object') return null;
    var o = {
      id: str(j.id, 200), title: str(j.title, 300), category: str(j.category, 200), positions: toInt(j.positions, 1),
      location: str(j.location, 300), type: str(j.type, 200), posted: str(j.posted, 40), summary: str(j.summary, 5000),
      requirements: arr(j.requirements).map(function (x) { return str(x, 1000); }).filter(Boolean),
      open: j.open === true || j.open === 'true', example: j.example === true || j.example === 'true'
    };
    return o;
  }

  /* Links in a name are the mark of the spam that flooded the old panel */
  var LINK_RE = /(?:https?:\/\/|ftp:\/\/|www\.|\[url|<a\s|href\s*=|\b[a-z0-9-]{2,}\.(?:com|net|org|info|biz|ru|xyz|top|site|online|club|shop|store|link|click|live|io|co|me|tk|ml|ga|cf|gq|pw|cn|su|vip|win|bid|loan|work|space|website|fun|icu|buzz|cc|ws|ly|gd|to|life|pro|app|dev)\b(?:[\/?#:]|\s|$))/i;
  function hasLink(s) { return LINK_RE.test(str(s)); }
  /* A real applicant's message may hold a LinkedIn link, an email address or a company name like
     Emirates.com, so the message only counts as spam with link code or 2 or more links that are not LinkedIn */
  function isLinkedIn(u) {
    var host = u.replace(/^https?:\/\//i, '').split(/[\/?#:]/)[0];
    return /(^|\.)linkedin\.com$/i.test(host);
  }
  function msgSpam(m) {
    m = str(m);
    if (/\[url|<a\s|href\s*=/i.test(m)) return true;
    return (m.match(/(?:https?:\/\/|www\.)\S*/gi) || []).filter(function (u) { return !isLinkedIn(u); }).length >= 2;
  }
  function isSpam(r) { return hasLink(r.name) || msgSpam(r.message); }

  function flag(code) {
    if (!/^[A-Z]{2}$/.test(code)) return '';
    return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65);
  }
  /* Windows draws flag emoji as two grey letters: there the code is shown in a small box instead,
     the same test and look as the country picker */
  var flagOK = null;
  function canFlag() {
    if (flagOK !== null) return flagOK;
    flagOK = true;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 24;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.textBaseline = 'top';
      x.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      x.fillText(flag('AE'), 0, 0);
      var d = x.getImageData(0, 0, 24, 24).data, colour = false;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 100 && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i + 1] - d[i + 2]) > 40)) { colour = true; break; }
      }
      flagOK = colour;
    } catch (_) { flagOK = true; }
    return flagOK;
  }
  function flagEl(code) {
    if (!/^[A-Z]{2}$/.test(code)) return null;
    return canFlag() ? h('span', { class: 'flag', 'aria-hidden': 'true' }, flag(code)) : h('span', { class: 'flag-code', 'aria-hidden': 'true' }, code);
  }
  function natName(r) { return r.nationalityName || COUNTRY_NAME.get(r.nationality) || r.nationality || ''; }
  function statusLabel(v) { return STATUS_LABEL.get(v) || (v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Unknown'); }
  function kindLabel(v) { return KIND_LABEL.get(v) || v || '—'; }

  var EMAIL_RE = /^[A-Za-z0-9._+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
  function mailHref(e) { e = str(e).trim(); return e.length <= 254 && EMAIL_RE.test(e) ? 'mailto:' + e : null; }
  function telHref(p) {
    p = str(p).trim();
    if (!/^[0-9 +()\-.]{6,40}$/.test(p)) return null;
    var lead = p.replace(/^\s+/, '').charAt(0) === '+' ? '+' : '';
    var digits = p.replace(/\D/g, '');
    return digits.length >= 6 && digits.length <= 16 ? 'tel:' + lead + digits : null;
  }

  /* ---------- Transport (API.md) ---------- */
  function ApiError(code, message, fields) {
    this.code = code; this.message = message; this.fields = fields && typeof fields === 'object' ? fields : null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  /* The backend's own message is shown (it is written for this UI), except for an ended session,
     which always reads the same. These are the fallbacks when it sends none. */
  var FALLBACK = {
    bad_login: 'Wrong username or password.',
    locked: 'Too many wrong tries. Logging in is locked for 15 minutes, please try again later.',
    not_found: 'That item no longer exists. Someone may have deleted it already.',
    rate_limited: 'Too many requests in a short time. Please wait a minute and try again.',
    invalid: 'Please check the highlighted fields.',
    bad_request: 'The server did not accept the request. Please reload the page and try again.'
  };
  function friendly(code, msg) {
    if (code === 'auth') return SESSION_ENDED;
    var m = typeof msg === 'string' && msg.trim() ? clip(msg.trim(), 300) : '';
    return m || FALLBACK[code] || 'Something went wrong on the server. Please try again.';
  }

  function api(action, fields, timeout) {
    var body = Object.assign({ action: action }, fields || {});
    if (action !== 'login') {
      if (!state.session || sessionExpired(state.session)) { sessionLost(); return Promise.reject(new ApiError('auth', SESSION_ENDED)); }
      body.token = state.session.token;
    }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, timeout || T_NORMAL);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) { return res.text(); }).then(function (text) {
      clearTimeout(timer);
      if (timedOut) throw new ApiError('timeout', 'The server took too long to answer. Please try again.');
      var data;
      try { data = JSON.parse(text); } catch (_) { data = null; }
      if (!data || typeof data !== 'object') throw new ApiError('server', 'The server sent an answer the panel could not read. Please try again in a minute.');
      if (data.ok !== true) {
        var code = typeof data.error === 'string' ? data.error : 'server';
        if (code === 'auth' && action !== 'login') sessionLost();
        throw new ApiError(code, friendly(code, data.message), data.fields);
      }
      return data;
    }, function (err) {
      clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      if (timedOut) throw new ApiError('timeout', 'The server took too long to answer. Please try again.');
      throw new ApiError('network', 'Could not reach the server. Check the internet connection and try again.');
    });
  }

  /* ---------- Session ---------- */
  function sessionExpired(s) {
    var t = Date.parse(s && s.expires);
    return isFinite(t) && t <= Date.now();
  }
  function readSession() {
    var s = readJSON('session', SESSION_KEY);
    if (!s || typeof s.token !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(s.token)) return null;
    return { token: s.token, expires: str(s.expires, 64), user: str(s.user, 64), last: Number(s.last) || 0 };
  }
  function saveSession(s) { writeJSON('session', SESSION_KEY, s); }
  /* Idle logout: "last" is the time of the last pointer, key or wheel use, saved with the session
     at most once a minute. A session with no time saved counts as idle. */
  function isIdle(s) { var l = Number(s && s.last); return !(l > 0) || Date.now() - l > IDLE_MS; }
  function touch() {
    var s = state.session;
    if (!s || state.authLost) return;
    if (isIdle(s)) { idleOut(); return; }
    s.last = Date.now();
    if (s.last - state.activeSaved >= 60000) { state.activeSaved = s.last; saveSession(s); }
  }
  function idleOut() {
    if (!state.session) return;
    api('logout', {}).catch(function () { /* ignore */ });
    resetApp();
    showLogin(IDLE_ENDED, 'warn');
  }
  function armExpiry() {
    clearTimeout(state.expiryTimer);
    var t = Date.parse(state.session && state.session.expires);
    if (!isFinite(t)) return;
    var ms = Math.min(t - Date.now(), 0x7FFFFFFF);
    if (ms <= 0) { sessionLost(); return; }
    state.expiryTimer = setTimeout(function () { sessionLost(); }, ms);
  }
  function sessionLost() {
    if (state.authLost || !state.session) return;
    state.authLost = true;
    resetApp();
    showLogin(SESSION_ENDED, 'warn');
  }
  function resetApp() {
    clearTimeout(state.expiryTimer);
    clearInterval(state.idleTimer);
    state.session = null;
    saveSession(null);
    revokeAll();
    if (confirmResolve) confirmDone(false);
    closeAllDialogs(true);
    state.rows = []; state.total = 0; state.facets = null; state.loadedOnce = false; state.jobs = null; state.jobsLoading = null;
    state.selected.clear(); state.seq++;
    state.filter = Object.assign({}, EMPTY_FILTER); state.page = 1;
    syncFilterInputs();
    $('cv-tbody').textContent = ''; $('jobs-tbody').textContent = '';
    $('pw-form').reset(); $('add-form').reset(); clearErrors($('add-form')); clearErrors($('pw-form'));
    $('add-done').hidden = true; $('pw-done').hidden = true;
    resetFile();
    setMenu(false);
  }

  /* ---------- Screens ---------- */
  function showScreen(id) {
    ['scr-boot', 'scr-offline', 'scr-login', 'scr-app'].forEach(function (s) { $(s).hidden = s !== id; });
  }
  function showLogin(note, tone) {
    showScreen('scr-login');
    document.title = 'Log in · SAA Admin';
    var n = $('login-notice');
    n.textContent = note || '';
    n.className = 'notice' + (tone === 'warn' ? ' warn' : '');
    n.hidden = !note;
    $('login-err').hidden = true;
    $('login-pass').value = '';
    var u = $('login-user');
    setTimeout(function () { (u.value ? $('login-pass') : u).focus(); }, 30);
  }
  function enterApp() {
    state.authLost = false;
    showScreen('scr-app');
    var user = state.session.user || 'admin';
    $('who').textContent = user; $('who-chip').textContent = user; $('pw-user').value = user;
    var t = Date.parse(state.session.expires);
    $('who-until').textContent = isFinite(t) ? 'Session ends at ' + DTF_TIME.format(new Date(t)) : '';
    armExpiry();
    clearInterval(state.idleTimer);
    state.idleTimer = setInterval(function () { if (state.session && isIdle(state.session)) idleOut(); }, 30000);
    route(false);
    if (!state.loadedOnce && currentRoute() !== 'cvs') loadApps();
    loadJobs();
  }

  /* ---------- Router ---------- */
  var ROUTES = { 'cvs': 'v-cvs', 'add-cv': 'v-add-cv', 'add-emiratisation': 'v-add-cv', 'jobs': 'v-jobs', 'jobs/new': 'v-jobs', 'password': 'v-password' };
  var TITLES = { 'cvs': 'CVs', 'add-cv': 'Add CV', 'add-emiratisation': 'Add Emiratisation CV', 'jobs': 'Jobs', 'jobs/new': 'Add a job', 'password': 'Change password' };
  function currentRoute() {
    var r = location.hash.replace(/^#\/?/, '');
    return Object.prototype.hasOwnProperty.call(ROUTES, r) ? r : 'cvs';
  }
  function route(fromUser) {
    if (!state.session) return;
    var r = currentRoute();
    var viewId = ROUTES[r];
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== viewId; });
    var navKey = r.replace('/', '-');
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.dataset.nav === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = TITLES[r] + ' · SAA Admin';
    setMenu(false);
    if (r === 'cvs') { if (!state.loadedOnce || state.appsStale) loadApps(); }
    else if (r === 'add-cv' || r === 'add-emiratisation') { enterAdd(r === 'add-emiratisation'); }
    else if (r === 'jobs' || r === 'jobs/new') { loadJobs(); if (r === 'jobs/new') openJobForm(null); }
    else if (r === 'password') { $('pw-done').hidden = true; }
    if (fromUser) {
      window.scrollTo(0, 0);
      var h1 = document.querySelector('#' + viewId + ' .view-title');
      if (h1 && r !== 'jobs/new') { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }

  /* ---------- Mobile menu ---------- */
  function setMenu(open) {
    var side = $('side'), btn = $('menu-btn');
    side.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.querySelector('span').textContent = open ? 'Close' : 'Menu';
    btn.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
  }

  /* ---------- Toasts ---------- */
  function toast(msg, tone, action) {
    var box = $('toasts');
    var t = h('div', { class: 'toast' + (tone === 'err' ? ' err' : ''), role: tone === 'err' ? 'alert' : 'status' },
      icon(tone === 'err' ? 'alert' : 'check'), h('span', null, msg));
    if (action) t.querySelector('span').append(' ', action);
    var x = h('button', { type: 'button', class: 'x', 'aria-label': 'Dismiss' }, icon('x'));
    var kill = function () { t.remove(); };
    x.addEventListener('click', kill);
    t.append(x);
    box.append(t);
    while (box.children.length > 4) box.firstElementChild.remove();
    setTimeout(kill, tone === 'err' ? 9000 : action ? 15000 : 5000);
  }

  /* ---------- Dialogs ---------- */
  function openDialog(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
    else d.setAttribute('open', '');
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') { if (d.open) d.close(); }
    else d.removeAttribute('open');
  }
  function closeAllDialogs(force) {
    if (force) { state.notesDirty = false; }
    ['dlg-confirm', 'dlg-cv', 'dlg-job'].forEach(function (id) { closeDialog($(id)); });
  }
  /* A click on the dimmed backdrop (outside the panel) closes it */
  function onBackdrop(d, fn) {
    d.addEventListener('mousedown', function (e) {
      if (e.target !== d) return;
      var r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fn();
    });
  }

  var confirmResolve = null;
  function confirmBox(o) {
    var d = $('dlg-confirm');
    if (typeof d.showModal !== 'function') return Promise.resolve(window.confirm(o.title + '\n\n' + o.text));
    if (confirmResolve) confirmResolve(false);
    $('confirm-title').textContent = o.title;
    $('confirm-text').textContent = o.text;
    var sub = $('confirm-sub');
    sub.textContent = o.sub || ''; sub.hidden = !o.sub;
    var ok = $('confirm-ok');
    ok.textContent = o.ok || 'Delete';
    ok.className = 'btn ' + (o.danger === false ? '' : 'btn-danger');
    d.querySelector('.confirm-icon use').setAttribute('href', '#i-' + (o.icon || 'trash'));
    d.querySelector('.confirm-icon').style.display = o.icon === 'none' ? 'none' : '';
    openDialog(d);
    $('confirm-cancel').focus();
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }
  function confirmDone(v) {
    var r = confirmResolve; confirmResolve = null;
    closeDialog($('dlg-confirm'));
    if (r) r(v);
  }

  /* ---------- Blob URLs (revoked after use) ---------- */
  var blobs = new Set();
  function blobUrl(blob, ttl) {
    var u = URL.createObjectURL(blob);
    blobs.add(u);
    setTimeout(function () { revoke(u); }, ttl);
    return u;
  }
  function revoke(u) { if (blobs.delete(u)) URL.revokeObjectURL(u); }
  function revokeAll() { blobs.forEach(function (u) { URL.revokeObjectURL(u); }); blobs.clear(); }
  function saveFile(blob, name) {
    var u = blobUrl(blob, 15000);
    var a = h('a', { href: u, download: name, rel: 'noopener' });
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
  }

  /* ---------- CV files ---------- */
  function b64ToBytes(b64) {
    var s = str(b64, 60 * 1024 * 1024).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s)) throw new ApiError('server', 'The CV file could not be read.');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(s), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /* The type comes from the file's own first bytes, never from the stored name or type */
  function sniff(b) {
    function at(sig) { for (var i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false; return b.length >= sig.length; }
    if (at([0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', ext: 'pdf', view: true };
    if (at([0xFF, 0xD8, 0xFF])) return { mime: 'image/jpeg', ext: 'jpg', view: true };
    if (at([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return { mime: 'image/png', ext: 'png', view: true };
    if (at([0xD0, 0xCF, 0x11, 0xE0])) return { mime: 'application/msword', ext: 'doc', view: false };
    if (at([0x50, 0x4B, 0x03, 0x04])) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', view: false };
    return { mime: 'application/octet-stream', ext: '', view: false };
  }
  function extOf(name) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(str(name)); return m ? m[1].toLowerCase() : ''; }
  /* The saved name keeps the stored name's words, with the extension of what the bytes really are */
  function safeName(name, ext, ref) {
    var base = str(name, 300).replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '')
      .replace(/[\u0000-\u001F\u007F<>:"|?*\\/]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!base) base = 'CV ' + (str(ref).replace(/[^A-Za-z0-9-]/g, '') || 'file');
    return base + '.' + ext;
  }
  function viewCv(row, btn) {
    if (!row.cvName) { toast('This application has no CV file.', 'err'); return; }
    var guess = extOf(row.cvName);
    var win = null;
    /* A browser set to download PDFs (or with no PDF viewer) gets the file with its proper name instead of a tab */
    var noPdf = navigator.pdfViewerEnabled === false;
    /* Open the tab now, inside the click, so pop-up blockers allow it; the CV loads into it after the fetch */
    if ((guess === 'pdf' && !noPdf) || guess === 'jpg' || guess === 'jpeg' || guess === 'png') {
      try {
        win = window.open('', '_blank');
        if (win) {
          win.opener = null;
          var doc = win.document;
          doc.title = 'Loading CV…';
          var p = doc.createElement('p');
          p.textContent = 'Loading the CV…';
          p.style.cssText = 'font:16px/1.5 system-ui,sans-serif;color:#192E49;padding:32px';
          doc.body.append(p);
        }
      } catch (_) { win = null; }
    }
    busy(btn, true);
    api('cv', { id: row.id }).then(function (d) {
      var bytes = b64ToBytes(d.data);
      if (!bytes.length) throw new ApiError('server', 'The CV file is empty.');
      var t = sniff(bytes);
      var name = safeName(d.name || row.cvName, t.ext || 'bin', row.ref);
      if (t.view && !(t.ext === 'pdf' && noPdf)) {
        var url = blobUrl(new Blob([bytes], { type: t.mime }), 120000);
        if (win && !win.closed) { win.location.replace(url); return; }
        var w2 = window.open(url, '_blank');
        if (w2) { try { w2.opener = null; } catch (_) { /* ignore */ } return; }
        toast('The browser blocked the new tab.', 'ok', h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Open the CV'));
      } else {
        if (win) win.close();
        /* Word, anything unknown, and PDFs the browser cannot show: download, never render */
        saveFile(new Blob([bytes], { type: t.ext ? t.mime : 'application/octet-stream' }), name);
        if (t.ext) toast('Downloading ' + name);
        else toast('This file is not a real PDF, Word or image file, so it was saved as ' + name + ' and not opened. Treat it with care.', 'err');
      }
    }).catch(function (e) {
      if (win) { try { win.close(); } catch (_) { /* ignore */ } }
      if (e.code !== 'auth') toast(e.message || 'The CV could not be opened.', 'err');
    }).then(function () { busy(btn, false); });
  }

  /* ---------- Country pickers ---------- */
  function makePicker(host, opts) {
    var P = window.SAACountryPicker;
    if (P && typeof P.create === 'function') {
      try { return P.create(host, opts); } catch (_) { /* fall back to a plain list */ }
    }
    return plainPicker(host, opts);
  }
  /* Used only if country-picker.js did not load: a plain select with every country */
  function plainPicker(host, o) {
    var s = h('select', { id: o.id, name: o.name, required: o.required ? true : null });
    s.append(h('option', { value: '' }, o.allowAll ? (o.allLabel || 'All') : (o.placeholder || 'Choose')));
    COUNTRIES.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
      s.append(h('option', { value: c.code }, flag(c.code) + ' ' + c.name));
    });
    s.value = o.value || '';
    s.addEventListener('change', function () { if (o.onChange) o.onChange(s.value); });
    host.append(s);
    return { el: s, get value() { return s.value; }, setValue: function (c) { s.value = c || ''; }, focus: function () { s.focus(); }, destroy: function () { s.remove(); } };
  }
  function pickerValue(p) { try { return str(p && p.value).toUpperCase(); } catch (_) { return ''; } }
  function pickerSet(p, v) { try { if (p) p.setValue(v || ''); } catch (_) { /* ignore */ } }
  function pickerFocus(p) { try { if (p) p.focus(); } catch (_) { /* ignore */ } }

  /* =====================================================================
     CVs
     ===================================================================== */
  function filtersActive() {
    return Object.keys(state.filter).filter(function (k) { return !!state.filter[k]; }).length;
  }
  function appsRequest(page, pageSize) {
    var f = {};
    Object.keys(state.filter).forEach(function (k) { if (state.filter[k]) f[k] = state.filter[k]; });
    return { filter: f, page: page, pageSize: pageSize, sort: state.sort };
  }
  function setFilter(key, val) {
    if (state.filter[key] === val) return;
    state.filter[key] = val;
    state.page = 1;
    syncFilterInputs();
    loadApps();
  }
  function syncFilterInputs() {
    var f = state.filter;
    if ($('f-q').value.trim() !== f.q) $('f-q').value = f.q;
    setSelect($('f-position'), f.position);
    $('f-kind').value = f.kind;
    setSelect($('f-status'), f.status);
    $('f-from').value = f.from; $('f-to').value = f.to;
    $('f-to').min = f.from || ''; $('f-from').max = f.to || '';
    if (pickerValue(state.pickers.nat) !== f.nationality) pickerSet(state.pickers.nat, f.nationality);
    var n = filtersActive();
    var moreCount = n - (f.q ? 1 : 0);
    $('filters-count').textContent = String(moreCount);
    $('filters-count').hidden = moreCount === 0;
    $('f-clear').disabled = n === 0;
    renderPills();
  }
  function setSelect(sel, v) {
    if (v && !Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) {
      sel.append(h('option', { value: v }, v));
    }
    sel.value = v;
  }

  function loadApps() {
    var seq = ++state.seq;
    state.appsStale = false;
    var table = $('cv-table');
    if (!state.loadedOnce) skeleton(); else table.classList.add('is-loading');
    table.setAttribute('aria-busy', 'true');
    $('cv-state').hidden = true;
    if (!state.loadedOnce) $('cvs-count').textContent = 'Loading CVs…';
    return api('apps', appsRequest(state.page, state.pageSize)).then(function (d) {
      if (seq !== state.seq) return;
      state.total = Math.max(0, toInt(d.total));
      state.rows = arr(d.rows).map(cleanRow).filter(Boolean);
      state.facets = d.facets && typeof d.facets === 'object' ? d.facets : state.facets;
      var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page > pages && state.total > 0) { state.page = pages; loadApps(); return; }
      state.loadedOnce = true;
      state.selected.clear();
      renderFacets();
      renderRows();
    }).catch(function (e) {
      if (seq !== state.seq || e.code === 'auth') return;
      listError(e);
    }).then(function () {
      if (seq !== state.seq) return;
      table.classList.remove('is-loading');
      table.removeAttribute('aria-busy');
    });
  }

  function skeleton() {
    var tb = $('cv-tbody');
    tb.textContent = '';
    for (var i = 0; i < 6; i++) {
      var tr = h('tr', { class: 'skel', 'aria-hidden': 'true' });
      for (var c = 0; c < 11; c++) tr.append(h('td', null, h('span')));
      tb.append(tr);
    }
    $('cv-pager').hidden = true;
  }

  function listError(e) {
    $('cv-tbody').textContent = '';
    $('cv-pager').hidden = true;
    $('spam-hint').hidden = true;
    $('cvs-count').textContent = '';
    var st = $('cv-state');
    st.className = 'state err';
    st.textContent = '';
    st.append(icon('alert'), h('strong', null, 'The CVs could not be loaded'), h('span', null, e.message),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { loadApps(); } }, icon('refresh'), h('span', null, 'Try again')));
    st.hidden = false;
  }

  function renderRows() {
    var tb = $('cv-tbody');
    tb.textContent = '';
    var st = $('cv-state');
    var start = (state.page - 1) * state.pageSize;
    var n = filtersActive();
    var countEl = $('cvs-count');
    countEl.textContent = '';
    if (state.total === 0) {
      countEl.append(n ? 'No CVs match the filters' : 'No CVs yet');
    } else {
      countEl.append(h('strong', null, fmtNum(state.total)), ' ', state.total === 1 ? 'CV' : 'CVs', n ? ' match the filters' : ' in total');
    }
    if (!state.rows.length) {
      st.className = 'state';
      st.textContent = '';
      if (n) {
        st.append(icon('search'), h('strong', null, 'No CVs match these filters'), h('span', null, 'Try a different position, nationality or date, or clear the filters.'),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: clearFilters }, icon('x'), h('span', null, 'Clear filters')));
      } else {
        st.append(icon('cvs'), h('strong', null, 'No CVs yet'), h('span', null, 'Applications sent from the careers page will appear here.'),
          h('a', { class: 'btn btn-sm', href: '#/add-cv' }, icon('plus'), h('span', null, 'Add a CV by hand')));
      }
      st.hidden = false;
      $('cv-table').querySelector('thead').hidden = true;
    } else {
      st.hidden = true;
      $('cv-table').querySelector('thead').hidden = false;
      var frag = document.createDocumentFragment();
      state.rows.forEach(function (r, i) { frag.append(cvRow(r, start + i + 1)); });
      tb.append(frag);
    }
    renderSpamHint();
    renderSelection();
    renderPager();
  }

  function cvRow(r, num) {
    var spam = isSpam(r);
    var tr = h('tr', { class: spam ? 'is-spam' : null });
    tr.dataset.id = r.id;

    var chk = h('input', { type: 'checkbox', 'aria-label': 'Select ' + (r.ref || 'this CV') + (r.name ? ', ' + clip(r.name, 60) : '') });
    chk.checked = state.selected.has(r.id);
    chk.addEventListener('change', function () { toggleSelect(r.id, chk.checked); });
    var numTd = h('td', { class: 'num-cell' }, h('label', { class: 'chk' }, chk), h('span', null, String(num)));
    numTd.dataset.ref = r.ref;
    tr.append(numTd);

    tr.append(h('td', { class: 'c-ref' }, refEl(r.ref),
      r.source === 'admin' ? h('span', { class: 'src' }, 'Added by team') : null));

    tr.append(h('td', { class: 'date' }, fmtDate(r.created) || '—', h('small', null, fmtTime(r.created))));

    var tags = h('div', { class: 'tags' });
    if (spam) tags.append(h('span', { class: 'tag tag-spam', title: 'A link in the name, or several links or link code in the message' }, icon('alert'), 'Possible spam'));
    if (r.source === 'admin') tags.append(h('span', { class: 'tag tag-admin' }, 'Added by team'));
    tr.append(h('td', { class: 'name-cell' }, h('div', { class: 'nm', title: r.name.length > 60 ? clip(r.name, 300) : null }, r.name || '(no name)'), tags));

    tr.append(contactCell(r));

    var nn = natName(r);
    tr.append(labelled('Nationality', 'nat-cell',
      nn ? h('span', { class: 'nat' }, flagEl(r.nationality), h('span', null, nn)) : h('span', { class: 'muted' }, '—')));
    var pc = labelled('Position', 'pos-cell', shortRole(r.position) || '—');
    if (r.position === ROLE_EMIRATI) pc.title = r.position;
    tr.append(pc);
    tr.append(labelled('Type', 'kind-cell', h('span', { class: 'kind kind-' + (KIND_LABEL.has(r.kind) ? r.kind : 'general') }, kindLabel(r.kind))));
    tr.append(labelled('Experience', 'exp-cell', r.experience || '—'));
    tr.append(labelled('Status', 'c-status', statusSelect(r)));

    var who = r.name ? clip(r.name, 50) : r.ref;
    var viewBtn = h('button', { type: 'button', class: 'icon-btn', title: r.cvName ? 'View CV' : 'No CV file', 'aria-label': 'View CV of ' + who, disabled: r.cvName ? null : true },
      icon(isWord(r.cvName) ? 'download' : 'eye'), h('span', { class: 'act-txt' }, 'View CV'));
    viewBtn.addEventListener('click', function () { viewCv(r, viewBtn); });
    var detBtn = h('button', { type: 'button', class: 'icon-btn', title: 'Details', 'aria-label': 'Details of ' + who }, icon('details'), h('span', { class: 'act-txt' }, 'Details'));
    detBtn.addEventListener('click', function () { openDetails(r, detBtn); });
    var delBtn = h('button', { type: 'button', class: 'icon-btn danger', title: 'Delete', 'aria-label': 'Delete ' + who }, icon('trash'), h('span', { class: 'act-txt' }, 'Delete'));
    delBtn.addEventListener('click', function () { deleteOne(r, delBtn); });
    tr.append(h('td', { class: 'c-act' }, h('div', { class: 'act' }, viewBtn, detBtn, delBtn)));
    return tr;
  }
  function isWord(n) { var e = extOf(n); return e === 'doc' || e === 'docx'; }
  /* "SAA-2026-000123" may wrap after its second dash, never inside a part */
  function refEl(ref) {
    var el = h('span', { class: 'ref' });
    if (!ref) { el.textContent = '—'; return el; }
    var i = ref.lastIndexOf('-');
    if (i > 0 && i < ref.length - 1) el.append(h('span', null, ref.slice(0, i + 1)), h('wbr'), h('span', null, ref.slice(i + 1)));
    else el.append(h('span', null, ref));
    return el;
  }
  /* An email address may wrap after its @ and before a dot, not in the middle of a word */
  function breakable(s) {
    var frag = document.createDocumentFragment(), buf = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '.' && buf) { frag.append(buf, h('wbr')); buf = ''; }
      buf += ch;
      if (ch === '@') { frag.append(buf, h('wbr')); buf = ''; }
    }
    if (buf) frag.append(buf);
    return frag;
  }
  function shortRole(p) { return p === ROLE_EMIRATI ? 'Emiratisation registration' : p; }

  /* A cell with a label for the phone card layout; its content sits in one .v box */
  function labelled(label, cls) {
    var v = h('div', { class: 'v' });
    for (var i = 2; i < arguments.length; i++) append(v, arguments[i]);
    return h('td', { 'data-label': label, class: cls }, v);
  }
  function contactCell(r) {
    var cell = labelled('Contact', 'contact-cell'), td = cell.firstChild;
    var tel = telHref(r.phone), mail = mailHref(r.email);
    if (r.phone) td.append(tel ? h('a', { class: 'ph', href: tel }, r.phone) : h('span', { class: 'plain ph' }, r.phone));
    if (r.email) td.append(mail ? h('a', { class: 'em', href: mail }, breakable(r.email)) : h('span', { class: 'plain em' }, breakable(r.email)));
    if (!r.phone && !r.email) td.append(h('span', { class: 'muted' }, '—'));
    return cell;
  }

  function statusSelect(row) {
    var known = STATUS_LABEL.has(row.status);
    var s = h('select', { class: 'st st-' + (known ? row.status : 'unknown'), 'aria-label': 'Status of ' + (row.name ? clip(row.name, 60) : row.ref) });
    s.dataset.id = row.id;
    if (!known) s.append(h('option', { value: row.status }, statusLabel(row.status)));
    STATUSES.forEach(function (x) { s.append(h('option', { value: x[0] }, x[1])); });
    s.value = row.status;
    s.addEventListener('change', function () { changeStatus(row, s.value); });
    return s;
  }
  function syncStatus(id, status, disabled) {
    document.querySelectorAll('select.st').forEach(function (s) {
      if (s.dataset.id !== id) return;
      s.value = status;
      s.className = 'st st-' + (STATUS_LABEL.has(status) ? status : 'unknown');
      s.disabled = !!disabled;
    });
  }
  function changeStatus(row, next) {
    var prev = row.status;
    if (prev === next) return;
    syncStatus(row.id, next, true);
    api('updateApp', { id: row.id, status: next }).then(function (d) {
      var nr = cleanRow(d.row);
      if (nr && nr.id === row.id) Object.assign(row, nr); else row.status = next;
      bumpFacet(prev, row.status);
      toast(statusLabel(row.status) + ': ' + (row.name ? clip(row.name, 60) : row.ref));
      if (state.drawerRow === row) $('cvd-updated') && ($('cvd-updated').textContent = fmtDateTime(row.updated));
    }).catch(function (e) {
      row.status = prev;
      if (e.code !== 'auth') toast('The status was not changed. ' + e.message, 'err');
    }).then(function () { syncStatus(row.id, row.status, false); });
  }
  function bumpFacet(from, to) {
    var f = state.facets && arr(state.facets.statuses);
    if (!f || !f.length) return;
    var a = f.find(function (x) { return x && x.value === from; }), b = f.find(function (x) { return x && x.value === to; });
    if (a) a.count = Math.max(0, toInt(a.count) - 1);
    if (b) b.count = toInt(b.count) + 1; else f.push({ value: to, count: 1 });
    renderPills();
  }

  /* ----- Facets: position options, type and status counts, quick status pills ----- */
  function facetMap(list, key) {
    var m = new Map();
    arr(list).forEach(function (x) { if (x && typeof x === 'object') m.set(str(x[key || 'value'], 300), toInt(x.count)); });
    return m;
  }
  function renderFacets() {
    var fc = state.facets || {};
    renderPositionOptions();
    var kinds = facetMap(fc.kinds), sts = facetMap(fc.statuses);
    var ks = $('f-kind');
    Array.prototype.forEach.call(ks.options, function (o) {
      if (!o.value) return;
      o.textContent = kindLabel(o.value) + (kinds.has(o.value) ? ' (' + fmtNum(kinds.get(o.value)) + ')' : '');
    });
    var ss = $('f-status');
    Array.prototype.forEach.call(ss.options, function (o) {
      if (!o.value) return;
      o.textContent = statusLabel(o.value) + (sts.has(o.value) ? ' (' + fmtNum(sts.get(o.value)) + ')' : '');
    });
    renderPills();
  }
  function renderPositionOptions() {
    var sel = $('f-position');
    var cur = state.filter.position;
    var counts = facetMap(state.facets && state.facets.positions);
    var openTitles = arr(state.jobs).filter(function (j) { return j.open && j.title; }).map(function (j) { return j.title; });
    var seen = new Set();
    sel.textContent = '';
    sel.append(h('option', { value: '' }, 'All positions'));
    var label = function (v) { return v + (counts.has(v) ? ' (' + fmtNum(counts.get(v)) + ')' : ''); };
    if (openTitles.length) {
      var g1 = h('optgroup', { label: 'Open jobs' });
      openTitles.forEach(function (t) { if (seen.has(t)) return; seen.add(t); g1.append(h('option', { value: t }, label(t))); });
      sel.append(g1);
    }
    var rest = Array.from(counts.keys()).filter(function (v) { return v && !seen.has(v); });
    rest.sort(function (a, b) { return (counts.get(b) - counts.get(a)) || a.localeCompare(b); });
    if (rest.length) {
      var g2 = h('optgroup', { label: openTitles.length ? 'Other positions in the CVs' : 'Positions in the CVs' });
      rest.forEach(function (t) { seen.add(t); g2.append(h('option', { value: t }, label(clip(t, 90)))); });
      sel.append(g2);
    }
    setSelect(sel, cur);
  }
  function renderPills() {
    var box = $('stat-pills');
    var sts = facetMap(state.facets && state.facets.statuses);
    box.textContent = '';
    if (!state.facets) return;
    var total = 0; sts.forEach(function (c) { total += c; });
    var mk = function (value, label, count, cls) {
      var b = h('button', { type: 'button', class: 'pill ' + cls, 'aria-pressed': state.filter.status === value ? 'true' : 'false' },
        h('span', { class: 'dot', 'aria-hidden': 'true' }), label, h('b', null, fmtNum(count)));
      b.addEventListener('click', function () { setFilter('status', state.filter.status === value && value ? '' : value); });
      return b;
    };
    box.append(mk('', 'All CVs', total, 'p-all'));
    STATUSES.forEach(function (s) { box.append(mk(s[0], s[1], sts.get(s[0]) || 0, 'p-' + s[0])); });
    var nw = sts.get('new') || 0;
    var badge = $('badge-new');
    badge.textContent = fmtNum(nw); badge.hidden = nw === 0;
    badge.title = plural(nw, 'new CV', 'new CVs');
  }

  /* ----- Pager ----- */
  function renderPager() {
    var nav = $('cv-pager');
    nav.textContent = '';
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.total === 0) { nav.hidden = true; return; }
    var from = (state.page - 1) * state.pageSize + 1, to = Math.min(state.total, state.page * state.pageSize);
    nav.append(h('p', { class: 'pager-info' }, 'Showing ' + fmtNum(from) + ' to ' + fmtNum(to) + ' of ' + fmtNum(state.total)));
    if (pages > 1) {
      var btns = h('div', { class: 'pager-btns' });
      var go = function (p) { return function () { if (p < 1 || p > pages || p === state.page) return; state.page = p; loadApps().then(function () { $('cv-card').scrollIntoView({ block: 'start', behavior: 'smooth' }); }); }; };
      btns.append(h('button', { type: 'button', class: 'pg', 'aria-label': 'Previous page', disabled: state.page <= 1 ? true : null, onclick: go(state.page - 1) }, icon('left')));
      pageList(state.page, pages).forEach(function (p) {
        if (p === 0) { btns.append(h('span', { class: 'pg-gap', 'aria-hidden': 'true' }, '…')); return; }
        btns.append(h('button', { type: 'button', class: 'pg', 'aria-label': 'Page ' + p, 'aria-current': p === state.page ? 'page' : null, onclick: go(p) }, String(p)));
      });
      btns.append(h('button', { type: 'button', class: 'pg', 'aria-label': 'Next page', disabled: state.page >= pages ? true : null, onclick: go(state.page + 1) }, icon('right')));
      nav.append(btns);
    }
    nav.hidden = false;
  }
  function pageList(cur, total) {
    if (total <= 7) return Array.from({ length: total }, function (_, i) { return i + 1; });
    var out = [1];
    var a = Math.max(2, cur - 1), b = Math.min(total - 1, cur + 1);
    if (cur <= 3) { a = 2; b = 4; }
    if (cur >= total - 2) { a = total - 3; b = total - 1; }
    if (a > 2) out.push(0);
    for (var i = a; i <= b; i++) out.push(i);
    if (b < total - 1) out.push(0);
    out.push(total);
    return out;
  }

  /* ----- Selection, spam, bulk delete ----- */
  function toggleSelect(id, on) {
    if (on) state.selected.add(id); else state.selected.delete(id);
    renderSelection();
  }
  function renderSelection() {
    var n = state.selected.size;
    document.querySelectorAll('#cv-tbody tr').forEach(function (tr) {
      var on = state.selected.has(tr.dataset.id);
      tr.classList.toggle('is-selected', on);
      var c = tr.querySelector('input[type="checkbox"]');
      if (c) c.checked = on;
    });
    var all = $('chk-all');
    all.checked = n > 0 && n === state.rows.length;
    all.indeterminate = n > 0 && n < state.rows.length;
    $('bulkbar').hidden = n === 0;
    $('bulk-count').textContent = plural(n, 'CV selected', 'CVs selected');
  }
  function spamRows() { return state.rows.filter(isSpam); }
  function renderSpamHint() {
    var s = spamRows();
    $('spam-hint').hidden = s.length === 0;
    $('spam-hint-text').textContent = s.length === 1
      ? '1 CV on this page looks like spam: a link in the name, or several links in the message.'
      : s.length + ' CVs on this page look like spam: a link in the name, or several links in the message.';
  }
  function deleteOne(row, trigger) {
    confirmBox({
      title: 'Delete this CV?',
      text: 'Use this for spam. The application is removed from the panel and its CV file is moved to the Drive trash.',
      sub: [clip(row.name || '(no name)', 140), row.ref].filter(Boolean).join(' · ')
    }).then(function (ok) {
      if (!ok) { if (trigger && document.contains(trigger)) trigger.focus(); return; }
      busy(trigger, true);
      api('deleteApp', { id: row.id }).then(function () {
        if (state.drawerRow && state.drawerRow.id === row.id) { state.notesDirty = false; closeDialog($('dlg-cv')); }
        toast('CV deleted' + (row.ref ? ' (' + row.ref + ')' : '') + '.');
        state.selected.delete(row.id);
        afterDelete();
      }).catch(function (e) {
        if (e.code === 'not_found') { toast('That CV was already deleted.'); afterDelete(); return; }
        if (e.code !== 'auth') toast('The CV was not deleted. ' + e.message, 'err');
      }).then(function () { if (trigger && document.contains(trigger)) busy(trigger, false); });
    });
  }
  function afterDelete() {
    var h1 = $('h-cvs');
    loadApps().then(function () {
      if (!document.activeElement || document.activeElement === document.body) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    });
  }
  function deleteSelected() {
    var rows = state.rows.filter(function (r) { return state.selected.has(r.id); });
    if (!rows.length) return;
    var names = rows.slice(0, 4).map(function (r) { return clip(r.name || r.ref || '(no name)', 60); }).join(', ') + (rows.length > 4 ? ' and ' + (rows.length - 4) + ' more' : '');
    confirmBox({
      title: rows.length === 1 ? 'Delete 1 CV?' : 'Delete ' + rows.length + ' CVs?',
      text: 'The applications are removed from the panel and their CV files are moved to the Drive trash.',
      sub: names,
      ok: rows.length === 1 ? 'Delete 1 CV' : 'Delete ' + rows.length + ' CVs'
    }).then(function (ok) {
      if (!ok) return;
      var btn = $('bulk-delete');
      busy(btn, true);
      var done = 0, failed = 0, lastErr = '';
      var step = function (i) {
        if (i >= rows.length || !state.session) return Promise.resolve();
        $('bulk-count').textContent = 'Deleting ' + (i + 1) + ' of ' + rows.length + '…';
        return api('deleteApp', { id: rows[i].id }).then(function () {
          done++;
          var tr = Array.prototype.find.call($('cv-tbody').children, function (t) { return t.dataset.id === rows[i].id; });
          if (tr) tr.classList.add('is-gone');
        }, function (e) {
          if (e.code === 'auth') throw e;
          if (e.code === 'not_found') { done++; return; }
          failed++; lastErr = e.message;
        }).then(function () { return step(i + 1); });
      };
      step(0).then(function () {
        state.selected.clear();
        toast(failed ? plural(done, 'CV deleted', 'CVs deleted') + '. ' + failed + ' could not be deleted: ' + lastErr : plural(done, 'CV deleted', 'CVs deleted') + '.', failed ? 'err' : null);
        loadApps();
      }, function () { /* session ended: the login screen is showing */ }).then(function () { busy(btn, false); });
    });
  }

  /* ----- Export CSV (every page of the current filter) ----- */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   /* stop spreadsheets reading it as a formula */
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportCsv() {
    var btn = $('btn-export');
    busy(btn, true, 'Exporting…');
    var all = [], page = 1, total = Infinity;
    var next = function () {
      if (all.length >= total || page > 200) return Promise.resolve();
      return api('apps', appsRequest(page, 1000)).then(function (d) {
        total = Math.max(0, toInt(d.total));
        var rows = arr(d.rows).map(cleanRow).filter(Boolean);
        all = all.concat(rows);
        page++;
        if (total > 1000) setBtnText(btn, 'Exporting ' + fmtNum(Math.min(all.length, total)) + ' of ' + fmtNum(total) + '…');
        if (!rows.length) total = all.length;
        return next();
      });
    };
    next().then(function () {
      if (!all.length) { toast('There are no CVs to export with these filters.'); return; }
      var head = ['Ref', 'Received (Gulf time)', 'Name', 'Email', 'Phone', 'Nationality', 'Nationality code', 'Position', 'Type', 'Experience',
        'Location', 'Status', 'Source', 'Message', 'Notes', 'CV file', 'Possible spam', 'Last updated'];
      var lines = [head.map(csvCell).join(',')];
      all.forEach(function (r) {
        var d = parseDate(r.created);
        lines.push([r.ref, d ? gulfISODate(d) + ' ' + DTF_TIME.format(d) : r.created, r.name, r.email, r.phone, natName(r), r.nationality,
          r.position, kindLabel(r.kind), r.experience, r.location, statusLabel(r.status), r.source === 'admin' ? 'Added by team' : (r.source === 'website' ? 'Website' : r.source),
          r.message, r.notes, r.cvName, isSpam(r) ? 'Yes' : '', r.updated ? fmtDateTime(r.updated) : ''].map(csvCell).join(','));
      });
      saveFile(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), 'saa-cvs-' + gulfISODate() + '.csv');
      toast('Exported ' + plural(all.length, 'CV', 'CVs') + ' to a CSV file.');
    }).catch(function (e) {
      if (e.code !== 'auth') toast('The export stopped. ' + e.message, 'err');
    }).then(function () { busy(btn, false); });
  }

  function clearFilters() {
    state.filter = Object.assign({}, EMPTY_FILTER);
    state.page = 1;
    syncFilterInputs();
    loadApps();
  }

  /* =====================================================================
     CV details drawer
     ===================================================================== */
  var detailsTrigger = null;
  function openDetails(row, trigger) {
    detailsTrigger = trigger || null;
    state.drawerRow = row;
    state.notesDirty = false;
    var spam = isSpam(row);
    $('cvd-ref').textContent = [row.ref, row.created ? 'Received ' + fmtDateTime(row.created) : ''].filter(Boolean).join(' · ');
    $('cvd-name').textContent = row.name || '(no name)';
    var tags = $('cvd-tags'); tags.textContent = '';
    tags.append(h('span', { class: 'kind kind-' + (KIND_LABEL.has(row.kind) ? row.kind : 'general') }, kindLabel(row.kind)));
    if (spam) tags.append(h('span', { class: 'tag tag-spam' }, icon('alert'), 'Possible spam'));
    if (row.source === 'admin') tags.append(h('span', { class: 'tag tag-admin' }, 'Added by team'));

    var body = $('cvd-body'); body.textContent = '';
    /* Status and quick contact */
    var quick = h('div', { class: 'd-quick' });
    var mail = mailHref(row.email), tel = telHref(row.phone);
    if (mail) quick.append(h('a', { class: 'btn btn-sm btn-ghost', href: mail }, icon('mail'), h('span', null, 'Email')));
    if (tel) quick.append(h('a', { class: 'btn btn-sm btn-ghost', href: tel }, icon('phone'), h('span', null, 'Call')));
    body.append(h('section', { class: 'd-sec' }, h('h3', { class: 'd-h' }, 'Status'),
      h('div', { class: 'd-status' }, statusSelect(row), quick)));

    if (spam) {
      body.append(h('section', { class: 'd-sec' }, h('div', { class: 'notice warn' }, icon('alert'),
        h('span', null, 'The name contains a link, or the message has several links or link code, which is how most spam looks. If this is not a real applicant, delete it.'))));
    }

    /* Every field */
    var dl = h('dl', { class: 'dl' });
    var add = function (k, v) { dl.append(h('dt', null, k), h('dd', null, v == null || v === '' ? '—' : v)); };
    add('Position', row.position);
    add('Type', kindLabel(row.kind));
    var nn = natName(row);
    add('Nationality', nn ? h('span', { class: 'nat' }, flagEl(row.nationality), h('span', null, nn)) : '');
    add('Location', row.location);
    add('Experience', row.experience);
    add('Email', row.email ? (mail ? h('a', { href: mail }, row.email) : row.email) : '');
    add('Phone', row.phone ? (tel ? h('a', { href: tel }, row.phone) : row.phone) : '');
    add('Form language', LANGS[row.lang] || row.lang);
    add('Source', row.source === 'admin' ? 'Added by the team' : row.source === 'website' ? 'Careers page' : row.source);
    add('Reference', row.ref);
    add('Received', fmtDateTime(row.created));
    var upd = h('span', { id: 'cvd-updated' }, fmtDateTime(row.updated));
    add('Last updated', upd);
    body.append(h('section', { class: 'd-sec' }, h('h3', { class: 'd-h' }, 'Details'), dl));

    /* CV file */
    var fileSec = h('section', { class: 'd-sec' }, h('h3', { class: 'd-h' }, 'CV file'));
    if (row.cvName) {
      var fbtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, icon(isWord(row.cvName) ? 'download' : 'eye'), h('span', null, isWord(row.cvName) ? 'Download' : 'Open'));
      fbtn.addEventListener('click', function () { viewCv(row, fbtn); });
      fileSec.append(h('div', { class: 'd-file' }, icon('cvs'),
        h('div', null, h('strong', null, row.cvName), h('span', null, [fileKindName(row.cvName), fmtSize(row.cvSize)].filter(Boolean).join(' · '))), fbtn));
    } else {
      fileSec.append(h('p', { class: 'muted' }, 'No CV file was attached.'));
    }
    body.append(fileSec);

    /* Message */
    body.append(h('section', { class: 'd-sec' }, h('h3', { class: 'd-h' }, 'Message from the applicant'),
      row.message ? h('div', { class: 'msg' }, row.message) : h('div', { class: 'msg empty' }, 'No message.')));

    /* Notes */
    var ta = h('textarea', { id: 'cvd-notes', rows: '4', maxlength: '2000', placeholder: 'Notes for the team, for example when you called and what was agreed' });
    ta.value = row.notes;
    var saved = h('span', { class: 'saved-note', role: 'status' });
    var save = h('button', { type: 'submit', class: 'btn btn-sm', disabled: true }, icon('check'), h('span', null, 'Save notes'));
    ta.addEventListener('input', function () { state.notesDirty = ta.value !== row.notes; save.disabled = !state.notesDirty; saved.textContent = ''; });
    var nf = h('form', { class: 'notes-form', novalidate: true },
      h('label', { class: 'd-h', for: 'cvd-notes' }, 'Team notes'), ta, h('div', { class: 'row' }, save, saved));
    nf.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = ta.value.slice(0, 2000);
      busy(save, true, 'Saving…');
      api('updateApp', { id: row.id, notes: val }).then(function (d) {
        var nr = cleanRow(d.row);
        if (nr && nr.id === row.id) Object.assign(row, nr); else row.notes = val;
        /* The server tidies spaces and blank lines: show its text, unless more was typed during the save */
        if (ta.value.slice(0, 2000) === val) ta.value = row.notes;
        state.notesDirty = ta.value !== row.notes;
        saved.textContent = 'Saved at ' + DTF_TIME.format(new Date());
        upd.textContent = fmtDateTime(row.updated);
        busy(save, false);
        save.disabled = !state.notesDirty;
      }).catch(function (e2) {
        busy(save, false);
        if (e2.code !== 'auth') { saved.textContent = ''; toast('The notes were not saved. ' + e2.message, 'err'); }
      });
    });
    body.append(h('section', { class: 'd-sec' }, nf));

    var vb = $('cvd-view');
    vb.hidden = !row.cvName;
    setBtnText(vb, isWord(row.cvName) ? 'Download CV' : 'View CV');
    vb.querySelector('use').setAttribute('href', isWord(row.cvName) ? '#i-download' : '#i-eye');
    body.scrollTop = 0;
    openDialog($('dlg-cv'));
  }
  function fileKindName(n) {
    var e = extOf(n);
    return e === 'pdf' ? 'PDF' : e === 'doc' || e === 'docx' ? 'Word document' : e === 'jpg' || e === 'jpeg' ? 'JPG image' : e === 'png' ? 'PNG image' : e.toUpperCase();
  }
  function closeDetails() {
    if (!state.notesDirty) { closeDialog($('dlg-cv')); return; }
    confirmBox({ title: 'Discard the note changes?', text: 'Your changes to the team notes have not been saved.', ok: 'Discard changes', danger: false, icon: 'alert' })
      .then(function (ok) { if (ok) { state.notesDirty = false; closeDialog($('dlg-cv')); } else { var t = $('cvd-notes'); if (t) t.focus(); } });
  }

  /* =====================================================================
     Add CV
     ===================================================================== */
  var NAME_RE;
  try { NAME_RE = new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\u2019-]*$", 'u'); } catch (_) { NAME_RE = /^[^0-9@<>]+$/; }
  var MAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
  var PHONE_RE = /^[0-9 +()\-]{7,30}$/;
  function linkCount(s) { var m = str(s).match(/(https?:\/\/|www\.)/gi); return m ? m.length : 0; }

  function addKind() { var c = document.querySelector('#add-form input[name="kind"]:checked'); return c ? c.value : 'job'; }
  function setAddKind(k) {
    document.querySelectorAll('#add-form input[name="kind"]').forEach(function (r) { r.checked = r.value === k; });
    $('add-role-field').hidden = k !== 'job';
  }
  function enterAdd(emirati) {
    $('h-add').textContent = emirati ? 'Add Emiratisation CV' : 'Add CV';
    $('add-done').hidden = true;
    $('add-form').hidden = false;
    setAddKind(emirati ? 'emiratisation' : (addKind() === 'emiratisation' ? 'job' : addKind()));
    if (emirati && !pickerValue(state.pickers.add)) pickerSet(state.pickers.add, 'AE');
    fillRoleList();
  }
  function fillRoleList() {
    var dl = $('add-role-list');
    dl.textContent = '';
    var seen = new Set();
    var addOpt = function (v) { v = str(v, 120).trim(); if (!v || seen.has(v) || v === ROLE_GENERAL || v === ROLE_EMIRATI) return; seen.add(v); dl.append(h('option', { value: v })); };
    arr(state.jobs).filter(function (j) { return j.open; }).forEach(function (j) { addOpt(j.title); });
    arr(state.jobs).forEach(function (j) { addOpt(j.title); });
    arr(state.facets && state.facets.positions).forEach(function (p) { if (p) addOpt(p.value); });
  }

  function fieldOf(input) { return input.closest('.field'); }
  function setErr(input, msg) {
    var f = fieldOf(input);
    if (!f) return;
    var target = input.matches('input, select, textarea, button') ? input : f.querySelector('input, select, textarea, button');
    if (target) target.setAttribute('aria-invalid', 'true');
    var id = (target && target.id ? target.id : 'f' + Math.random().toString(36).slice(2)) + '-err';
    var p = f.querySelector('.field-err');
    if (!p) { p = h('p', { class: 'field-err', id: id }); f.append(p); }
    p.textContent = msg;
    if (target) {
      var db = (target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (db.indexOf(p.id) < 0) { db.push(p.id); target.setAttribute('aria-describedby', db.join(' ')); }
    }
  }
  function clearErrors(form) {
    form.querySelectorAll('.field-err').forEach(function (p) {
      var t = form.querySelector('[aria-describedby~="' + p.id + '"]');
      if (t) t.setAttribute('aria-describedby', t.getAttribute('aria-describedby').split(' ').filter(function (x) { return x !== p.id; }).join(' '));
      p.remove();
    });
    form.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
    var fe = form.querySelector('.form-err');
    if (fe) fe.hidden = true;
  }
  function formErr(id, msg) { var p = $(id); p.textContent = msg; p.hidden = !msg; }
  function focusFirstError(form) {
    var n = form.querySelector('[aria-invalid="true"]');
    if (n) n.focus();
  }

  var addFile = null;
  function resetFile() {
    addFile = null;
    var i = $('add-cv'); i.value = '';
    $('add-cv-name').textContent = 'No file chosen';
    $('add-drop').classList.remove('has-file');
    $('add-cv-clear').hidden = true;
  }
  function pickFile(f) {
    var field = fieldOf($('add-cv'));
    var old = field.querySelector('.field-err'); if (old) old.remove();
    $('add-cv').removeAttribute('aria-invalid');
    if (!f) { resetFile(); return; }
    var ext = extOf(f.name);
    if (CV_EXT.indexOf(ext) < 0) { resetFile(); setErr($('add-cv'), 'Choose a PDF, Word (.doc, .docx), JPG or PNG file.'); return; }
    if (f.size > MAX_CV) { resetFile(); setErr($('add-cv'), 'The file is ' + fmtSize(f.size) + '. The limit is 5 MB.'); return; }
    if (f.size === 0) { resetFile(); setErr($('add-cv'), 'The file is empty.'); return; }
    addFile = f;
    $('add-cv-name').textContent = f.name + ' · ' + fmtSize(f.size);
    $('add-drop').classList.add('has-file');
    $('add-cv-clear').hidden = false;
  }
  function readFile(f) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || ''), i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = function () { reject(new ApiError('file', 'The file could not be read. Try choosing it again.')); };
      r.readAsDataURL(f);
    });
  }
  var MAGIC = { pdf: [[0x25, 0x50, 0x44, 0x46]], doc: [[0xD0, 0xCF, 0x11, 0xE0]], docx: [[0x50, 0x4B]], jpg: [[0xFF, 0xD8, 0xFF]], jpeg: [[0xFF, 0xD8, 0xFF]], png: [[0x89, 0x50, 0x4E, 0x47]] };
  function checkMagic(f) {
    return f.slice(0, 8).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      return (MAGIC[extOf(f.name)] || []).some(function (sig) { return sig.every(function (x, i) { return b[i] === x; }); });
    }).catch(function () { return true; });
  }

  function submitAdd(e) {
    e.preventDefault();
    var form = $('add-form');
    clearErrors(form);
    var kind = addKind();
    var v = function (id) { return $(id).value.trim(); };
    var role = kind === 'general' ? ROLE_GENERAL : kind === 'emiratisation' ? ROLE_EMIRATI : v('add-role');
    var req = {
      role: role, name: v('add-name').replace(/\s+/g, ' '), email: v('add-email'), phone: v('add-phone'),
      nationality: pickerValue(state.pickers.add), location: v('add-location'), experience: $('add-exp').value,
      message: $('add-message').value.trim(), notes: $('add-notes').value.trim().slice(0, 2000), lang: 'en'
    };
    var bad = false;
    var err = function (id, msg) { bad = true; setErr($(id), msg); };
    if (kind === 'job' && (role.length < 2 || role.length > 120)) err('add-role', 'Type the position or pick an open job.');
    if (req.name.length < 2 || req.name.length > 100) err('add-name', 'Type the full name (2 to 100 characters).');
    else if (!NAME_RE.test(req.name) || /https?|www\.|@|\d/i.test(req.name)) err('add-name', 'Use letters, spaces and . \' - only (no numbers or links).');
    if (!MAIL_RE.test(req.email) || req.email.length > 254) err('add-email', 'Type a valid email address.');
    if (!PHONE_RE.test(req.phone)) err('add-phone', 'Use 7 to 30 digits, spaces, + ( ) or -.');
    if (!/^[A-Z]{2}$/.test(req.nationality)) { bad = true; setErr($('add-nat-host'), 'Choose the nationality.'); }
    if (req.location.length < 2 || req.location.length > 80) err('add-location', 'Type the city and country (2 to 80 characters).');
    if (EXPERIENCE.indexOf(req.experience) < 0) err('add-exp', 'Choose the experience.');
    if (req.message.length > 1500) err('add-message', 'Keep it under 1,500 characters.');
    else if (linkCount(req.message) > 2) err('add-message', 'At most 2 links are allowed.');
    if (bad) { formErr('add-err', 'Please check the highlighted fields.'); focusFirstErrorAdd(); return; }

    var btn = $('add-btn');
    busy(btn, true, addFile ? 'Uploading…' : 'Adding…');
    var f = addFile;
    var prep = f ? checkMagic(f).then(function (ok) {
      if (!ok) throw new ApiError('file', 'The file does not look like a real ' + extOf(f.name).toUpperCase() + ' file. Save it again and retry.');
      return readFile(f);
    }).then(function (data) {
      var ext = extOf(f.name);
      var type = f.type || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'doc' ? 'application/msword' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'image/jpeg');
      req.cv = { name: f.name.slice(-120), type: type, size: f.size, data: data };
    }) : Promise.resolve();
    prep.then(function () {
      return api('addApp', req, f ? T_UPLOAD : T_NORMAL);
    }).then(function (d) {
      var ref = str(d.ref || (d.row && d.row.ref), 60);
      form.reset(); resetFile(); setAddKind(kind);
      pickerSet(state.pickers.add, '');
      $('add-done-title').textContent = 'CV added';
      $('add-done-text').textContent = (ref ? 'Reference ' + ref + '. ' : '') + 'It is in the CV list with the status New.';
      $('add-done-view').dataset.ref = ref;
      form.hidden = true;
      var done = $('add-done'); done.hidden = false; done.focus();
      state.appsStale = true;
    }).catch(function (e2) {
      if (e2.code === 'auth') return;
      if (e2.code === 'file') { setErr($('add-cv'), e2.message); formErr('add-err', e2.message); return; }
      if (e2.fields) {
        var map = { role: 'add-role', name: 'add-name', email: 'add-email', phone: 'add-phone', location: 'add-location', experience: 'add-exp', message: 'add-message', notes: 'add-notes', cv: 'add-cv', nationality: 'add-nat-host' };
        Object.keys(e2.fields).forEach(function (k) { if (map[k] && $(map[k])) setErr($(map[k]), clip(str(e2.fields[k]), 200) || 'Please check this field.'); });
      }
      formErr('add-err', e2.message);
      focusFirstErrorAdd();
    }).then(function () { busy(btn, false); });
  }
  function focusFirstErrorAdd() {
    var form = $('add-form');
    var n = form.querySelector('[aria-invalid="true"]');
    if (!n) return;
    if (n.closest('#add-nat-host') || n.id === 'add-nat-host') pickerFocus(state.pickers.add);
    else if (n.type === 'file') $('add-cv-btn').scrollIntoView({ block: 'center' });
    else n.focus();
  }

  /* =====================================================================
     Jobs
     ===================================================================== */
  function loadJobs() {
    if (state.jobsLoading) return state.jobsLoading;
    if (!state.jobs) jobsState('loading');
    state.jobsLoading = api('jobsAll').then(function (d) {
      state.jobs = arr(d.jobs).map(cleanJob).filter(Boolean);
      renderJobs();
      renderPositionOptions();
      fillRoleList();
    }).catch(function (e) {
      if (e.code === 'auth') return;
      if (!state.jobs) jobsState('error', e.message);
      else toast('The jobs list could not be refreshed. ' + e.message, 'err');
    }).then(function () { state.jobsLoading = null; });
    return state.jobsLoading;
  }
  function jobsState(kind, msg) {
    var st = $('jobs-state');
    st.textContent = '';
    if (kind === 'loading') {
      $('jobs-tbody').textContent = '';
      st.className = 'state';
      st.append(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, 'Loading jobs…'));
    } else if (kind === 'error') {
      $('jobs-tbody').textContent = '';
      st.className = 'state err';
      st.append(icon('alert'), h('strong', null, 'The jobs could not be loaded'), h('span', null, msg),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { loadJobs(); } }, icon('refresh'), h('span', null, 'Try again')));
    } else if (kind === 'empty') {
      st.className = 'state';
      st.append(icon('briefcase'), h('strong', null, 'No jobs yet'), h('span', null, 'Add a job and it appears on the careers page.'),
        h('a', { class: 'btn btn-sm', href: '#/jobs/new' }, icon('plus'), h('span', null, 'Add a job')));
    }
    st.hidden = !kind;
    $('jobs-table').querySelector('thead').hidden = !!kind;
  }
  function renderJobs() {
    var tb = $('jobs-tbody');
    tb.textContent = '';
    var jobs = arr(state.jobs);
    var open = jobs.filter(function (j) { return j.open; }).length;
    var b = $('badge-jobs'); b.textContent = String(open); b.hidden = !jobs.length; b.title = plural(open, 'open job', 'open jobs');
    if (!jobs.length) { jobsState('empty'); return; }
    jobsState('');
    jobs.forEach(function (j) { tb.append(jobRow(j)); });
  }
  function jobRow(j) {
    var tr = h('tr', { class: j.open ? null : 'is-closed' });
    tr.dataset.id = j.id;
    tr.append(h('td', { class: 'j-title' }, h('span', { class: 'job-title' }, j.title || '(no title)'),
      h('span', { class: 'job-id' }, j.id), j.example ? h('span', { class: 'tags' }, h('span', { class: 'tag tag-example' }, 'Example listing')) : null));
    tr.append(h('td', { 'data-label': 'Category' }, j.category || '—'));
    tr.append(h('td', { 'data-label': 'Positions', class: 'j-num' }, String(j.positions)));
    tr.append(h('td', { 'data-label': 'Location' }, j.location || '—'));
    tr.append(h('td', { 'data-label': 'Type' }, j.type || '—'));
    tr.append(h('td', { 'data-label': 'Posted', class: 'j-date' }, fmtPosted(j.posted)));
    var sw = h('button', { type: 'button', class: 'switch-btn', role: 'switch', 'aria-checked': j.open ? 'true' : 'false', 'aria-label': 'Open on the careers page: ' + clip(j.title, 80) },
      h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', null, j.open ? 'Open' : 'Closed'));
    sw.addEventListener('click', function () { toggleJob(j, sw); });
    tr.append(h('td', { class: 'j-open' }, sw));
    var ed = h('button', { type: 'button', class: 'icon-btn', title: 'Edit', 'aria-label': 'Edit ' + clip(j.title, 80) }, icon('edit'), h('span', { class: 'act-txt' }, 'Edit'));
    ed.addEventListener('click', function () { openJobForm(j, ed); });
    var del = h('button', { type: 'button', class: 'icon-btn danger', title: 'Delete', 'aria-label': 'Delete ' + clip(j.title, 80) }, icon('trash'), h('span', { class: 'act-txt' }, 'Delete'));
    del.addEventListener('click', function () { deleteJob(j, del); });
    tr.append(h('td', { class: 'c-act' }, h('div', { class: 'act' }, ed, del)));
    return tr;
  }
  function jobPayload(j) {
    return { id: j.id, title: j.title, category: j.category, positions: j.positions, location: j.location, type: j.type,
      posted: j.posted, summary: j.summary, requirements: j.requirements.slice(), open: j.open, example: j.example };
  }
  function replaceJob(oldId, nj) {
    var i = state.jobs.findIndex(function (x) { return x.id === oldId; });
    if (i >= 0) state.jobs[i] = nj; else state.jobs.push(nj);
  }
  function toggleJob(j, sw) {
    var payload = jobPayload(j);
    payload.open = !j.open;
    sw.classList.add('is-busy');
    api('saveJob', { job: payload }).then(function (d) {
      var nj = cleanJob(d.job) || Object.assign({}, j, { open: payload.open });
      replaceJob(j.id, nj);
      renderJobs(); renderPositionOptions();
      var again = Array.prototype.find.call($('jobs-tbody').children, function (t) { return t.dataset.id === nj.id; });
      if (again) again.querySelector('.switch-btn').focus();
      toast(nj.open ? clip(nj.title, 80) + ' is open and listed on the careers page.' : clip(nj.title, 80) + ' is closed and hidden from the careers page.');
    }).catch(function (e) {
      sw.classList.remove('is-busy');
      if (e.code !== 'auth') toast('The job was not changed. ' + e.message, 'err');
    });
  }
  function deleteJob(j, btn) {
    confirmBox({
      title: 'Delete this job?',
      text: 'It disappears from the careers page. CVs already received for it stay in the CV list. To hide it for now, close it instead.',
      sub: j.title
    }).then(function (ok) {
      if (!ok) { btn.focus(); return; }
      busy(btn, true);
      api('deleteJob', { id: j.id }).then(function () {
        state.jobs = state.jobs.filter(function (x) { return x.id !== j.id; });
        renderJobs(); renderPositionOptions(); fillRoleList();
        toast('Job deleted: ' + clip(j.title, 80) + '.');
        var h1 = $('h-jobs'); h1.setAttribute('tabindex', '-1'); h1.focus();
      }).catch(function (e) {
        if (e.code === 'not_found') { state.jobs = state.jobs.filter(function (x) { return x.id !== j.id; }); renderJobs(); return; }
        if (e.code !== 'auth') toast('The job was not deleted. ' + e.message, 'err');
        if (document.contains(btn)) busy(btn, false);
      });
    });
  }

  var jobTrigger = null;
  function openJobForm(j, trigger) {
    jobTrigger = trigger || null;
    state.jobEditing = j || null;
    var form = $('job-form');
    form.reset();
    clearErrors(form);
    $('job-title-h').textContent = j ? 'Edit job' : 'Add a job';
    $('job-id-label').textContent = j ? j.id : 'New job';
    setBtnText($('job-save'), j ? 'Save changes' : 'Add job');
    $('job-title').value = j ? j.title : '';
    $('job-category').value = j ? j.category : '';
    $('job-positions').value = j ? String(j.positions) : '1';
    $('job-location').value = j ? j.location : '';
    $('job-type').value = j ? j.type : '';
    $('job-posted').value = j && /^\d{4}-\d{2}-\d{2}$/.test(j.posted) ? j.posted : gulfISODate();
    $('job-summary').value = j ? j.summary : '';
    $('job-req').value = j ? j.requirements.join('\n') : '';
    $('job-open').checked = j ? j.open : true;
    var cats = $('job-cat-list'); cats.textContent = '';
    var seen = new Set(['Recruitment', 'Transport', 'Construction', 'Maintenance', 'Safety', 'Oil and Gas', 'Administration']);
    arr(state.jobs).forEach(function (x) { if (x.category) seen.add(x.category); });
    seen.forEach(function (c) { cats.append(h('option', { value: c })); });
    openDialog($('dlg-job'));
    setTimeout(function () { $('job-title').focus(); }, 20);
  }
  function submitJob(e) {
    e.preventDefault();
    var form = $('job-form');
    clearErrors(form);
    var j = state.jobEditing;
    var v = function (id) { return $(id).value.trim(); };
    var job = {
      title: v('job-title').replace(/\s+/g, ' '), category: v('job-category'), positions: Number(v('job-positions')),
      location: v('job-location'), type: v('job-type'), posted: v('job-posted'), summary: v('job-summary'),
      requirements: $('job-req').value.split(/\r?\n/).map(function (s) { return s.replace(/^\s*[-•*]\s*/, '').trim(); }).filter(Boolean),
      open: $('job-open').checked, example: j ? j.example : false
    };
    if (j) job.id = j.id;
    var bad = false;
    if (job.title.length < 2 || job.title.length > 120) { bad = true; setErr($('job-title'), 'Type a job title (2 to 120 characters).'); }
    if (!Number.isInteger(job.positions) || job.positions < 1 || job.positions > 999) { bad = true; setErr($('job-positions'), 'Use a whole number from 1 to 999.'); }
    if (job.posted && !/^\d{4}-\d{2}-\d{2}$/.test(job.posted)) { bad = true; setErr($('job-posted'), 'Pick a date.'); }
    if (!job.posted) job.posted = gulfISODate();
    if (bad) { formErr('job-err', 'Please check the highlighted fields.'); focusFirstError(form); return; }
    var btn = $('job-save');
    busy(btn, true, 'Saving…');
    api('saveJob', { job: job }).then(function (d) {
      var nj = cleanJob(d.job) || Object.assign({}, job, { id: job.id || '' });
      if (!state.jobs) state.jobs = [];
      replaceJob(j ? j.id : nj.id, nj);
      renderJobs(); renderPositionOptions(); fillRoleList();
      closeJobForm();
      toast(j ? 'Changes saved for ' + clip(nj.title, 80) + '.' : (nj.open ? clip(nj.title, 80) + ' is added and listed on the careers page.' : clip(nj.title, 80) + ' is added as a closed job.'));
    }).catch(function (e2) {
      if (e2.code === 'auth') return;
      if (e2.fields) {
        var map = { title: 'job-title', positions: 'job-positions', posted: 'job-posted', category: 'job-category', location: 'job-location', type: 'job-type', summary: 'job-summary', requirements: 'job-req' };
        Object.keys(e2.fields).forEach(function (k) { if (map[k]) setErr($(map[k]), clip(str(e2.fields[k]), 200) || 'Please check this field.'); });
      }
      formErr('job-err', e2.message);
      focusFirstError(form);
    }).then(function () { busy(btn, false); });
  }
  function closeJobForm() {
    closeDialog($('dlg-job'));
  }

  /* =====================================================================
     Change password, login, logout
     ===================================================================== */
  function submitPassword(e) {
    e.preventDefault();
    var form = $('pw-form');
    clearErrors(form);
    $('pw-done').hidden = true;
    var oldP = $('pw-old').value, newP = $('pw-new').value, conf = $('pw-confirm').value;
    var bad = false;
    if (!oldP) { bad = true; setErr($('pw-old'), 'Type your current password.'); }
    if (newP.length < 8 || newP.length > 64) { bad = true; setErr($('pw-new'), 'Use 8 to 64 characters.'); }
    else if (newP === oldP) { bad = true; setErr($('pw-new'), 'Choose a password that is different from the current one.'); }
    if (!bad && conf !== newP) { bad = true; setErr($('pw-confirm'), 'The two new passwords do not match.'); }
    if (bad) { focusFirstError(form); return; }
    var btn = $('pw-btn');
    busy(btn, true, 'Changing…');
    api('changePassword', { old: oldP, new: newP }).then(function () {
      form.reset();
      var d = $('pw-done'); d.hidden = false; d.focus();
    }).catch(function (e2) {
      if (e2.code === 'auth') return;
      /* Wrong current passwords count toward the login lockout. The try that locks it ends this session
         (back to the login screen with the message); while it is already locked the session stays. */
      if (e2.code === 'locked') {
        var lockMsg = e2.message;
        api('jobsAll').then(function () { formErr('pw-err', lockMsg); }, function (e3) {
          if (e3.code === 'auth') showLogin(lockMsg, 'warn'); else formErr('pw-err', lockMsg);
        });
        return;
      }
      if (e2.code === 'bad_login') { setErr($('pw-old'), 'The current password is not right.'); focusFirstError(form); return; }
      if (e2.fields) {
        var map = { old: 'pw-old', new: 'pw-new', pass: 'pw-new', password: 'pw-new' };
        Object.keys(e2.fields).forEach(function (k) { if (map[k]) setErr($(map[k]), clip(str(e2.fields[k]), 200)); });
      }
      formErr('pw-err', e2.message);
      focusFirstError(form);
    }).then(function () { busy(btn, false); });
  }

  function submitLogin(e) {
    e.preventDefault();
    var user = $('login-user').value.trim(), pass = $('login-pass').value;
    var errEl = $('login-err');
    errEl.hidden = true;
    $('login-user').removeAttribute('aria-invalid'); $('login-pass').removeAttribute('aria-invalid');
    if (!user || !pass) {
      errEl.textContent = !user ? 'Type your username.' : 'Type your password.';
      errEl.hidden = false;
      var bad = !user ? $('login-user') : $('login-pass');
      bad.setAttribute('aria-invalid', 'true'); bad.focus();
      return;
    }
    var btn = $('login-btn');
    busy(btn, true, 'Logging in…');
    api('login', { user: user, pass: pass }).then(function (d) {
      var token = str(d.token, 600);
      if (!/^[A-Za-z0-9_-]{16,512}$/.test(token)) throw new ApiError('server', 'The server did not send a valid login. Please try again.');
      state.session = { token: token, expires: str(d.expires, 64), user: str(d.user, 64) || user, last: Date.now() };
      state.activeSaved = state.session.last;
      saveSession(state.session);
      $('login-pass').value = '';
      $('login-notice').hidden = true;
      if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/cvs');
      enterApp();
    }).catch(function (e2) {
      errEl.textContent = e2.message;
      errEl.hidden = false;
      if (e2.code === 'bad_login') { $('login-pass').value = ''; $('login-pass').setAttribute('aria-invalid', 'true'); $('login-pass').focus(); }
    }).then(function () { busy(btn, false); });
  }

  function logout() {
    var s = state.session;
    if (s) {
      /* Tell the server, but never wait for it: the token is dropped here either way */
      api('logout', {}).catch(function () { /* ignore */ });
    }
    resetApp();
    showLogin('You have logged out.');
  }

  /* =====================================================================
     Wiring
     ===================================================================== */
  function wire() {
    /* Show / hide password */
    document.querySelectorAll('.pw-toggle').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $(b.dataset.pw);
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.setAttribute('aria-pressed', show ? 'true' : 'false');
        b.querySelector('span').textContent = show ? 'Hide' : 'Show';
        b.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
        b.setAttribute('aria-label', (show ? 'Hide' : 'Show') + ' password');
      });
      b.setAttribute('aria-label', 'Show password');
    });

    $('login-form').addEventListener('submit', submitLogin);
    document.querySelectorAll('.js-logout').forEach(function (b) { b.addEventListener('click', logout); });

    window.addEventListener('hashchange', function () { route(true); });
    $('menu-btn').addEventListener('click', function () { setMenu(!$('side').classList.contains('is-open')); });
    document.addEventListener('click', function (e) {
      if ($('side').classList.contains('is-open') && !$('side').contains(e.target)) setMenu(false);
      var nav = e.target.closest && e.target.closest('.side-nav a');
      if (nav) {
        setMenu(false);
        if (nav.hasAttribute('data-focus-search')) {
          setTimeout(function () { var q = $('f-q'); q.focus(); q.select(); }, 60);
        }
        /* Clicking the current page again still re-runs it (for example "Add a job" twice) */
        if (nav.getAttribute('href') === location.hash) { e.preventDefault(); route(!nav.hasAttribute('data-focus-search')); }
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('side').classList.contains('is-open')) { setMenu(false); $('menu-btn').focus(); }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && state.session && currentRoute() === 'cvs' &&
        !document.querySelector('dialog[open]') && !/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') &&
        !(document.activeElement && document.activeElement.isContentEditable)) {
        e.preventDefault(); $('f-q').focus();
      }
    });

    /* Filters */
    var qTimer = 0;
    $('f-q').addEventListener('input', function () {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { setFilter('q', $('f-q').value.trim().slice(0, 120)); }, 400);
    });
    $('filters').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(qTimer); setFilter('q', $('f-q').value.trim().slice(0, 120)); });
    $('f-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qTimer); setFilter('q', $('f-q').value.trim().slice(0, 120)); } });
    $('f-position').addEventListener('change', function () { setFilter('position', this.value); });
    $('f-kind').addEventListener('change', function () { setFilter('kind', this.value); });
    $('f-status').addEventListener('change', function () { setFilter('status', this.value); });
    var dateChange = function () {
      var a = $('f-from').value, b = $('f-to').value;
      if (a && b && a > b) { var t = a; a = b; b = t; }
      state.filter.from = /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : '';
      state.filter.to = /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : '';
      state.page = 1;
      syncFilterInputs();
      loadApps();
    };
    $('f-from').addEventListener('change', dateChange);
    $('f-to').addEventListener('change', dateChange);
    $('f-clear').addEventListener('click', clearFilters);
    $('filters-toggle').addEventListener('click', function () {
      var f = $('filters'), open = !f.classList.contains('is-open');
      f.classList.toggle('is-open', open);
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('f-sort').addEventListener('change', function () { state.sort = this.value === 'old' ? 'old' : 'new'; state.page = 1; savePrefs(); loadApps(); });
    $('f-size').addEventListener('change', function () { state.pageSize = [25, 50, 100].indexOf(+this.value) >= 0 ? +this.value : 25; state.page = 1; savePrefs(); loadApps(); });
    $('btn-export').addEventListener('click', exportCsv);

    /* Selection */
    $('chk-all').addEventListener('change', function () {
      var on = this.checked;
      state.selected.clear();
      if (on) state.rows.forEach(function (r) { state.selected.add(r.id); });
      renderSelection();
    });
    $('spam-select').addEventListener('click', function () {
      state.selected.clear();
      spamRows().forEach(function (r) { state.selected.add(r.id); });
      renderSelection();
      $('bulk-delete').focus();
    });
    $('bulk-clear').addEventListener('click', function () { state.selected.clear(); renderSelection(); });
    $('bulk-delete').addEventListener('click', deleteSelected);

    /* Details drawer */
    var dcv = $('dlg-cv');
    dcv.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeDetails); });
    dcv.addEventListener('cancel', function (e) { if (state.notesDirty) { e.preventDefault(); closeDetails(); } });
    onBackdrop(dcv, closeDetails);
    dcv.addEventListener('close', function () {
      state.drawerRow = null; state.notesDirty = false;
      if (detailsTrigger && document.contains(detailsTrigger)) detailsTrigger.focus();
      detailsTrigger = null;
    });
    $('cvd-view').addEventListener('click', function () { if (state.drawerRow) viewCv(state.drawerRow, $('cvd-view')); });
    $('cvd-delete').addEventListener('click', function () { if (state.drawerRow) deleteOne(state.drawerRow, $('cvd-delete')); });

    /* Job drawer */
    var dj = $('dlg-job');
    dj.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeJobForm); });
    onBackdrop(dj, closeJobForm);
    dj.addEventListener('close', function () {
      if (location.hash === '#/jobs/new') {
        history.replaceState(null, '', '#/jobs');
        document.querySelectorAll('[data-nav]').forEach(function (a) { if (a.dataset.nav === 'jobs') a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
        document.title = 'Jobs · SAA Admin';
      }
      if (jobTrigger && document.contains(jobTrigger)) jobTrigger.focus();
      jobTrigger = null; state.jobEditing = null;
    });
    $('job-form').addEventListener('submit', submitJob);

    /* Confirm */
    var dc = $('dlg-confirm');
    $('confirm-ok').addEventListener('click', function () { confirmDone(true); });
    $('confirm-cancel').addEventListener('click', function () { confirmDone(false); });
    dc.addEventListener('cancel', function (e) { e.preventDefault(); confirmDone(false); });
    onBackdrop(dc, function () { confirmDone(false); });

    /* Add CV */
    var af = $('add-form');
    af.addEventListener('submit', submitAdd);
    af.addEventListener('change', function (e) {
      if (e.target.name === 'kind') { $('add-role-field').hidden = e.target.value !== 'job'; }
    });
    af.addEventListener('input', function (e) {
      var f = e.target.closest && e.target.closest('.field');
      if (f && e.target.getAttribute('aria-invalid')) { e.target.removeAttribute('aria-invalid'); var p = f.querySelector('.field-err'); if (p) p.remove(); }
    });
    af.addEventListener('reset', function () {
      setTimeout(function () { clearErrors(af); resetFile(); pickerSet(state.pickers.add, currentRoute() === 'add-emiratisation' ? 'AE' : ''); setAddKind(currentRoute() === 'add-emiratisation' ? 'emiratisation' : 'job'); }, 0);
    });
    $('add-cv').addEventListener('change', function () { pickFile(this.files && this.files[0]); });
    $('add-cv-clear').addEventListener('click', function () { resetFile(); $('add-cv-btn').focus(); });
    var drop = $('add-drop');
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) pickFile(f); });
    $('add-cv-btn').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('add-cv').click(); } });
    $('add-cv-btn').setAttribute('tabindex', '0');
    $('add-cv-btn').setAttribute('role', 'button');
    $('add-cv').setAttribute('tabindex', '-1');
    $('add-again').addEventListener('click', function () {
      $('add-done').hidden = true; $('add-form').hidden = false;
      enterAdd(currentRoute() === 'add-emiratisation');
      $('add-name').focus();
    });
    $('add-done-view').addEventListener('click', function () {
      var ref = this.dataset.ref || '';
      $('add-done').hidden = true; $('add-form').hidden = false;
      state.filter = Object.assign({}, EMPTY_FILTER, { q: ref });
      state.page = 1;
      syncFilterInputs();
      state.appsStale = true;
    });

    /* Password */
    $('pw-form').addEventListener('submit', submitPassword);
    $('pw-form').addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid')) { e.target.removeAttribute('aria-invalid'); var p = fieldOf(e.target) && fieldOf(e.target).querySelector('.field-err'); if (p) p.remove(); }
    });

    /* Activity keeps the session; a tab that comes back after a long time checks it first */
    ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(function (t) { document.addEventListener(t, touch, { capture: true, passive: true }); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !state.session) return;
      if (sessionExpired(state.session)) sessionLost(); else touch();
    });
    window.addEventListener('pagehide', revokeAll);
  }

  function savePrefs() { writeJSON('local', PREFS_KEY, { pageSize: state.pageSize, sort: state.sort }); }
  function loadPrefs() {
    var p = readJSON('local', PREFS_KEY) || {};
    if ([25, 50, 100].indexOf(p.pageSize) >= 0) state.pageSize = p.pageSize;
    if (p.sort === 'old') state.sort = 'old';
    $('f-size').value = String(state.pageSize);
    $('f-sort').value = state.sort;
  }

  function validEndpoint(u) {
    try {
      var x = new URL(u);
      if (x.protocol === 'https:') return true;
      return x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname);
    } catch (_) { return false; }
  }

  function boot() {
    if (!ENDPOINT || !validEndpoint(ENDPOINT)) {
      showScreen('scr-offline');
      document.title = 'Not connected · SAA Admin';
      return;
    }
    wire();
    loadPrefs();
    state.pickers.nat = makePicker($('f-nat-host'), {
      id: 'f-nat', name: 'nationality', allowAll: true, allLabel: 'All nationalities', placeholder: 'All nationalities',
      searchLabel: 'Search countries', lang: 'en', value: '',
      onChange: function (code) { setFilter('nationality', str(code).toUpperCase()); }
    });
    state.pickers.add = makePicker($('add-nat-host'), {
      id: 'add-nat', name: 'nationality', required: true, placeholder: 'Choose a country',
      searchLabel: 'Search countries', lang: 'en', value: '',
      onChange: function () {
        var f = $('add-nat-host').closest('.field');
        var p = f && f.querySelector('.field-err'); if (p) p.remove();
        f.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
      }
    });
    syncFilterInputs();
    var s = readSession();
    if (s && !sessionExpired(s) && isIdle(s)) { state.session = s; idleOut(); }
    else if (s && !sessionExpired(s)) { state.session = s; state.activeSaved = 0; touch(); enterApp(); }
    else { saveSession(null); showLogin(s ? SESSION_ENDED : '', 'warn'); }
  }

  try { boot(); }
  catch (err) {
    /* Last resort: never leave a blank page */
    showScreen('scr-offline');
    var t = document.querySelector('#scr-offline .gate-title');
    if (t) t.textContent = 'The admin panel could not start';
    var p = document.querySelector('#scr-offline .gate-text');
    if (p) p.textContent = 'Please reload the page. If it keeps happening, the panel files may be incomplete.';
  }
})();
