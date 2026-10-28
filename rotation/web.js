/* =========================================================================
   SAA Rotation Control: web edition glue (loaded before app.js)

   app.js is the same dashboard that runs inside Claude. It talks to
   window.claude.use("db" | "user" | "downloads" | "mcp"). This file provides
   those four on top of the Google Apps Script backend (rotationApi in
   ../assets/js/config.js), and adds the sign-in screen and staff logins.

   - db         keeps a full copy of the records in memory, polls "sync" for
                changes, and batches saves into "write" calls
   - user       the signed-in staff member, from the login
   - downloads  saves files through a normal browser download
   - mcp        answers the dashboard's WhatsApp calls (written for Zapier) by
                sending through the backend, which calls Meta directly
   ========================================================================= */
(function () {
  'use strict';

  var API = (window.SAA_CONFIG && window.SAA_CONFIG.rotationApi) || '';
  var SKEY = 'rc-web-session';
  var POLL_MS = 15000, POLL_HIDDEN_MS = 90000;
  var session = null;           // {token, expires, user:{id,username,name,isOwner,role}}
  var users = [];               // [{id,username,name,owner}]
  var wa = { ready: false };
  var signedIn = deferred();    // resolves once someone has signed in
  var synced = deferred();      // resolves after the first full sync

  function deferred() { var d = {}; d.promise = new Promise(function (res) { d.resolve = res; }); return d; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function ss() { try { return window.sessionStorage; } catch (e) { return null; } }

  /* ---------- backend calls ---------- */
  function ApiError(code, message) { this.code = code; this.message = message; }
  function call(action, fields, timeout) {
    if (!API) return Promise.reject(new ApiError('not_configured', 'The dashboard isn\'t connected to its server yet (rotationApi in assets/js/config.js).'));
    var body = Object.assign({ action: action }, fields || {});
    if (session && action !== 'login' && action !== 'setup' && action !== 'hello') body.token = session.token;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout || 45000);
    return fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.text(); }).then(function (t) {
      clearTimeout(timer);
      var d; try { d = JSON.parse(t); } catch (e) { d = null; }
      if (!d || typeof d !== 'object') throw new ApiError('server', 'The server sent an answer the dashboard could not read.');
      if (d.ok !== true) {
        if (d.error === 'auth' && session) sessionLost(d.message);
        throw new ApiError(d.error || 'server', d.message || 'Something went wrong on the server.');
      }
      return d;
    }, function (err) {
      clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      throw new ApiError('network', 'Could not reach the server. Check the internet connection and try again.');
    });
  }
  /* The dashboard's own error codes (see writeErrMsg in app.js). */
  function dbErr(e) {
    var c = e && e.code;
    return { code: c === 'forbidden' || c === 'invalid_argument' ? 'invalid_argument' : c === 'quota_exceeded' ? 'quota_exceeded' : c === 'busy' || c === 'rate_limited' ? 'resource_exhausted' : 'unavailable', message: e && e.message };
  }

  /* ---------- session ---------- */
  function saveSession() { var s = ss(); if (s) { try { s.setItem(SKEY, JSON.stringify(session)); } catch (e) {} } }
  function loadSession() {
    var s = ss(), o = null;
    try { o = JSON.parse(s && s.getItem(SKEY) || 'null'); } catch (e) { o = null; }
    if (!o || !/^[a-f0-9]{64}$/.test(o.token || '') || !o.user) return null;
    return o;
  }
  function begin(d) {
    var prev = session && session.user && session.user.id;
    session = { token: d.token, expires: d.expires, user: d.user };
    if (d.users) users = d.users;
    if (d.wa) wa = d.wa;
    saveSession();
    var s = ss(); if (s) { try { s.setItem('rc-signin', d.user.id); } catch (e) {} }
    if (wa.ready) { try { localStorage.setItem('rc-zap-used', '1'); } catch (e) {} }
    if (prev && prev !== d.user.id) { location.reload(); return; }
    hideLogin();
    signedIn.resolve(session.user);
    startSync();
  }
  function sessionLost(msg) {
    session = null;
    var s = ss(); if (s) { try { s.removeItem(SKEY); } catch (e) {} }
    showLogin(msg || 'Your session ended. Please sign in again.');
  }
  function signOut() {
    var t = session && session.token;
    var s = ss(); if (s) { try { s.removeItem(SKEY); s.removeItem('rc-signin'); } catch (e) {} }
    session = null;
    (t ? fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'logout', token: t }) }).catch(function () {}) : Promise.resolve())
      .then(function () { location.replace(location.pathname); });
  }

  /* ---------- sign-in screen (same look as the dashboard's gate) ---------- */
  var loginEl = null, mode = 'login';
  function showLogin(msg) {
    if (!loginEl) {
      loginEl = document.createElement('div');
      loginEl.className = 'gate web-gate';
      loginEl.id = 'webGate';
      loginEl.setAttribute('role', 'dialog');
      loginEl.setAttribute('aria-modal', 'true');
      loginEl.setAttribute('aria-labelledby', 'webGateH');
      document.body.appendChild(loginEl);
      loginEl.addEventListener('submit', onLoginSubmit);
      loginEl.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-web-mode]');
        if (b) { ev.preventDefault(); mode = b.getAttribute('data-web-mode'); renderLogin(''); }
      });
    }
    loginEl.hidden = false;
    renderLogin(msg || '');
  }
  function hideLogin() { if (loginEl) loginEl.hidden = true; }
  function renderLogin(msg) {
    var setup = mode === 'setup';
    var h = '<div class="gate-box"><div class="gate-brand"><span class="saa-logo" role="img" aria-label="SAA Group"></span><div><div class="gate-title">SAA GROUP</div><div class="gate-sub">Rotation Control · Staff sign-in</div></div></div>' +
      '<form class="gate-card web-login" novalidate>' +
      '<h2 id="webGateH">' + (setup ? 'Create the owner account' : 'Sign in') + '</h2>' +
      '<p class="lead">' + (setup ? 'First-time setup. Use the setup code from the server\'s Script properties. After this, the owner adds everyone else under Settings.' : 'Use the username and password the owner gave you.') + '</p>' +
      (msg ? '<div class="note bad"><span>' + esc(msg) + '</span></div>' : '') +
      (setup ? '<div class="field"><label for="wlCode">Setup code</label><input id="wlCode" autocomplete="off" required></div><div class="field"><label for="wlName">Your name</label><input id="wlName" autocomplete="name" maxlength="80" required></div>' : '') +
      '<div class="field"><label for="wlUser">Username</label><input id="wlUser" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" required></div>' +
      '<div class="field"><label for="wlPass">Password</label><input id="wlPass" type="password" autocomplete="' + (setup ? 'new-password' : 'current-password') + '" maxlength="200" required>' + (setup ? '<small>At least 8 characters.</small>' : '') + '</div>' +
      '<button class="btn btn-primary btn-lg" type="submit" id="wlGo">' + (setup ? 'Create account and sign in' : 'Sign in') + '</button>' +
      '</form>' +
      '<p class="gate-foot">' + (setup ? '<a href="#" data-web-mode="login">I already have an account</a>' : 'Forgot your password? Ask the owner to reset it.') + '</p></div>';
    loginEl.innerHTML = h;
    var f = $(setup ? 'wlCode' : 'wlUser'); if (f) { try { f.focus(); } catch (e) {} }
  }
  function onLoginSubmit(ev) {
    ev.preventDefault();
    var setup = mode === 'setup', go = $('wlGo');
    var fields = { username: ($('wlUser').value || '').trim(), password: $('wlPass').value || '' };
    if (setup) { fields.code = ($('wlCode').value || '').trim(); fields.name = ($('wlName').value || '').trim(); }
    if (!fields.username || !fields.password) { renderLogin('Enter your username and password.'); return; }
    go.disabled = true; go.textContent = 'Signing in…';
    call(setup ? 'setup' : 'login', fields, 60000).then(begin, function (e) {
      renderLogin(e.message);
      var u = $('wlUser'); if (u) u.value = fields.username;
    });
  }

  /* ---------- db: in-memory copy plus polling ---------- */
  var store = {};               // "collection/id" -> data
  var since = 0, syncing = false, pollTimer = null, syncedOnce = false;
  var listeners = [];
  function startSync() { if (!syncing && !pollTimer) syncNow(); }
  function schedulePoll(ms) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(syncNow, ms != null ? ms : (document.hidden ? POLL_HIDDEN_MS : POLL_MS));
  }
  function syncNow() {
    if (!session) { pollTimer = null; return; }
    if (syncing) return;
    syncing = true;
    call('sync', { since: since }, 60000).then(function (d) {
      var changed = {};
      if (d.full) { Object.keys(store).forEach(function (p) { changed[p] = 1; }); store = {}; }
      (d.changes || []).forEach(function (c) { if (c.data == null) delete store[c.path]; else store[c.path] = c.data; changed[c.path] = 1; });
      since = d.ver || since;
      var first = !syncedOnce; syncedOnce = true;
      if (first) synced.resolve();
      fire(first ? null : changed);
    }, function (e) {
      if (!syncedOnce && e.code !== 'auth') listeners.forEach(function (L) { if (L.err) L.err({ code: 'unavailable', message: e.message }); });
    }).then(function () { syncing = false; schedulePoll(); });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && session && syncedOnce) schedulePoll(300); });
  window.addEventListener('focus', function () { if (session && syncedOnce) schedulePoll(300); });

  function colOf(p) { return p.slice(0, p.indexOf('/')); }
  function docSnap(path) {
    var d = store[path];
    return { id: path.slice(path.indexOf('/') + 1), exists: d !== undefined, data: function () { return d === undefined ? undefined : clone(d); } };
  }
  function cmpVal(a, b) { if (a == null && b == null) return 0; if (a == null) return -1; if (b == null) return 1; return a < b ? -1 : a > b ? 1 : 0; }
  function colSnap(L) {
    var pre = L.col + '/';
    var docs = Object.keys(store).filter(function (p) { return p.indexOf(pre) === 0; }).map(function (p) {
      var d = store[p]; return { id: p.slice(pre.length), _d: d, data: function () { return clone(d); } };
    });
    if (L.order) { var f = L.order, dir = L.dir === 'desc' ? -1 : 1; docs.sort(function (x, y) { return dir * cmpVal(x._d && x._d[f], y._d && y._d[f]); }); }
    if (L.limit) docs = docs.slice(0, L.limit);
    return { docs: docs, size: docs.length, empty: !docs.length };
  }
  function fireOne(L) {
    try { L.cb(L.path ? docSnap(L.path) : colSnap(L)); } catch (e) { if (window.console) console.error(e); }
  }
  function fire(changed) {
    listeners.slice().forEach(function (L) {
      if (changed) {
        var hit = Object.keys(changed).some(function (p) { return L.path ? p === L.path : colOf(p) === L.col; });
        if (!hit) return;
      }
      fireOne(L);
    });
  }
  function listen(L) {
    listeners.push(L);
    if (syncedOnce) setTimeout(function () { if (listeners.indexOf(L) >= 0) fireOne(L); }, 0);
    return function () { var i = listeners.indexOf(L); if (i >= 0) listeners.splice(i, 1); };
  }

  /* Saves made in the same moment go to the server in one request. */
  var queue = [], flushTimer = null;
  function enqueue(op, path, data) {
    return new Promise(function (resolve, reject) {
      queue.push({ op: op, path: path, data: data == null ? undefined : clone(data), resolve: resolve, reject: reject });
      if (queue.length >= 60) flush(); else if (!flushTimer) flushTimer = setTimeout(flush, 40);
    });
  }
  function flush() {
    clearTimeout(flushTimer); flushTimer = null;
    var batch = queue.splice(0, 60);
    if (!batch.length) return;
    call('write', { ops: batch.map(function (b) { return { op: b.op, path: b.path, data: b.data }; }) }, 60000).then(function (d) {
      var changed = {};
      batch.forEach(function (b, i) {
        var r = d.results && d.results[i];
        if (r && r.ok) { if (r.data == null) delete store[b.path]; else store[b.path] = r.data; changed[b.path] = 1; b.resolve(); }
        else b.reject(dbErr({ code: r && r.error || 'server' }));
      });
      fire(changed);
      schedulePoll(1500);
    }, function (e) { batch.forEach(function (b) { b.reject(dbErr(e)); }); });
    if (queue.length) flushTimer = setTimeout(flush, 40);
  }

  function docRef(path) {
    return {
      id: path.slice(path.indexOf('/') + 1),
      set: function (d) { return enqueue('set', path, d); },
      update: function (d) { return enqueue('update', path, d); },
      delete: function () { return enqueue('delete', path); },
      get: function () { return synced.promise.then(function () { return docSnap(path); }); },
      onSnapshot: function (cb, err) { return listen({ path: path, cb: cb, err: err }); }
    };
  }
  function query(col, order, dir, limit) {
    return {
      orderBy: function (f, d) { return query(col, f, d || 'asc', limit); },
      limit: function (n) { return query(col, order, dir, n); },
      get: function () { return synced.promise.then(function () { return colSnap({ col: col, order: order, dir: dir, limit: limit }); }); },
      onSnapshot: function (cb, err) { return listen({ col: col, order: order, dir: dir, limit: limit, cb: cb, err: err }); }
    };
  }
  function newId() { var a = new Uint8Array(10); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  var db = {
    collection: function (c) {
      var q = query(c);
      q.doc = function (id) { return docRef(c + '/' + id); };
      q.add = function (d) { var id = newId(); return enqueue('set', c + '/' + id, d).then(function () { return { id: id }; }); };
      return q;
    },
    doc: function (p) { return docRef(p); }
  };

  /* ---------- user ---------- */
  var userApi = {
    me: function () {
      return signedIn.promise.then(function (u) { return { id: u.id, name: u.name || u.username, email: u.username, avatarUrl: '', isOwner: !!u.isOwner }; });
    },
    can: function () { return Promise.resolve(true); },
    profiles: function (ids) {
      var out = {}, me = session && session.user && session.user.id;
      (ids || []).forEach(function (id) {
        var u = users.filter(function (x) { return x.id === id; })[0];
        if (u) out[id] = { id: id, name: u.name || u.username, email: u.username, avatarUrl: '', isMe: id === me };
      });
      return Promise.resolve(out);
    }
  };
  function refreshUsers() { return call('users').then(function (d) { users = d.users || []; }); }

  /* ---------- downloads ---------- */
  var downloads = {
    save: function (o) {
      try {
        var blob = o.data instanceof Blob ? o.data : new Blob([o.data == null ? '' : o.data], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = o.filename || 'download'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        return Promise.resolve({ status: 'saved' });
      } catch (e) { return Promise.reject({ code: 'unavailable', message: String(e) }); }
    }
  };

  /* ---------- mcp: the dashboard's WhatsApp calls, answered by the backend ---------- */
  var tplList = null;
  function templates(fresh) {
    if (tplList && !fresh) return Promise.resolve(tplList);
    return call('templates', { fresh: !!fresh }, 60000).then(function (d) { tplList = d.templates || []; return tplList; });
  }
  function upstream(e) { return e && e.code === 'wa_not_setup' ? { code: 'tool_error', message: e.message } : { code: e && e.code === 'rate_limited' ? 'tool_error' : 'upstream_error', message: e && e.message }; }
  function zapAction(params, schema) {
    return { app: 'WhatsApp Business', selected_api: 'App228834CLIAPI', actions: [{ key: 'send_template_message', tool_name: 'whatsapp_business_send_template_message', params: params || [], dynamic_properties_schema: schema }] };
  }
  function digits(x) { return String(x || '').replace(/\D/g, ''); }
  var mcp = {
    listTools: function () {
      return signedIn.promise.then(function () { return { servers: wa.ready ? [{ server: 'Zapier', authStatus: 'ok' }] : [] }; });
    },
    callTool: function (server, tool, input) {
      input = input || {};
      var p = input.params || {};
      if (tool === 'inspect_zapier_actions') {
        if (input.enum_property === 'template') {
          return templates(true).then(function (list) {
            return { payload: { apps: [zapAction([{ key: 'template', dynamic_enum_values: list.map(function (t) { return { value: t.value, label: t.label }; }) }])] } };
          }, function (e) { throw upstream(e); });
        }
        return templates(false).then(function (list) {
          var t = list.filter(function (x) { return x.value === p.template; })[0], props = {};
          for (var i = 1; i <= (t ? t.params : 0); i++) props['param_' + i] = { title: '{{' + i + '}}' };
          return { payload: { apps: [zapAction([], { properties: props })] } };
        }, function (e) { throw upstream(e); });
      }
      if (tool === 'execute_zapier_write_action' && input.action === 'send_template_message') {
        var dp = p.dynamic_properties || {}, vals = [];
        Object.keys(dp).forEach(function (k) { var m = /(\d+)$/.exec(k); if (m) vals[+m[1] - 1] = dp[k]; });
        for (var j = 0; j < vals.length; j++) if (vals[j] == null) vals[j] = '';
        return call('sendTemplate', { to: digits(p.recipient), template: p.template, params: vals }, 60000).then(function (d) {
          return { payload: d.metaError ? { error: d.metaError } : { status: 'success', id: d.id } };
        }, function (e) { throw upstream(e); });
      }
      if (tool === 'execute_zapier_write_action' && input.action === 'send_freeform_message') {
        return call('sendText', { to: digits(p.recipient), text: p.message_text }, 60000).then(function (d) {
          return { payload: d.metaError ? { error: d.metaError } : { status: 'success', id: d.id } };
        }, function (e) { throw upstream(e); });
      }
      if (tool === 'execute_zapier_read_action' && input.action === 'get_all_values') {
        return call('inboxRaw', {}, 60000).then(function (d) { return { payload: { results: [d.items || {}] } }; }, function (e) { throw upstream(e); });
      }
      if (tool === 'execute_zapier_write_action' && input.action === 'set_multiple_values') {
        return call('inboxClear', { keys: Object.keys(p.keys_values || {}) }).then(function () { return { payload: { status: 'success' } }; }, function (e) { throw upstream(e); });
      }
      return Promise.reject({ code: 'not_in_manifest' });
    }
  };

  window.claude = {
    use: function (name) {
      if (name === 'db') return Promise.resolve(db);
      if (name === 'user') return Promise.resolve(userApi);
      if (name === 'downloads') return Promise.resolve(downloads);
      if (name === 'mcp') return Promise.resolve(mcp);
      return Promise.reject({ code: 'unavailable' });
    }
  };

  /* ---------- staff tools in Settings (buttons the web build adds) ---------- */
  function toast(msg, bad) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, bad ? 6500 : 3500);
  }
  function setErr(id, msg) { var el = $(id); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = label; } else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; } }
  function clearFields(ids) { ids.forEach(function (id) { var el = $(id); if (el) { el.value = ''; el.defaultValue = ''; } }); }

  var actions = {
    signout: function () { signOut(); },
    adduser: function (btn) {
      var f = { name: ($('wuName').value || '').trim(), username: ($('wuUser').value || '').trim(), password: $('wuPass').value || '', role: $('wuRole').value };
      setErr('wuError', '');
      if (!f.name || !f.username || !f.password) { setErr('wuError', 'Fill in their name, a username and a starting password.'); return; }
      busy(btn, true, 'Adding…');
      call('addUser', f, 60000).then(function (d) {
        users = d.users || users;
        clearFields(['wuName', 'wuUser', 'wuPass']);
        toast(f.name + ' can now sign in as “' + d.user.username + '”. Give them the password in person or by phone.');
        schedulePoll(200);
      }, function (e) { setErr('wuError', e.message); }).then(function () { busy(btn, false); });
    },
    resetpw: function (btn) {
      var id = btn.getAttribute('data-id'), u = users.filter(function (x) { return x.id === id; })[0];
      var pw = window.prompt('New password for ' + (u ? u.name || u.username : 'this person') + ' (at least 8 characters):');
      if (pw == null) return;
      busy(btn, true, 'Saving…');
      call('resetPassword', { id: id, password: pw }).then(function () { toast('Password changed. Tell them the new one in person or by phone.'); }, function (e) { toast(e.message, true); }).then(function () { busy(btn, false); });
    },
    changepw: function (btn) {
      var old = window.prompt('Your current password:'); if (old == null) return;
      var pw = window.prompt('Your new password (at least 8 characters):'); if (pw == null) return;
      busy(btn, true, 'Saving…');
      call('changePassword', { old: old, password: pw }).then(function () { toast('Your password is changed.'); }, function (e) { toast(e.message, true); }).then(function () { busy(btn, false); });
    },
    importfile: function () { var i = $('wiFile'); if (i) i.click(); }
  };
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-web]');
    if (!b || !actions[b.getAttribute('data-web')]) return;
    ev.preventDefault();
    actions[b.getAttribute('data-web')](b);
  });
  /* Bringing records over from the Claude version: a JSON file of {docs:{"collection/id": data}}. */
  document.addEventListener('change', function (ev) {
    if (!ev.target || ev.target.id !== 'wiFile' || !ev.target.files || !ev.target.files[0]) return;
    var file = ev.target.files[0], input = ev.target;
    var r = new FileReader();
    r.onload = function () {
      var o; try { o = JSON.parse(r.result); } catch (e) { o = null; }
      var docs = o && (o.docs || o);
      input.value = '';
      if (!docs || typeof docs !== 'object') { toast('That file isn\'t a Rotation Control export.', true); return; }
      var n = Object.keys(docs).length;
      if (!window.confirm('Import ' + n + ' records? Records with the same employee number or name are replaced.')) return;
      toast('Importing ' + n + ' records…');
      call('importDocs', { docs: docs }, 300000).then(function (d) { toast('Imported ' + d.count + ' records.'); schedulePoll(200); }, function (e) { toast(e.message, true); });
    };
    r.readAsText(file);
  });

  /* ---------- start ---------- */
  function start() {
    var s = loadSession();
    if (s && Date.parse(s.expires) > Date.now()) {
      session = s;
      call('me').then(function (d) {
        session.user = d.user; wa = d.wa || wa; saveSession();
        return refreshUsers();
      }).then(function () {
        hideLogin(); signedIn.resolve(session.user); startSync();
      }, function (e) {
        if (e.code === 'auth') return;          // sessionLost already showed the sign-in screen
        showLogin(e.message);
      });
      return;
    }
    showLogin('');
    call('hello').then(function (d) { if (d.needsSetup) { mode = 'setup'; renderLogin(''); } }, function (e) { renderLogin(e.message); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
