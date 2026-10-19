/* =========================================================================
   SAA GROUP — cookie consent and analytics (v2)
   - Shows a cookie banner on the first visit, once the preloader is done.
   - Settings dialog: Necessary (always on) and Analytics (off by default).
   - Loads Google Analytics 4 only after the visitor accepts analytics and only
     when SAA_CONFIG.analytics.ga4 holds a valid ID (see assets/js/config.js).
   - Any element with [data-cookie-settings] opens the settings.
   API:  SAA.consent.get()  SAA.consent.open()  SAA.consent.set({ analytics })
         SAA.track(name, params)   window event 'saa:consent' on every change.
   No inline scripts: the GA bootstrap lives here so the strict CSP holds.
   ========================================================================= */
(function () {
  'use strict';
  var SAA = window.SAA = window.SAA || {};
  var CFG = window.SAA_CONFIG || {};
  var KEY = 'saa-consent', VERSION = 1;
  var doc = document.documentElement, body = document.body;
  var PAGE = (body && body.dataset.page) || '';
  var GA_ID = String((CFG.analytics && CFG.analytics.ga4) || CFG.gaId || '').trim().toUpperCase();
  var GA_OK = /^G-[A-Z0-9]+$/.test(GA_ID);
  var GPC = navigator.globalPrivacyControl === true;

  function log() {
    if (!CFG.debug || !window.console) return;
    try { console.debug.apply(console, ['[SAA]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  /* ---------- Storage (falls back to memory for this page) ---------- */
  var memory = null;
  function readStored() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { return memory; }
    if (!raw) return memory;
    try {
      var o = JSON.parse(raw);
      if (o && o.v === VERSION && typeof o.analytics === 'boolean') return o;
    } catch (_) {}
    return null; /* other version or damaged: ask again */
  }
  function writeStored(o) {
    memory = o;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {}
  }

  var choice = readStored();
  function current() {
    if (choice) return { analytics: choice.analytics, ts: choice.ts, decided: true, source: 'visitor' };
    if (GPC) return { analytics: false, ts: null, decided: true, source: 'gpc' };
    return { analytics: false, ts: null, decided: false, source: 'none' };
  }

  /* ---------- Google Analytics 4 ---------- */
  var ga = { booted: false, loaded: false, active: false };
  var queue = [];
  function gtag() {
    if (typeof window.gtag !== 'function') {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
    }
    window.gtag.apply(window, arguments);
  }
  function enableGA() {
    if (!GA_OK) { log('analytics allowed, but no valid GA4 ID is set'); return; }
    window['ga-disable-' + GA_ID] = false;
    if (!ga.booted) {
      ga.booted = true;
      gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    }
    gtag('consent', 'update', { analytics_storage: 'granted' });
    if (!ga.loaded) {
      ga.loaded = true;
      gtag('js', new Date());
      gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
      document.head.appendChild(s);
    }
    ga.active = true;
    queue.splice(0).forEach(function (e) { send(e[0], e[1]); });
    log('GA4 on', GA_ID);
  }
  function clearGaCookies() {
    var names = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); })
      .filter(function (n) { return /^(_ga|_gid|_gat)/.test(n); });
    if (!names.length) return;
    var host = location.hostname, domains = [''];
    if (host.indexOf('.') > -1 && !/^[\d.]+$/.test(host) && host.indexOf(':') < 0) {
      var parts = host.split('.');
      for (var i = 0; i < parts.length - 1; i++) domains.push(parts.slice(i).join('.'));
    }
    names.forEach(function (n) {
      domains.forEach(function (d) {
        document.cookie = n + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/' + (d ? '; Domain=' + d : '');
      });
    });
  }
  function disableGA() {
    if (ga.booted) gtag('consent', 'update', { analytics_storage: 'denied' });
    if (GA_OK) window['ga-disable-' + GA_ID] = true;
    ga.active = false;
    queue.length = 0;
    clearGaCookies();
  }
  function send(name, params) {
    gtag('event', name, params || {});
    log('event', name, params || {});
  }
  function track(name, params) {
    if (!name) return;
    if (ga.active) return send(name, params);
    if (GA_OK && !current().decided && queue.length < 30) { queue.push([name, params]); log('queued', name, params || {}); return; }
    log('not sent (no analytics consent or no GA4 ID)', name, params || {});
  }
  SAA.track = track;

  function apply() {
    if (current().analytics) enableGA(); else disableGA();
  }

  /* ---------- Markup ---------- */
  var onPrivacy = PAGE === 'privacy' || /\/privacy(\.html)?$/.test(location.pathname);
  var POLICY = onPrivacy ? '#cookies' : ((body && body.dataset.base) || '') + 'privacy.html#cookies'; /* data-base: the 404 page uses root links */
  var CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var banner = null, dialog = null, status = null, opener = null, restore = false, lenis = null, showTimer = null;

  if (SAA.ready) { try { SAA.ready(function (ctx) { lenis = ctx && ctx.lenis; }); } catch (_) {} }

  function announce(text) {
    if (!status) {
      status = document.createElement('div');
      status.className = 'cc-sr'; status.setAttribute('role', 'status');
      body.appendChild(status);
    }
    status.textContent = '';
    setTimeout(function () { status.textContent = text; }, 60);
  }

  function buildBanner() {
    if (banner) return banner;
    banner = document.createElement('section');
    banner.className = 'cc-banner';
    banner.id = 'ccBanner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.hidden = true;
    banner.innerHTML =
      '<span class="cc-eyebrow"><i aria-hidden="true"></i>Cookies</span>' +
      '<p class="cc-text">We use necessary storage to run this site. May we also use Google Analytics to see how visitors use it? ' +
      '<span class="cc-more"><a href="' + POLICY + '">Cookie policy</a>' +
      '<button type="button" class="cc-link" data-cc="settings" aria-haspopup="dialog">Settings</button></span></p>' +
      '<div class="cc-actions">' +
      '<button type="button" class="cc-btn" data-cc="accept"><span>Accept analytics</span></button>' +
      '<button type="button" class="cc-btn" data-cc="reject"><span>Reject</span></button></div>';
    /* after a skip link if there is one, otherwise first in the page, so keyboard users reach it early */
    var skip = body.querySelector(':scope > a[href="#main"], :scope > .skip-link');
    if (skip) skip.after(banner); else body.prepend(banner);
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cc]');
      if (!b) return;
      var act = b.getAttribute('data-cc');
      if (act === 'settings') return open(b);
      setChoice({ analytics: act === 'accept' });
    });
    if (window.ResizeObserver) new ResizeObserver(syncHeight).observe(banner);
    return banner;
  }
  function syncHeight() {
    if (banner && !banner.hidden) doc.style.setProperty('--cc-h', Math.ceil(banner.getBoundingClientRect().height) + 'px');
  }

  /* Placement: the usual spot is above the chat pill (desktop) or a bottom sheet (phone). If that would cover a
     visible button in the current viewport, the first alternative that covers none is used instead. */
  function coversButton() {
    var t = banner.style.transform, tr = banner.style.transition;
    banner.style.transition = 'none'; banner.style.transform = 'none';
    var r = banner.getBoundingClientRect();
    banner.style.transform = t; void banner.offsetWidth; banner.style.transition = tr;
    var vw = innerWidth, vh = innerHeight;
    return [].some.call(document.querySelectorAll('.btn, [data-cta]'), function (e) {
      if (e.closest('#ccBanner, #ccDialog, .site-header, .menu-panel, [hidden]')) return false;
      var q = e.getBoundingClientRect();
      if (!q.width || !q.height || q.bottom <= 0 || q.top >= vh || q.right <= 0 || q.left >= vw) return false;
      if (getComputedStyle(e).visibility === 'hidden') return false;
      return !(q.right <= r.left || r.right <= q.left || q.bottom <= r.top || r.bottom <= q.top);
    });
  }
  var SPOTS = ['', 'cc-alt', 'cc-top']; /* usual; bottom-left (phone: top); top-right under the header */
  function place() {
    if (!banner || banner.hidden) return;
    var chosen = '';
    for (var i = 0; i < SPOTS.length; i++) {
      doc.classList.remove('cc-alt', 'cc-top');
      if (SPOTS[i]) doc.classList.add(SPOTS[i]);
      if (!coversButton()) { chosen = SPOTS[i]; break; }
    }
    doc.classList.remove('cc-alt', 'cc-top');
    if (chosen) doc.classList.add(chosen);
    syncHeight();
  }
  var placeTimer = null;
  addEventListener('resize', function () { clearTimeout(placeTimer); placeTimer = setTimeout(place, 250); });

  function showBanner() {
    buildBanner();
    if (!banner.hidden) return;
    banner.hidden = false;
    place();
    body.classList.add('cc-open'); doc.classList.add('cc-banner-open');
    requestAnimationFrame(function () { requestAnimationFrame(function () { banner.classList.add('is-in'); }); });
    /* late-arriving hero buttons: check once more, unless the visitor is already using the banner */
    setTimeout(function () { if (banner.classList.contains('is-in') && !banner.contains(document.activeElement)) place(); }, 1400);
  }
  function hideBanner() {
    clearTimeout(showTimer);
    if (!banner || banner.hidden) return;
    var hadFocus = banner.contains(document.activeElement);
    banner.classList.remove('is-in');
    body.classList.remove('cc-open'); doc.classList.remove('cc-banner-open');
    setTimeout(function () { if (!banner.classList.contains('is-in')) banner.hidden = true; }, 520);
    if (hadFocus) focusMain();
  }
  function focusMain() {
    var m = document.getElementById('main') || document.querySelector('main');
    if (!m) return;
    if (!m.hasAttribute('tabindex')) {
      m.setAttribute('tabindex', '-1'); m.setAttribute('data-cc-focus', '');
      m.addEventListener('blur', function f() { m.removeAttribute('tabindex'); m.removeAttribute('data-cc-focus'); m.removeEventListener('blur', f); });
    }
    m.focus({ preventScroll: true });
  }

  /* Wait for the intro: site.js adds .preloaded to <html> and removes .preloader when it ends. */
  function whenIntroDone(fn) {
    var t0 = Date.now();
    (function check() {
      var pre = document.querySelector('.preloader');
      var gone = !pre || getComputedStyle(pre).display === 'none' || getComputedStyle(pre).visibility === 'hidden';
      if ((doc.classList.contains('preloaded') && gone) || Date.now() - t0 > 7000) { showTimer = setTimeout(fn, 900); return; } /* let the hero entrance settle */
      showTimer = setTimeout(check, 120);
    })();
  }

  function buildDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'cc-dialog';
    dialog.id = 'ccDialog';
    dialog.setAttribute('aria-labelledby', 'ccTitle');
    dialog.setAttribute('aria-describedby', 'ccIntro');
    dialog.setAttribute('data-lenis-prevent', '');
    dialog.innerHTML =
      '<div class="cc-d-inner">' +
      '<div class="cc-d-head"><div><span class="cc-eyebrow"><i aria-hidden="true"></i>Privacy</span>' +
      '<h2 class="cc-d-title" id="ccTitle">Cookie settings</h2></div>' +
      '<button type="button" class="cc-x" data-cc="close" aria-label="Close cookie settings">' + CLOSE + '</button></div>' +
      '<p class="cc-d-intro" id="ccIntro">Choose what this site may store on your device. You can change your mind at any time with Cookie settings at the foot of every page.</p>' +
      '<div class="cc-cat">' +
      '<div class="cc-cat-head"><label class="cc-cat-name" for="ccNecessary">Necessary</label><span class="cc-tag">Always on</span>' +
      '<input type="checkbox" role="switch" class="cc-switch" id="ccNecessary" checked disabled aria-describedby="ccNecDesc"></div>' +
      '<p class="cc-cat-desc" id="ccNecDesc">Keeps the site working. <code>saa-seen</code> (session storage, cleared when you close the tab) skips the intro on later pages. <code>saa-consent</code> (local storage) remembers this choice. <code>saa-form-sends</code> (session storage) limits repeat sends from our forms. <code>saa-nav</code> (session storage, removed when the next page opens) plays the page transition.</p></div>' +
      '<div class="cc-cat">' +
      '<div class="cc-cat-head"><label class="cc-cat-name" for="ccAnalytics">Analytics</label><span class="cc-tag cc-tag-state" aria-hidden="true">Off</span>' +
      '<input type="checkbox" role="switch" class="cc-switch" id="ccAnalytics" aria-describedby="ccAnaDesc"></div>' +
      '<p class="cc-cat-desc" id="ccAnaDesc">Google Analytics 4 shows us which pages help visitors, using the cookies <code>_ga</code> and <code>_ga_&lt;ID&gt;</code>, kept for up to 2 years. Google signals and ad personalisation stay off.</p></div>' +
      '<p class="cc-d-more"><a href="' + POLICY + '">Read the cookie section of our privacy policy</a></p>' +
      '<div class="cc-d-actions">' +
      '<button type="button" class="cc-btn cc-btn-line" data-cc="save"><span>Save choices</span></button>' +
      '<button type="button" class="cc-btn" data-cc="reject"><span>Reject all</span></button>' +
      '<button type="button" class="cc-btn" data-cc="accept"><span>Accept all</span></button></div>' +
      '</div>';
    body.appendChild(dialog);
    var sw = dialog.querySelector('#ccAnalytics'), tag = dialog.querySelector('.cc-tag-state');
    sw.addEventListener('change', function () { tag.textContent = sw.checked ? 'On' : 'Off'; });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) return closeDialog(); /* backdrop */
      if (e.target.closest('a[href]')) return closeDialog();
      var b = e.target.closest('[data-cc]');
      if (!b) return;
      var act = b.getAttribute('data-cc');
      if (act === 'close') return closeDialog();
      setChoice({ analytics: act === 'accept' ? true : act === 'reject' ? false : sw.checked });
      closeDialog();
    });
    /* keep Escape from also closing the chat or the menu underneath */
    dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.stopPropagation(); });
    dialog.addEventListener('close', afterClose); /* Escape and any other native close */
    return dialog;
  }
  function open(from) {
    buildDialog();
    if (dialog.open) return;
    opener = (from && from.focus) ? from : document.activeElement;
    restore = true;
    var sw = dialog.querySelector('#ccAnalytics');
    sw.checked = current().analytics;
    dialog.querySelector('.cc-tag-state').textContent = sw.checked ? 'On' : 'Off';
    if (lenis) { try { lenis.stop(); } catch (_) {} }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function closeDialog() {
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    afterClose(); /* at once: the close event can arrive late on a busy page */
  }
  /* Runs once per opening: restart smooth scroll, send focus back to the opener (or to main if the opener has gone) */
  function afterClose() {
    if (!restore) return;
    restore = false;
    if (lenis && !doc.classList.contains('menu-open')) { try { lenis.start(); } catch (_) {} }
    var back = opener; opener = null;
    var leaving = back && back.closest && back.closest('.cc-banner') && !banner.classList.contains('is-in');
    if (back && back.isConnected && !leaving && back.getClientRects().length && !back.closest('[hidden]')) back.focus({ preventScroll: true });
    else focusMain();
  }

  /* ---------- Choice ---------- */
  function setChoice(o) {
    var analytics = !!(o && o.analytics);
    choice = { v: VERSION, analytics: analytics, ts: new Date().toISOString() };
    writeStored(choice);
    apply();
    hideBanner();
    announce(analytics ? 'Saved. Analytics is on.' : 'Saved. Analytics is off.');
    var detail = current();
    try { window.dispatchEvent(new CustomEvent('saa:consent', { detail: detail })); } catch (_) {}
    log('consent', detail);
    return detail;
  }

  SAA.consent = {
    get: current,
    open: function () { open(document.activeElement); },
    set: setChoice,
    /* Ask again, e.g. for testing: clears the stored choice and shows the banner. */
    reset: function () {
      choice = null; memory = null;
      try { localStorage.removeItem(KEY); } catch (_) {}
      apply();
      if (!current().decided) showBanner();
    }
  };

  /* Any [data-cookie-settings] element opens the settings (capture phase so the page transition never takes it) */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-cookie-settings]') : null;
    if (!t) return;
    e.preventDefault();
    if (t.tagName === 'A') e.stopPropagation();
    open(t);
  }, true);

  /* Another tab made a choice */
  addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    choice = readStored();
    apply();
    if (current().decided) hideBanner(); else showBanner();
  });

  /* ---------- Delegated tracking ---------- */
  function label(el) {
    var t = (el.getAttribute('data-cta') || el.getAttribute('aria-label') || el.textContent || '');
    return t.replace(/\(opens in a new tab\)/ig, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var chat = t.closest('#chatFab, [data-open-chat]');
    if (chat) {
      var panel = document.getElementById('chatPanel');
      if (!panel || panel.hidden) track('chat_open', { source: chat.id === 'chatFab' ? 'button' : 'link', page: PAGE });
    }
    var cta = t.closest('.btn, [data-cta]');
    if (cta) track('cta_click', { text: label(cta), href: cta.getAttribute('href') || '', page: PAGE });
    var a = t.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^tel:/i.test(href)) return track('contact_click', { method: 'phone', page: PAGE });
    if (/^mailto:/i.test(href)) return track('contact_click', { method: 'email', page: PAGE });
    try {
      var u = new URL(a.href, location.href);
      if (/^https?:$/.test(u.protocol) && u.host !== location.host) track('outbound_click', { host: u.hostname, page: PAGE });
    } catch (_) {}
  }, true);

  /* Leads: contact.js and adipec.js fire 'saa:form-sent' {form: id} on the form (bubbling) once their own
     checks pass and the email is composed. That is the only signal used, so failed or blocked sends never count.
     Window and document listeners cover either dispatch target; each event is counted once. */
  var seenLead = window.WeakSet ? new WeakSet() : null;
  function onLead(e) {
    if (seenLead) { if (seenLead.has(e)) return; seenLead.add(e); }
    var f = e.target && e.target.closest ? e.target.closest('form') : null;
    var id = String((e.detail && e.detail.form) || (f && f.id) || '').slice(0, 40);
    track('generate_lead', { form: id, page: PAGE });
  }
  ['saa:form-sent', 'saa:lead'].forEach(function (n) {
    document.addEventListener(n, onLead);
    addEventListener(n, onLead);
  });

  /* Chat open state (body.cc-chat-open) so the banner can step aside on small screens; chat.js loads after this file */
  function watchChat() {
    var fab = document.getElementById('chatFab');
    if (!fab || fab.__ccWatched || !window.MutationObserver) return !!fab;
    fab.__ccWatched = true;
    var sync = function () { body.classList.toggle('cc-chat-open', fab.getAttribute('aria-expanded') === 'true'); };
    new MutationObserver(sync).observe(fab, { attributes: true, attributeFilter: ['aria-expanded'] });
    sync();
    return true;
  }
  if (!watchChat()) { document.addEventListener('DOMContentLoaded', watchChat); addEventListener('load', watchChat); }

  /* ---------- Start ---------- */
  apply();
  if (!current().decided) whenIntroDone(function () { if (!current().decided) showBanner(); });
  log('consent', current(), GA_OK ? 'GA4 ' + GA_ID : 'no GA4 ID');
})();
