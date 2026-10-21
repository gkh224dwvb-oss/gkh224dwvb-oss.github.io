/* =========================================================================
   CAREERS · open positions and the application form
   1. Job list: built from window.SAA_JOBS (assets/data/jobs.js), with
      category filter chips when there are two or more categories. With the
      recruitment system set up, the open jobs then come from it (action
      "jobs"); jobs.js stays the first paint and the fallback
   2. "Apply now" (any [data-apply-role]): picks the role in the form,
      scrolls to it, focuses the first field. ?role= in the URL picks it too,
      with #applyForm so the page opens at the form
      (General application and Emiratisation registration replace the old
      saaest.com CV and Emiratisation forms)
   3. Application form. Nationality is a searchable country list
      (assets/js/country-picker.js, assets/data/countries.js). Age (18 to 75,
      Arabic-Indic digits too, sent as a number) and highest education (one of
      the server's EDUCATION values) follow the API.md rules. Two modes:
      - window.SAA_CONFIG.recruitApi '' (today): a mailto to both recruitment
        inboxes, the visitor attaches the CV
      - recruitApi set (the Apps Script web app, admin-system/API.md): the
        form sends the details and the CV there (action "apply"), and the
        team sees them in /admin/. If the system cannot be reached, the form
        offers the email instead
      Both keep the same checks as the contact form: linked errors, honeypot,
      3 s time trap, 3 sends per 10 minutes, control characters stripped.
      [data-apply-mode="mail|api"] elements show only in their mode.
   Every sentence this file shows goes through SAAI18n.t(); the ones with a
   name or a number are patterns in tools/i18n/patterns.json.
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* applications go to both recruitment inboxes (SA, 19 Oct 2026); a mailto takes them comma separated */
  const EMAIL = 'recruitment2@saaest.com,cv@saaest.com';
  const EMAIL_TEXT = 'recruitment2@saaest.com and cv@saaest.com';
  const GENERAL = 'General application';
  const EMIRATI = 'Emiratisation registration (UAE Nationals)';   /* also an <option> in careers.html */
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* in the page's language, with 0-9 like the rest of the site (en-GB: 8 Oct 2026) */
  const fmtDate = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m || +m[2] < 1 || +m[2] > 12) return '';
    try {
      return new Intl.DateTimeFormat((document.documentElement.lang || 'en-GB') + '-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    } catch (_) { return (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1]; }
  };
  const ARROW = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* the visitor's language (assets/js/i18n.js): T('Sentence.') or T('Pattern with {x}.', { x: name }) */
  const I18N = window.SAAI18n || null;
  const LANG = (I18N && I18N.lang) || 'en';
  const T = (s, vals) => I18N ? I18N.t(s, vals) :
    vals && typeof vals === 'object' ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m)) : s;

  /* the recruitment system (Google Apps Script web app, admin-system/API.md); '' = not set up yet */
  const API_URL = (() => {
    const u = String((window.SAA_CONFIG || {}).recruitApi || '').trim();
    return /^https?:\/\/\S+$/i.test(u) ? u : '';
  })();
  function call(req, ms) {
    const ctl = window.AbortController ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
    return fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req), redirect: 'follow',
      credentials: 'omit', signal: ctl ? ctl.signal : undefined
    }).then(r => r.text()).then(t => {
      clearTimeout(timer);
      let j = null;
      try { j = JSON.parse(t); } catch (_) { j = null; }
      if (!j || typeof j !== 'object') throw new Error('not JSON');   /* e.g. a Google sign-in page: the web app is not public */
      return j;
    }, err => { clearTimeout(timer); throw err; });
  }

  /* ---------------------------------------------------------------------
     1. JOB LIST
     --------------------------------------------------------------------- */
  const normJobs = raw => (Array.isArray(raw) ? raw : []).filter(j => j && j.open !== false && String(j.title || '').trim()).map((j, i) => ({
    id: String(j.id || 'job-' + (i + 1)).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    title: String(j.title).trim(),
    category: String(j.category || '').trim(),
    positions: Math.max(0, parseInt(j.positions, 10) || 0),
    location: String(j.location || '').trim() || 'To be confirmed',
    type: String(j.type || '').trim() || 'To be confirmed',
    posted: String(j.posted || '').trim(),
    summary: String(j.summary || '').trim(),
    requirements: Array.isArray(j.requirements) ? j.requirements.map(r => String(r).trim()).filter(Boolean) : [],
    example: j.example === true
  }));
  let jobs = normJobs(window.SAA_JOBS);

  const list = $('jobsList'), countText = $('jobsCountText'), filter = $('jobsFilter');
  const empty = $('jobsEmpty'), general = $('jobsGeneral');
  const roles = n => n + (n === 1 ? ' open role' : ' open roles');

  function card(j) {
    const tid = 'job-' + j.id + '-t';
    const date = fmtDate(j.posted);
    const meta = [
      ['Positions', j.positions ? String(j.positions) : 'To be confirmed'],
      ['Location', j.location],
      ['Type', j.type]
    ];
    return '<li class="job" data-cat="' + esc(j.category) + '">' +
      '<div class="job-card' + (j.example ? ' is-example' : '') + '">' +
        '<div class="job-main">' +
          '<p class="job-top">' + (j.category ? '<span class="job-cat mono">' + esc(T(j.category)) + '</span>' : '') +
            (j.example ? '<span class="placeholder job-ex">Example listing</span>' : '') + '</p>' +
          '<h3 class="job-title" id="' + tid + '">' + esc(j.title) + '</h3>' +
          (j.summary ? '<p class="job-sum">' + esc(j.summary) + '</p>' : '') +
          (j.requirements.length ? '<div class="job-req"><p class="job-req-t mono">' + esc(T('Requirements')) + '</p><ul>' + j.requirements.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div>' : '') +
        '</div>' +
        '<dl class="job-meta">' +
          meta.map(m => '<div><dt>' + m[0] + '</dt><dd>' + esc(m[1]) + '</dd></div>').join('') +
          (date ? '<div><dt>Posted</dt><dd><time datetime="' + esc(j.posted) + '">' + date + '</time></dd></div>' : '') +
        '</dl>' +
        '<div class="job-act"><button class="btn job-apply" type="button" data-apply-role="' + esc(j.title) + '">Apply now<span class="sr-only"> ' + esc(T(j.example ? 'for {x} (example listing)' : 'for {x}', { x: j.title })) + '</span> ' + ARROW + '</button></div>' +
      '</div></li>';
  }

  let activeCat = '';
  function showCount() {
    if (!countText) return;
    const n = activeCat ? jobs.filter(j => j.category === activeCat).length : jobs.length;
    countText.textContent = roles(n) + (activeCat ? ' in ' + activeCat : '');
  }

  function renderJobs() {
    if (!list) return;
    activeCat = '';
    list.innerHTML = jobs.map(card).join('');
    if (empty) empty.hidden = !!jobs.length;
    if (general) general.hidden = !jobs.length;
    if (!jobs.length) {
      if (countText) countText.textContent = 'No open roles right now';
    } else showCount();
    if (!filter) return;
    const cats = [...new Set(jobs.map(j => j.category).filter(Boolean))];
    if (cats.length >= 2) {
      const chip = (val, label, n, on) => '<button type="button" class="jf-chip" data-cat="' + esc(val) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + ' <span class="jf-n">' + n + '</span></button>';
      filter.innerHTML = chip('', T('All'), jobs.length, true) + cats.map(c => chip(c, T(c), jobs.filter(j => j.category === c).length, false)).join('');
      filter.hidden = false;
    } else {
      filter.innerHTML = '';
      filter.hidden = true;
    }
  }
  renderJobs();
  if (filter && list) filter.addEventListener('click', e => {
    const b = e.target.closest('.jf-chip');
    if (!b) return;
    activeCat = b.dataset.cat || '';
    filter.querySelectorAll('.jf-chip').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    list.querySelectorAll('.job').forEach(li => { li.hidden = !!activeCat && li.dataset.cat !== activeCat; });
    showCount();
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  });

  /* ---------------------------------------------------------------------
     2. ROLE PICKER + "Apply now"
     --------------------------------------------------------------------- */
  const form = $('applyForm');
  const roleFor = v => { v = String(v || '').toLowerCase(); return v === 'general' ? GENERAL : v === 'emiratisation' ? EMIRATI : (jobs.find(j => j.id === v) || {}).title; };
  const fRole = $('aRole');
  const urlRole = new URLSearchParams(location.search).get('role');
  /* one <option> per open job, before "General application"; a job the visitor already chose stays */
  function fillRoles() {
    if (!fRole) return;
    const cur = fRole.value;
    const gen = fRole.querySelector('option[value="' + GENERAL + '"]');
    [...fRole.options].forEach(o => { if (o.hasAttribute('data-job')) o.remove(); });
    const add = (title, example) => {
      const o = document.createElement('option');
      o.value = title; o.textContent = title + (example ? ' (example listing)' : '');
      o.setAttribute('data-job', '');
      fRole.insertBefore(o, gen || null);
    };
    jobs.forEach(j => { if (![...fRole.options].some(o => o.value === j.title)) add(j.title, j.example); });
    if (cur && ![...fRole.options].some(o => o.value === cur)) add(cur, false);
    fRole.value = cur;
  }
  if (fRole) {
    fillRoles();
    /* links from other pages pick the role: careers.html?role=general|emiratisation|<job id>#applyForm */
    const pre = roleFor(urlRole);
    if (pre && [...fRole.options].some(o => o.value === pre)) fRole.value = pre;
  }

  let lenis = null;
  /* consent.js creates window.SAA too: without site.js there is no ready() */
  const SAA_READY = !!(window.SAA && typeof window.SAA.ready === 'function');
  if (SAA_READY) window.SAA.ready(c => { lenis = c.lenis || null; });

  function goApply(role) {
    if (!form || !fRole) return;
    if (role && [...fRole.options].some(o => o.value === role)) {
      fRole.value = role;
      fRole.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const target = form;
    const first = $('aName');
    /* absolute target from the live layout, so it is right even if the page was scrolled outside Lenis */
    if (lenis && !REDUCE) lenis.scrollTo(Math.max(0, target.getBoundingClientRect().top + window.scrollY - 110), { duration: 1.1, force: true });
    else target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    if (first) first.focus({ preventScroll: true });
    const picked = $('apPicked');
    if (picked) picked.textContent = role ? 'Role selected: ' + role + '.' : '';
  }
  /* [data-apply-role], and links to careers.html?role=... clicked while already on Careers (the URL would not change, so
     nothing would be picked). Capture phase, so site.js's page-transition handler sees defaultPrevented and leaves it. */
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const b = e.target.closest('[data-apply-role], a[href*="role="]');
    if (!b) return;
    let role = b.getAttribute('data-apply-role');
    if (role === null) {
      const url = new URL(b.href, location.href);
      if (url.pathname !== location.pathname) return;
      role = roleFor(url.searchParams.get('role'));
    }
    e.preventDefault();
    goApply(role);
  }, true);

  /* ---------------------------------------------------------------------
     3. APPLICATION FORM
     --------------------------------------------------------------------- */
  if (!form) return;
  const GUARD = {
    MIN_MS: 3000, MAX_SENDS: 3, WINDOW_MS: 10 * 60 * 1000, KEY: 'saa-form-sends',
    /* the same cleaning as the server (Code.gs line_ and text_): control characters and the invisible marks a copied
       number or name can carry (bidi marks and isolates, zero-width space, BOM) go; ZWNJ/ZWJ stay; NBSP and every other space is a space */
    INVISIBLE: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g,
    nfc: v => { v = String(v || ''); return v.normalize ? v.normalize('NFC') : v; },
    line: v => GUARD.nfc(v).replace(GUARD.INVISIBLE, '').replace(/\s+/g, ' ').trim(),
    text: v => GUARD.nfc(v).replace(/\r\n?/g, '\n').replace(GUARD.INVISIBLE, '').replace(/[\u2028\u2029]/g, '').trim(),
    sends() {
      try {
        const a = JSON.parse(sessionStorage.getItem(GUARD.KEY) || '[]'), t = Date.now();
        return Array.isArray(a) ? a.filter(x => typeof x === 'number' && t - x < GUARD.WINDOW_MS) : [];
      } catch (_) { return []; }
    },
    limited: () => GUARD.sends().length >= GUARD.MAX_SENDS,
    record() { try { const a = GUARD.sends(); a.push(Date.now()); sessionStorage.setItem(GUARD.KEY, JSON.stringify(a)); } catch (_) { /* storage blocked */ } }
  };
  const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
  const digits = v => (v.match(/\d/g) || []).length;
  const phoneOk = v => /^\+?[0-9 ()./-]{6,30}$/.test(v) && digits(v) >= 7 && digits(v) <= 15;
  /* Arabic, Urdu and Hindi keyboards can type their own digits: the number is sent with 0-9 */
  const westDigits = v => String(v || '').replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660)
    .replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0).replace(/[\u0966-\u096F]/g, d => d.charCodeAt(0) - 0x966);
  const openMail = href => { window.location.href = href; };

  const fName = $('aName'), fEmail = $('aEmail'), fPhone = $('aPhone'), fLoc = $('aLoc');
  const fExp = $('aExp'), fAge = $('aAge'), fEdu = $('aEdu'), fMsg = $('aMsg'), fConsent = $('aConsent'), trap = $('aHpx'), fCv = $('aCv');
  const out = $('apMsg');
  const sendBtn = form.querySelector('button[type="submit"]'), sendLabel = sendBtn && sendBtn.querySelector('.ap-send-t');
  const SEND = sendLabel ? sendLabel.textContent : '', SENDING = T('Sending…');   /* the button while the CV uploads */
  const EMAIL_SAY = T(EMAIL_TEXT, 'assets/pages/careers-apply.js: the two recruitment email addresses, filled into the "email your CV to {x} directly" message');
  const readyAt = performance.now();
  let tried = false, sending = false;

  /* nationality: the country list, or the plain text box it replaces if the list did not load */
  let picker = null;
  let autoAE = false;   /* the UAE was filled in for Emiratisation registration, not chosen by the visitor */
  const natHost = $('aNatPick');
  if (natHost && window.SAACountryPicker && Array.isArray(window.SAA_COUNTRIES) && window.SAA_COUNTRIES.length) {
    try {
      picker = window.SAACountryPicker.create(natHost, {
        id: 'aNat', name: 'nationality', required: true, describedBy: 'aNatErr', lang: LANG,
        placeholder: T('Choose your nationality'), searchLabel: T('Search countries'),
        emptyLabel: T('No country found'), closeLabel: T('Close'),
        onChange: () => { autoAE = false; }
      });
    } catch (err) { picker = null; console.error(err); }
  }
  const fNat = picker ? picker.button : $('aNat');
  const country = code => (window.SAACountryPicker && window.SAACountryPicker.find(code)) || null;

  /* the recruitment system needs the country codes and file reading; otherwise the email form stays */
  const API = !!(API_URL && picker && fCv && window.fetch && window.FileReader);
  document.querySelectorAll('[data-apply-mode]').forEach(el => { el.hidden = el.getAttribute('data-apply-mode') !== (API ? 'api' : 'mail'); });
  if (API) {
    form.setAttribute('aria-describedby', 'apNoteApi');
    fCv.disabled = false;
    fCv.required = true;
  }

  /* Emiratisation registration is for UAE Nationals: it picks the UAE when no nationality is chosen yet,
     and takes it back if the visitor then moves to another role without choosing a country themselves */
  function emiratiNat() {
    if (!picker || !fRole) return;
    if (fRole.value === EMIRATI && !picker.value) { picker.setValue('AE'); autoAE = true; }
    else if (fRole.value !== EMIRATI && autoAE) { if (picker.value === 'AE') picker.setValue(''); autoAE = false; }
  }
  if (fRole) fRole.addEventListener('change', () => { emiratiNat(); recheck(); });
  emiratiNat();

  /* a quiet announcement when "Apply now" picks a role */
  const picked = document.createElement('p');
  picked.id = 'apPicked'; picked.className = 'sr-only'; picked.setAttribute('aria-live', 'polite');
  form.prepend(picked);

  /* ---------- the CV (recruitment system only) ---------- */
  const MAX_CV = 5 * 1024 * 1024;   /* the server's limit, admin-system/API.md */
  const CV_TYPES = {   /* extension -> type, and the bytes every real file of that kind starts with */
    pdf: ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
    doc: ['application/msword', [0xD0, 0xCF, 0x11, 0xE0]],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', [0x50, 0x4B]],
    jpg: ['image/jpeg', [0xFF, 0xD8, 0xFF]],
    jpeg: ['image/jpeg', [0xFF, 0xD8, 0xFF]],
    png: ['image/png', [0x89, 0x50, 0x4E, 0x47]]
  };
  const CV_MSG = {
    none: 'Please add your CV.',
    type: 'Please choose a PDF, Word (DOC or DOCX), JPG or PNG file.',
    size: 'Your CV is larger than 5 MB. Please choose a smaller file.',
    read: 'This file could not be read. Please choose your CV again.',
    fake: 'This file does not look like a real PDF, Word, JPG or PNG file. Please save your CV as a PDF, or take a photo of it, and choose that file.'
  };
  let cvFile = null, cvWhy = 'none', cvCheck = null;
  /* the extension, or one from the file type when a phone gives a name without it */
  function cvExt(f) {
    const m = /\.([A-Za-z0-9]+)$/.exec(f.name || '');
    if (m) return CV_TYPES[m[1].toLowerCase()] ? m[1].toLowerCase() : '';
    return Object.keys(CV_TYPES).find(k => CV_TYPES[k][0] === f.type) || '';
  }
  const cvName = f => (/\.[A-Za-z0-9]+$/.test(f.name || '') ? f.name : (f.name || 'cv') + '.' + cvExt(f));
  function readAs(f, how) {
    return new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => fail(r.error);
      r[how](f);
    });
  }
  function checkCv(f) {
    if (!f) return Promise.resolve('none');
    const ext = cvExt(f);
    if (!ext) return Promise.resolve('type');
    if (f.size > MAX_CV) return Promise.resolve('size');
    if (!f.size) return Promise.resolve('read');
    return readAs(f.slice(0, 8), 'readAsArrayBuffer').then(buf => {
      const b = new Uint8Array(buf);
      return CV_TYPES[ext][1].every((x, i) => b[i] === x) ? '' : 'fake';
    }, () => 'read');
  }
  const kb = n => n < 1024 * 1024 ? T('{n} KB', { n: Math.max(1, Math.round(n / 1024)) }) : T('{n} MB', { n: (n / 1048576).toFixed(1) });
  function showFile(f) {
    const none = $('aCvNone'), name = $('aCvName');
    if (none) none.hidden = !!f;
    /* the name and the size each in their own isolate (FSI ... PDI), so an Arabic or Urdu file name keeps
       its extension and the line follows the page's direction; the size does not break across lines */
    if (name) { name.hidden = !f; name.textContent = f ? '\u2068' + f.name + '\u2069 · \u2068' + kb(f.size).replace(/ /g, '\u00a0') + '\u2069' : ''; }
    const box = fCv && fCv.closest('.ap-file');
    if (box) box.classList.toggle('has-file', !!f);
  }
  if (API) fCv.addEventListener('change', () => {
    const f = (fCv.files && fCv.files[0]) || null;
    cvFile = f; cvWhy = f ? 'wait' : 'none';
    showFile(f);
    cvCheck = checkCv(f).then(why => {
      if (cvFile !== f) return why;
      cvWhy = why;
      /* a wrong file shows its error at once; a missing one only after a first try */
      setErr(fCv, why && (f || tried) ? T(CV_MSG[why]) : '');
      return why;
    });
  });

  function setErr(el, text) {
    const e = $(el.id + 'Err'); if (e) e.textContent = text || '';
    if (text) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  }
  /* the server's rules (admin-system/API.md), checked here first so a normal visitor never meets them */
  const nameApiOk = v => {
    v = v.replace(/[\u2018\u2019\u02BC`]/g, "'");
    return /^[\p{L}\p{M}\u200C\u200D\u00B7\u30FB .'-]+$/u.test(v) && /\p{L}/u.test(v) && !/http|www\./i.test(v);   /* · and ・ join the parts of Chinese and Japanese names */
  };
  const phoneApiOk = v => /^[0-9 +()-]{7,30}$/.test(v) && /^\+?[^+]*$/.test(v) && digits(v) >= 7 && digits(v) <= 15;
  const links = v => (v.match(/\b(?:https?:\/\/|www\.)\S*/gi) || []).length;
  /* age: a whole number of years, 18 to 75, typed with any digits (0 = not valid). Education: one of the server's
     EDUCATION values, which are the select's option values in careers.html, in the same order */
  const ageOf = v => { v = westDigits(GUARD.line(v)); return /^\d{1,3}$/.test(v) && +v >= 18 && +v <= 75 ? +v : 0; };
  const eduOk = v => !!v && [...fEdu.options].some(o => o.value === v);
  function validate() {
    const bad = [];
    const chk = (ok, el, text) => { setErr(el, ok ? '' : T(text)); if (!ok) bad.push(el); };
    const nv = GUARD.line(fName.value), ev = GUARD.line(fEmail.value), pv = westDigits(GUARD.line(fPhone.value));
    const lv = GUARD.line(fLoc.value), mv = GUARD.text(fMsg.value);
    chk(!!fRole.value, fRole, 'Please choose a role, General application or Emiratisation registration.');
    chk(nv.length >= 2 && nv.length <= 100 && (!API || nameApiOk(nv)), fName,
      nv.length > 100 ? 'Please shorten your name to 100 characters.' : nv.length < 2 ? 'Please enter your full name.' : 'Please write your name in letters only, without numbers or symbols.');
    chk(EMAIL_RE.test(ev) && ev.length <= 254 && (!API || ev.indexOf('@') <= 64), fEmail, ev ? 'Please check your email address, for example name@example.com.' : 'Please enter your email address.');
    chk(API ? phoneApiOk(pv) : phoneOk(pv), fPhone, pv ? 'Please check your phone number. Use digits, spaces and an optional + at the start.' : 'Please enter a phone or WhatsApp number.');
    if (picker) chk(!!picker.value, fNat, 'Please choose your nationality.');
    else { const tv = GUARD.line(fNat.value); chk(tv.length >= 2 && tv.length <= 60, fNat, 'Please enter your nationality.'); }
    chk(lv.length >= 2 && lv.length <= 80, fLoc, 'Please enter your current city and country.');
    chk(!!fExp.value, fExp, 'Please choose your years of experience.');
    /* checked only when the page has the fields: a careers.html cached from before them can meet this script for a few minutes */
    if (fAge) chk(!!ageOf(fAge.value), fAge, 'Please enter your age in years (18 to 75).');
    if (fEdu) chk(eduOk(fEdu.value), fEdu, 'Please choose your highest education.');
    if (API) chk(!cvWhy || cvWhy === 'wait', fCv, CV_MSG[cvWhy] || CV_MSG.none);
    chk(mv.length <= 1500 && (!API || links(mv) <= 2), fMsg, mv.length > 1500 ? 'Please keep your message under 1,500 characters.' : 'Please include no more than two links in your message.');
    chk(fConsent.checked, fConsent, 'Please tick this box so we can use your details for recruitment.');
    return bad;
  }
  const clearOut = () => { out.textContent = ''; out.className = 'form-msg ap-msg'; };
  function recheck() { if (!tried) return; const bad = validate(); if (!bad.length && out.classList.contains('err')) clearOut(); }
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  const say = text => { out.className = 'form-msg ap-msg err'; out.textContent = text; };
  const ICON_OK = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function thanks(name) {
    out.className = 'form-msg ap-msg ok';
    out.innerHTML = '';
    const ic = document.createElement('span'); ic.className = 'ok-ic'; ic.innerHTML = ICON_OK;
    const txt = document.createElement('span');
    const b = document.createElement('b'); b.textContent = name;
    const a = document.createElement('a'); a.href = 'mailto:' + EMAIL; a.textContent = EMAIL_TEXT;
    const cv = document.createElement('strong'); cv.textContent = 'Attach your CV (PDF) to that email before you press send.';
    if (name) txt.append('Thank you, ', b, '. '); else txt.append('Thank you. ');
    txt.append('Your email app should now open with your application to ', a, '. ', cv,
      ' If nothing opens, email your CV to ' + EMAIL_TEXT + ' with the role in the subject, or call +971 2 627 0622.');
    out.append(ic, txt);
  }
  /* sent to the recruitment system: the thank-you with the reference number */
  function thanksSent(name, ref) {
    out.className = 'form-msg ap-msg ok';
    out.innerHTML = '';
    const ic = document.createElement('span'); ic.className = 'ok-ic'; ic.innerHTML = ICON_OK;
    const box = document.createElement('span'); box.className = 'ap-ok';
    const line = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.setAttribute('data-i18n-skip', ''); s.textContent = text; box.appendChild(s); return s; };
    line('ap-ok-t', name ? T('Thank you, {x}. We have received your application.', { x: name }) : T('Thank you. We have received your application.'));
    if (ref) {
      const lab = T('Your reference number:');   /* a full-width colon (Chinese ：) takes no space after it */
      const r = line('ap-ok-ref', /\uFF1A$/.test(lab) ? lab : lab + ' ');
      const b = document.createElement('b'); b.textContent = ref; b.setAttribute('translate', 'no'); b.setAttribute('dir', 'ltr');
      r.appendChild(b);
    }
    line('ap-ok-d', T('Our recruitment team will review your application and contact you.'));
    out.append(ic, box);
  }

  function collect() {
    return {
      role: GUARD.line(fRole.value), name: GUARD.line(fName.value), email: GUARD.line(fEmail.value), phone: westDigits(GUARD.line(fPhone.value)),
      nationality: picker ? picker.value : GUARD.line(fNat.value),
      location: GUARD.line(fLoc.value), experience: GUARD.line(fExp.value), age: fAge ? ageOf(fAge.value) : undefined, education: fEdu ? GUARD.line(fEdu.value) : undefined,
      message: GUARD.text(fMsg.value)
    };
  }

  /* email mode, and the fallback when the recruitment system cannot be reached; the email text stays English */
  function sendMail(data) {
    const c = picker ? country(data.nationality) : null;
    const nat = c ? c.name : data.nationality;
    const kind = data.role === EMIRATI ? 'Emiratisation registration' : 'Job application';
    const lines = [
      kind,
      '',
      'Role: ' + data.role,
      'Full name: ' + data.name,
      'Email: ' + data.email,
      'Phone / WhatsApp: ' + data.phone,
      'Nationality: ' + nat,
      'Current location: ' + data.location,
      'Years of experience: ' + data.experience
    ];
    if (data.age !== undefined) lines.push('Age: ' + data.age);
    if (data.education !== undefined) lines.push('Highest education: ' + data.education);
    if (data.message) lines.push('', 'Message:', data.message);
    lines.push('', 'CV: attached as a PDF.', '',
      'I agree that SAA Group may use my details for recruitment, as described in its privacy policy.',
      'Sent from the careers page of the SAA Group website.');
    const subject = GUARD.line((data.role === EMIRATI ? kind : kind + ': ' + data.role) + ' · ' + data.name);
    const href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));

    GUARD.record();
    thanks(data.name);
    form.dispatchEvent(new CustomEvent('saa:form-sent', { bubbles: true, detail: { form: 'applyForm' } }));
    openMail(href);
  }

  /* ---------- recruitment system mode ---------- */
  function setSending(on) {
    sending = on;
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    if (!sendBtn) return;
    sendBtn.disabled = on;
    sendBtn.classList.toggle('is-sending', on);
    if (sendLabel) sendLabel.textContent = on ? SENDING : SEND;
  }
  /* the message, and when it helps, a button that sends the same application by email instead */
  function sayWithMail(text, data) {
    say('');
    const t = document.createElement('span'); t.className = 'ap-err-t'; t.textContent = text;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ghost ap-mail-btn';
    b.textContent = T('Send by email instead');
    b.addEventListener('click', () => sendMail(data));
    out.append(t, b);
  }
  function showMsg() {
    out.setAttribute('tabindex', '-1');
    if (!form.contains(document.activeElement) || document.activeElement === sendBtn) out.focus({ preventScroll: true });
    const r = out.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight) {
      if (lenis && !REDUCE) lenis.scrollTo(out, { offset: -140, duration: .8 });
      else out.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' });
    }
  }
  const FIELDS = { role: fRole, name: fName, email: fEmail, phone: fPhone, nationality: fNat, location: fLoc, experience: fExp, age: fAge, education: fEdu, cv: fCv, message: fMsg, consent: fConsent };
  /* the server found a field the form let through: the same messages as the form's own checks */
  function fieldMsg(k, server) {
    const m = String(server || '');
    switch (k) {
      case 'role': return 'Please choose a role, General application or Emiratisation registration.';
      case 'name': return 'Please write your name in letters only, without numbers or symbols.';
      case 'email': return 'Please check your email address, for example name@example.com.';
      case 'phone': return 'Please check your phone number. Use digits, spaces and an optional + at the start.';
      case 'nationality': return 'Please choose your nationality.';
      case 'location': return 'Please enter your current city and country.';
      case 'experience': return 'Please choose your years of experience.';
      case 'age': return 'Please enter your age in years (18 to 75).';
      case 'education': return 'Please choose your highest education.';
      case 'message': return /link/i.test(m) ? 'Please include no more than two links in your message.' : 'Please keep your message under 1,500 characters.';
      case 'consent': return 'Please tick this box so we can use your details for recruitment.';
      case 'cv': return CV_MSG[/5 MB/.test(m) ? 'size' : /PDF, Word/.test(m) ? 'type' : /not a real/.test(m) ? 'fake' : /^Attach/.test(m) ? 'none' : 'read'];
    }
    return m;
  }
  function failed(res, data) {
    const code = res && res.error;
    if (code === 'invalid' && res.fields && typeof res.fields === 'object') {
      const bad = [];
      Object.keys(res.fields).forEach(k => {
        const el = FIELDS[k];
        if (!el) return;
        setErr(el, T(fieldMsg(k, res.fields[k])));
        bad.push(el);
      });
      if (bad.length) {
        bad.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        say(bad.length === 1 ? T('Please check the highlighted field.') : T('Please check the {n} highlighted fields.', { n: bad.length }));
        bad[0].focus();
        return;
      }
    }
    if (code === 'rate_limited') {
      /* the per-email limit (its message also says tomorrow) has no email button: that would only get round it */
      const m = String(res.message || '');
      if (/email/i.test(m)) say(T('We have already received three applications from this email address in the last 24 hours. Please try again tomorrow.'));
      else sayWithMail(/today|tomorrow/i.test(m)
        ? T('We have received a lot of applications today. Please try again tomorrow, or send your application by email instead.')
        : T('We are receiving a lot of applications right now. Please try again in a few minutes, or send your application by email instead.'), data);
    } else if (code === 'spam') {
      /* the hidden field was filled (or the clock looked wrong): a person whose browser did that can still email */
      sayWithMail(T('Sorry, your application could not be sent. Please try again in a few minutes.'), data);
    } else {
      sayWithMail(T('Something went wrong on our side. Please try again in a few minutes, or send your application by email instead.'), data);
    }
    showMsg();
  }
  function sendApi(data) {
    const f = cvFile;
    if (sending) return;
    setSending(true);
    clearOut();
    out.className = 'form-msg ap-msg wait';
    out.textContent = T('Sending your application and CV. This can take a minute on a slow connection.');
    readAs(f, 'readAsDataURL').then(url => {
      const s = String(url || ''), at = s.indexOf(',');
      /* the wait includes the upload: 60 s, plus 25 s for each MB of CV data, up to 5 minutes */
      const ms = Math.min(300000, 60000 + Math.round((s.length - at - 1) / 1048576 * 25000));
      return call({
        action: 'apply', role: data.role, name: data.name, email: data.email, phone: data.phone, nationality: data.nationality,
        location: data.location, experience: data.experience, age: data.age, education: data.education, message: data.message, consent: true,
        company_website: trap ? trap.value : '', elapsed: Math.round(performance.now() - readyAt), lang: LANG,
        cv: { name: cvName(f), type: f.type || CV_TYPES[cvExt(f)][0], size: f.size, data: at >= 0 ? s.slice(at + 1) : s }
      }, ms).then(res => {
        setSending(false);
        if (res && res.ok === true && res.ref) {
          GUARD.record();
          resetForm();
          thanksSent(data.name, String(res.ref));
          form.dispatchEvent(new CustomEvent('saa:form-sent', { bubbles: true, detail: { form: 'applyForm' } }));
          showMsg();
          return;
        }
        failed(res, data);
      }, () => {
        setSending(false);
        sayWithMail(T('We could not reach our recruitment system. Please check your connection and try again, or send your application by email instead.'), data);
        showMsg();
      });
    }, () => {
      setSending(false);
      clearOut();
      setErr(fCv, T(CV_MSG.read));
      say(T('Please check the highlighted field.'));
      fCv.focus();
    });
  }
  function resetForm() {
    form.reset();
    if (picker) picker.setValue('');
    autoAE = false;
    cvFile = null; cvWhy = 'none'; cvCheck = null;
    showFile(null);
    tried = false;
    Object.keys(FIELDS).forEach(k => { if (FIELDS[k]) setErr(FIELDS[k], ''); });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (sending) return;
    const data = collect();

    /* honeypot: a bot filled the hidden field. By email, look successful and send nothing; the recruitment
       system gets its value as company_website and answers spam (failed() then offers the email) */
    if (trap && trap.value && !API) { thanks(data.name); return; }

    tried = true;
    const go = () => {
      const bad = validate();
      if (bad.length) {
        say(bad.length === 1 ? T('Please check the highlighted field.') : T('Please check the {n} highlighted fields.', { n: bad.length }));
        bad[0].focus();
        return;
      }
      if (performance.now() - readyAt < GUARD.MIN_MS) { say(T('That was quick. Please wait a moment, then press Send application again.')); return; }
      if (GUARD.limited()) { say(T('You have sent several messages in the last few minutes. Please wait a little, or email your CV to {x} directly.', { x: EMAIL_SAY })); return; }
      if (API) sendApi(data); else sendMail(data);
    };
    /* the CV's first bytes are still being read (a moment after it was chosen): the form is busy until then,
       so a second tap on Send does nothing */
    if (API && cvWhy === 'wait' && cvCheck) {
      setSending(true);
      const resume = () => { setSending(false); go(); };
      cvCheck.then(resume, resume);
    } else go();
  });

  /* ---------------------------------------------------------------------
     Live jobs from the recruitment system. The jobs.js list stays until
     they arrive, and if the call fails. A changed list keeps the page
     where it was when the jobs section is already above the screen.
     --------------------------------------------------------------------- */
  if (API) call({ action: 'jobs' }, 30000).then(res => {
    if (!res || res.ok !== true || !Array.isArray(res.jobs)) return;
    const live = normJobs(res.jobs);
    if (JSON.stringify(live) === JSON.stringify(jobs)) return;
    const sec = $('jobs');
    const above = !!sec && sec.getBoundingClientRect().bottom < 0, h0 = sec ? sec.offsetHeight : 0, y0 = window.scrollY;
    jobs = live;
    renderJobs();
    fillRoles();
    if (fRole && !fRole.value) { const pre = roleFor(urlRole); if (pre) { fRole.value = pre; emiratiNat(); } }
    if (above && sec) {
      const d = sec.offsetHeight - h0;
      if (d && window.scrollY === y0) { if (lenis) lenis.scrollTo(y0 + d, { immediate: true, force: true }); else window.scrollTo(0, y0 + d); }
    }
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }).catch(() => { /* keep the jobs from jobs.js */ });

  /* ---------------------------------------------------------------------
     Modest reveal for the job rows (the static parts use data-reveal)
     --------------------------------------------------------------------- */
  if (SAA_READY && list) window.SAA.ready(({ gsap, ScrollTrigger, reduce }) => {
    if (reduce || !gsap || !ScrollTrigger) return;
    const rows = list.querySelectorAll('.job');
    if (!rows.length) return;
    gsap.from(rows, { y: 36, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, clearProps: 'opacity,transform',
      scrollTrigger: { trigger: list, start: 'top 88%', once: true } });
  });
})();
