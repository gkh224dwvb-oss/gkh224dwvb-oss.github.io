/* =========================================================================
   COMPANY PROFILE: choose your language (SA, 22 Oct 2026)
   A visitor who has never picked a language (nothing saved in 'saa-lang',
   no ?lang= in the link) first sees a full-screen choice of the six site
   languages, each written in its own script. The phone's own language is
   marked and focused. English closes the screen and is remembered; any
   other language is saved and the page reloads in it, as the globe in the
   header does (assets/js/i18n.js). Escape continues in English.
   The screen sits under the preloader, so it is revealed as that lifts.
   ========================================================================= */
(() => {
  'use strict';
  let saved;
  try { saved = localStorage.getItem('saa-lang'); } catch (e) { return; }   /* nowhere to remember the choice: never ask */
  if (saved || /[?&]lang=[a-z]{2}(?:&|$)/.test(location.search)) return;

  const OPTS = [
    ['en', 'English', 'English', 'ltr', 'en-GB'],
    ['ar', 'العربية', 'Arabic', 'rtl', 'ar'],
    ['zh', '中文', 'Chinese', 'ltr', 'zh-Hans'],
    ['ur', 'اردو', 'Urdu', 'rtl', 'ur'],
    ['hi', 'हिन्दी', 'Hindi', 'ltr', 'hi'],
    ['ru', 'Русский', 'Russian', 'ltr', 'ru'],
  ];
  const ASK = [
    ['ar', 'اختر لغتك', 'rtl'],
    ['zh-Hans', '选择您的语言', 'ltr'],
    ['ur', 'اپنی زبان منتخب کریں', 'rtl'],
    ['hi', 'अपनी भाषा चुनें', 'ltr'],
    ['ru', 'Выберите язык', 'ltr'],
  ];

  /* the phone's own language, if it is one of ours */
  const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
  let suggested = 'en';
  for (const p of prefs) {
    const c = String(p).toLowerCase().slice(0, 2);
    if (OPTS.some(o => o[0] === c)) { suggested = c; break; }
  }

  const box = document.createElement('div');
  box.className = 'pfl';
  box.id = 'pfLang';
  box.setAttribute('translate', 'no');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'pfLangTitle');
  box.setAttribute('data-lenis-prevent', '');
  box.innerHTML =
    '<div class="pfl-glow" aria-hidden="true"></div>' +
    '<div class="pfl-inner">' +
      '<div class="pfl-brand">' +
        '<img src="assets/img/brand/logo-emblem-white.svg" alt="" width="326" height="282">' +
        '<div><b>SAA GROUP</b><span class="mono">Company profile · 2026</span></div>' +
      '</div>' +
      '<h2 class="pfl-title" id="pfLangTitle">Choose your language</h2>' +
      '<p class="pfl-ask">' + ASK.map(a => '<span lang="' + a[0] + '" dir="' + a[2] + '">' + a[1] + '</span>').join('') + '</p>' +
      '<ul class="pfl-list">' + OPTS.map(o =>
        '<li><button type="button" class="pfl-opt" data-pick="' + o[0] + '"' + (o[0] === suggested ? ' data-suggested=""' : '') + '>' +
          '<span class="pfl-native" lang="' + o[4] + '" dir="' + o[3] + '">' + o[1] + '</span>' +
          '<span class="pfl-en mono">' + o[2] + '</span>' +
          '<span class="pfl-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        '</button></li>').join('') +
      '</ul>' +
      '<p class="pfl-note">You can change the language at any time from the top of the page.</p>' +
    '</div>';

  /* everything else on the page is out of reach while the choice is open */
  const others = [];
  function lockPage(on) {
    if (on) {
      Array.from(document.body.children).forEach(el => {
        if (el === box || el.classList.contains('preloader') || el.hasAttribute('inert') || el.localName === 'script') return;
        el.setAttribute('inert', ''); others.push(el);
      });
    } else {
      others.splice(0).forEach(el => el.removeAttribute('inert'));
    }
    document.documentElement.classList.toggle('pfl-open', on);
    if (window.SAA && SAA.ready) SAA.ready(({ lenis }) => { if (lenis) on ? lenis.stop() : lenis.start(); });
  }

  function close() {
    box.classList.add('pfl-out');
    lockPage(false);
    const gone = () => box.remove();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) gone();
    else { box.addEventListener('transitionend', gone, { once: true }); setTimeout(gone, 900); }
    if (document.activeElement && box.contains(document.activeElement)) document.activeElement.blur();   /* the next Tab starts at the top of the page */
  }

  function pick(code) {
    try { localStorage.setItem('saa-lang', code); } catch (e) {}
    if (code === 'en') { close(); return; }
    box.classList.add('pfl-busy');
    let ok = false;
    try { ok = localStorage.getItem('saa-lang') === code; } catch (e) {}
    if (ok) location.reload();
    else { const u = new URL(location.href); u.searchParams.set('lang', code); location.href = u.href; }
  }

  box.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (b) { e.preventDefault(); e.stopPropagation(); pick(b.getAttribute('data-pick')); }
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); pick('en'); return; }
    if (e.key === 'Tab') {   /* keep focus inside the choice */
      const btns = Array.from(box.querySelectorAll('button'));
      const i = btns.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); btns[btns.length - 1].focus(); }
      else if (!e.shiftKey && i === btns.length - 1) { e.preventDefault(); btns[0].focus(); }
    }
  });

  document.body.appendChild(box);
  lockPage(true);
  const first = () => { const b = box.querySelector('[data-suggested]') || box.querySelector('button'); if (b && box.isConnected) b.focus({ preventScroll: true }); };
  /* focus once the preloader has gone (site.js adds .preloaded), so the outline is not drawn behind it */
  if (document.documentElement.classList.contains('preloaded')) first();
  else {
    const mo = new MutationObserver(() => { if (document.documentElement.classList.contains('preloaded')) { mo.disconnect(); first(); } });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); first(); }, 4000);
  }
})();
