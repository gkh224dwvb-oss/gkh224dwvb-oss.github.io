/* =========================================================================
   SAA GROUP — shared site behaviour (v2)
   Renders the shared chrome (header, menu, footer, CTA band), then runs
   smooth scroll, preloader, page transitions, cursor, reveals and counters.
   Page scripts can hook in with:  SAA.ready(({ gsap, ScrollTrigger, lenis }) => { ... })
   ========================================================================= */
(function () {
  'use strict';
  const doc = document.documentElement;
  doc.classList.remove('no-js'); doc.classList.add('js');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const page = document.body.dataset.page || '';
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) {} }
  };

  /* ---------- Site map (single source of truth for nav + footer) ---------- */
  const PAGES = [
    { id: 'home', href: 'index.html', label: 'Home' },
    { id: 'about', href: 'about.html', label: 'About' },
    { id: 'group', href: 'group.html', label: 'Group' },
    { id: 'services', href: 'services.html', label: 'Services' },
    { id: 'clients', href: 'clients.html', label: 'Clients' },
    { id: 'quality', href: 'quality.html', label: 'Quality' },
    { id: 'careers', href: 'careers.html', label: 'Careers' },
    { id: 'emiratisation', href: 'emiratisation.html', label: 'Emiratisation' },
    { id: 'apply', href: 'careers.html#apply', label: 'Apply now' },
    { id: 'adipec', href: 'adipec.html', label: 'ADIPEC 2026' },
    { id: 'contact', href: 'contact.html', label: 'Contact' }
  ];
  const EXT = {
    cv: 'careers.html?role=general#applyForm',
    jobs: 'careers.html#jobs',
    emirati: 'careers.html?role=emiratisation#applyForm',
    map: 'https://www.google.com/maps?q=24.4912691,54.3608709'
  };
  const ARROW = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const cur = id => (id === page ? ' aria-current="page"' : '');
  /* <body data-base="/"> (404 page) makes the chrome's links and images root-absolute */
  const BASE = document.body.dataset.base || '';
  const u = href => (/^(https?:|mailto:|tel:|#|\/)/.test(href) ? href : BASE + href);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEL = '<a href="tel:+97126270622">+971 2 627 0622</a>', MAIL = '<a href="mailto:saaest@eim.ae">saaest@eim.ae</a>';
  window.SAA_EXT = EXT;
  const I18N = window.SAAI18n;   /* assets/js/i18n.js: the language switch, and how split text breaks per language */

  function renderChrome() {
    const header = document.querySelector('[data-include="header"]');
    if (header) header.outerHTML = `
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header" id="siteHeader">
  <div class="wrap">
    <a class="logo" href="${u('index.html')}" data-cursor-hover>
      <img class="logo-d" src="${u('assets/img/logo-emblem-white.png')}" alt="" width="46" height="42">
      <img class="logo-l" src="${u('assets/img/logo-emblem-navy.png')}" alt="" width="46" height="42">
      <span class="logo-text"><b>SAA GROUP</b><span>Since 1993 · Abu Dhabi</span></span><span class="sr-only">, home</span>
    </a>
    <nav class="nav" aria-label="Main">
      ${PAGES.filter(p => !['home', 'adipec'].includes(p.id)).map(p => `<a class="nav-link${p.id === 'apply' ? ' nav-apply' : ''}" href="${u(p.href)}"${cur(p.id)}>${p.label}</a>`).join('')}
      <button type="button" class="theme-toggle" id="themeToggle" aria-label="Switch to light mode">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><mask id="ttMask"><rect width="24" height="24" fill="#fff"/><circle class="tt-cut" cx="17" cy="7" r="7.5" fill="#000"/></mask>
          <g mask="url(#ttMask)"><circle class="tt-core" cx="12" cy="12" r="5" fill="currentColor"/></g>
          <g class="tt-rays" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g></svg>
      </button>
      ${I18N ? I18N.ui('head') : ''}
      <a class="btn" href="${u('adipec.html')}" data-magnetic${cur('adipec')}>ADIPEC 2026 ${ARROW}</a>
      <button type="button" class="menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="menuPanel"><span></span><span></span></button>
    </nav>
  </div>
</header>
<nav class="menu-panel" id="menuPanel" aria-label="Menu" aria-hidden="true" inert data-lenis-prevent>
  <div class="wrap">
    <ol>${PAGES.map((p, i) => `<li><a href="${u(p.href)}"${cur(p.id)}><small>${String(i + 1).padStart(2, '0')}</small>${p.label}</a></li>`).join('')}</ol>
    ${I18N ? I18N.ui('menu') : ''}
    <div class="menu-foot">${TEL}${MAIL}<span>P.O. Box 27595, Abu Dhabi</span></div>
  </div>
</nav>`;

    const cta = document.querySelector('[data-include="cta"]');
    if (cta) {
      /* the title is split for its reveal straight away, so it is translated here, before the split */
      const t = esc(I18N ? I18N.t(cta.dataset.title || 'Let’s staff your next project.') : cta.dataset.title || 'Let’s staff your next project.');
      /* the lead too, so its phone number can be kept on one line (a translation would no longer match after that) */
      const lead = cta.dataset.lead || 'Tell us the roles, the numbers and the location. Onshore or offshore, our team in Abu Dhabi will come back to you.';
      const l = esc(I18N ? I18N.t(lead) : lead).replace(/\+?\d[\d \u00a0]{5,}\d/g, m => '<span class="nowrap">' + m + '</span>');
      const b = esc(cta.dataset.button || 'Talk to SAA');
      const h = (cta.dataset.href || 'contact.html').trim(), out = /^https?:/i.test(h);
      /* one solid primary button; the rings are decoration only */
      cta.outerHTML = `
<section class="cta-band" aria-label="Get in touch">
  <span class="ring cta-ring-1" aria-hidden="true"></span>
  <span class="ring cta-ring-2" aria-hidden="true"></span>
  <div class="wrap cta-inner">
    <span class="mono cta-kicker">SAA Group · Abu Dhabi</span>
    <h2 class="mega" data-split>${t}</h2>
    <p class="lead">${l}</p>
    <div class="btn-row"><a class="btn" href="${esc(u(h))}" data-magnetic${out ? ' target="_blank" rel="noopener"' : ''}>${b} ${ARROW}${out ? '<span class="sr-only"> (opens in a new tab)</span>' : ''}</a></div>
  </div>
</section>`;
    }

    const footer = document.querySelector('[data-include="footer"]');
    if (footer) footer.outerHTML = `
<footer class="site-footer keep-dark">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="logo" href="${u('index.html')}"><img src="${u('assets/img/logo-emblem-white.png')}" alt="" width="46" height="42"><span class="logo-text"><b>SAA GROUP</b><span>Since 1993 · Abu Dhabi</span></span><span class="sr-only">, home</span></a>
        <p class="foot-about">Recruitment, manpower supply, onshore and offshore oil and gas fields and facilities services.</p>
      </div>
      <div><h2>Company</h2><ul>
        <li><a href="${u('about.html')}">About SAA</a></li><li><a href="${u('profile.html')}">Company profile</a></li><li><a href="${u('group.html')}">Group companies</a></li>
        <li><a href="${u('services.html')}">Services</a></li><li><a href="${u('clients.html')}">Clients</a></li><li><a href="${u('quality.html')}">Quality</a></li></ul></div>
      <div><h2>Join us</h2><ul>
        <li><a href="${u('careers.html')}">Careers</a></li>
        <li><a href="${u('careers.html#jobs')}">View open jobs</a></li>
        <li><a href="${u('careers.html#apply')}">Apply for a job</a></li>
        <li><a href="${u('emiratisation.html')}">Emiratisation</a></li>
        <li><a href="${u(EXT.cv)}">Send your CV</a></li></ul></div>
      <div><h2>Contact</h2><ul>
        <li>${TEL}</li><li>${MAIL}</li><li>P.O. Box 27595, Abu Dhabi, UAE</li>
        <li><a href="${u('adipec.html')}">ADIPEC 2026 · 2–5 Nov</a></li></ul></div>
    </div>
    <div class="foot-word" aria-hidden="true">SAA GROUP</div>
  </div>
  <div class="wrap foot-bottom">
    <span>© ${new Date().getFullYear()} SAA Group. All rights reserved.</span>
    <nav class="foot-legal" aria-label="Legal"><a href="${u('privacy.html')}">Privacy policy</a><a href="${u('terms.html')}">Terms of use</a><button type="button" class="foot-link" data-cookie-settings>Cookie settings</button></nav>
    <span>Abu Dhabi · United Arab Emirates</span>
  </div>
</footer>`;

    document.body.insertAdjacentHTML('beforeend', `
<div class="progress" id="progress" aria-hidden="true"></div>
<div class="transition-curtain" id="curtain" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
<div class="cursor" id="cursor" aria-hidden="true"></div><div class="cursor-dot" id="cursorDot" aria-hidden="true"></div>`);
  }
  renderChrome();

  /* ---------- Dark / light switch (assets/js/theme.js holds the state) ----------
     wired before the GSAP check so it works even if the motion libraries fail to load */
  const themeBtn = document.getElementById('themeToggle');
  const T = window.SAATheme;
  function labelTheme() {
    if (!themeBtn || !T) return;
    themeBtn.setAttribute('aria-label', T.get() === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  }
  if (themeBtn && T) {
    labelTheme();
    document.addEventListener('saa:theme', labelTheme);
    themeBtn.addEventListener('click', () => {
      /* the new colours wipe in as a growing circle from the switch, where the browser supports it */
      if (reduce || !document.startViewTransition) { T.toggle(); return; }
      const r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(() => T.toggle());
      vt.ready.then(() => {
        doc.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
          { duration: 750, easing: 'cubic-bezier(.76, 0, .24, 1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => {});
    });
  } else if (themeBtn) themeBtn.hidden = true;

  /* ---------- Hooks for page scripts ---------- */
  const readyFns = [];
  let ctx = null;
  window.SAA = {
    ready(fn) { ctx ? fn(ctx) : readyFns.push(fn); },
    reduce, finePointer, ext: EXT
  };

  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  if (!gsap) { document.documentElement.classList.add('preloaded'); console.warn('GSAP missing: motion disabled'); return; }
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  /* anchor links scroll smoothly, then move keyboard focus to the target */
  document.addEventListener('click', e => {
    if (e.defaultPrevented) return;   /* a page script handled it (e.g. Careers picking a role) */
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    let el = null; try { el = document.querySelector(a.getAttribute('href')); } catch (_) { return; }
    if (!el) return;
    e.preventDefault();
    if (doc.classList.contains('menu-open')) setMenu(false);
    lenis ? lenis.scrollTo(el, { offset: -80 }) : el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    focusTarget(el);
  });
  function focusTarget(el) {
    if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) { el.setAttribute('tabindex', '-1'); el.classList.add('saa-focus-target'); }
    el.focus({ preventScroll: true });
  }

  /* ---------- Header: scrolled state, hide on scroll down ---------- */
  const header = document.getElementById('siteHeader');
  let lastY = 0;
  function onScroll(y) {
    if (!header) return;
    header.classList.toggle('scrolled', y > 30);
    const menuOpen = doc.classList.contains('menu-open');
    header.classList.toggle('hide', !menuOpen && y > 400 && y > lastY + 2);
    if (y < lastY - 2 || y < 400) header.classList.remove('hide');
    lastY = y;
  }
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else addEventListener('scroll', () => onScroll(scrollY), { passive: true });
  onScroll(scrollY);

  /* ---------- Menu ---------- */
  const toggle = document.getElementById('menuToggle'), panel = document.getElementById('menuPanel');
  let menuInerted = [];
  function setMenu(open) {
    if (open === doc.classList.contains('menu-open')) return;
    const back = !open && panel && (panel.contains(document.activeElement) || document.activeElement === toggle || document.activeElement === document.body);
    doc.classList.toggle('menu-open', open);
    toggle && toggle.setAttribute('aria-expanded', open);
    toggle && toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (panel) { panel.setAttribute('aria-hidden', !open); panel.inert = !open; }
    /* while open, only the header and the menu can take focus */
    if (open) {
      menuInerted = [...document.querySelectorAll('.skip-link, main, .site-footer, #chatFab, #chatPanel')].filter(n => !n.inert);
      menuInerted.forEach(n => { n.inert = true; });
    } else { menuInerted.forEach(n => { n.inert = false; }); menuInerted = []; }
    if (lenis) open ? lenis.stop() : lenis.start();
    if (back && toggle && toggle.offsetParent) toggle.focus();
  }
  toggle && toggle.addEventListener('click', () => setMenu(!doc.classList.contains('menu-open')));
  addEventListener('keydown', e => {
    if (!doc.classList.contains('menu-open')) return;
    if (e.key === 'Escape') { setMenu(false); return; }
    if (e.key !== 'Tab') return;
    /* keep Tab inside the header and the open menu */
    const items = [...document.querySelectorAll('#siteHeader a, #siteHeader button, #menuPanel a, #menuPanel button')].filter(n => n.offsetWidth || n.offsetHeight || n.getClientRects().length);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!items.includes(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  });
  /* the burger disappears above 1180px: close the menu if the window grows */
  const wide = matchMedia('(min-width: 1181px)');
  if (wide.addEventListener) wide.addEventListener('change', m => { if (m.matches) setMenu(false); });

  /* ---------- Scroll progress ---------- */
  const prog = document.getElementById('progress');
  if (prog && ScrollTrigger) gsap.to(prog, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });

  /* ---------- Split text ---------- */
  function split(el) {
    if (el.dataset.splitDone) return el.querySelectorAll('.split-char');
    el.dataset.splitDone = '1';
    const mode = I18N ? I18N.splitMode(el.dataset.split || 'chars') : el.dataset.split || 'chars';
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          (I18N ? I18N.words(n.textContent) : n.textContent.split(/(\s+)/)).forEach(w => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            const ws = document.createElement('span'); ws.className = 'split-word';
            if (mode === 'words') { const c = document.createElement('span'); c.className = 'split-char'; c.textContent = w; ws.appendChild(c); }
            else [...w].forEach(ch => { const c = document.createElement('span'); c.className = 'split-char'; c.textContent = ch; ws.appendChild(c); });
            frag.appendChild(ws);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    /* screen readers get one visually hidden copy of the text; the animated spans are hidden from them.
       (aria-label is not reliable on headings and is ignored on paragraphs) */
    const label = el.textContent.trim().replace(/\s+/g, ' ');
    walk(el);
    el.querySelectorAll('.split-word, .split-char').forEach(s => s.setAttribute('aria-hidden', 'true'));
    if (label) { const sr = document.createElement('span'); sr.className = 'sr-only split-sr'; sr.textContent = label; el.prepend(sr); }
    return el.querySelectorAll('.split-char');
  }
  window.SAA.split = split;

  /* ---------- Reveals ---------- */
  function setupReveals(root = document) {
    if (reduce || !ScrollTrigger) return;
    root.querySelectorAll('[data-split]').forEach(el => {
      if (el.dataset.splitAnim) return; el.dataset.splitAnim = '1';
      const chars = split(el);
            gsap.from(chars, {
        yPercent: 115, rotate: 6, duration: 1.1, ease: 'expo.out', stagger: { each: el.dataset.split === 'words' ? .06 : .018 },
        scrollTrigger: el.hasAttribute('data-now') ? null : { trigger: el, start: 'top 88%', once: true },
        delay: el.hasAttribute('data-now') ? (+el.dataset.delay || 0) : 0
      });
    });
    root.querySelectorAll('[data-reveal]').forEach(el => {
      if (el.dataset.revealDone) return; el.dataset.revealDone = '1';
      const kind = el.dataset.reveal || 'up';
      const from = { up: { y: 70, opacity: 0 }, fade: { opacity: 0 }, scale: { scale: .9, opacity: 0 }, left: { x: -60, opacity: 0 }, right: { x: 60, opacity: 0 } }[kind] || { y: 70, opacity: 0 };
      gsap.from(el, { ...from, duration: 1.2, ease: 'expo.out', delay: +el.dataset.delay || 0, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    root.querySelectorAll('[data-stagger]').forEach(el => {
      if (el.dataset.staggerDone) return; el.dataset.staggerDone = '1';
      gsap.from(el.children, { y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: +el.dataset.stagger || .08, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    root.querySelectorAll('[data-speed]').forEach(el => {
      const s = parseFloat(el.dataset.speed) || .2;
      gsap.fromTo(el, { yPercent: -s * 50 }, { yPercent: s * 50, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    /* word-by-word highlight for manifesto paragraphs */
    root.querySelectorAll('[data-highlight]').forEach(el => {
      if (el.dataset.hlDone) return; el.dataset.hlDone = '1';
      el.dataset.split = 'words'; const words = split(el);
      gsap.fromTo(words, { opacity: .16 }, { opacity: 1, stagger: .1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } });
    });
    /* horizontal scroll sections: <section data-hscroll><div class="h-track">…</div></section> */
    root.querySelectorAll('[data-hscroll]').forEach(sec => {
      const track = sec.querySelector('.h-track'); if (!track) return;
      const mm = gsap.matchMedia();
      mm.add('(min-width: 861px)', () => {
        const dist = () => Math.max(0, track.scrollWidth - sec.clientWidth);
        gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: .8, invalidateOnRefresh: true, anticipatePin: 1 } });
      });
    });
  }

  /* ---------- Count-up numbers: <span data-count="600">600</span> ---------- */
  function setupCounters() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count), year = end >= 1900 && end <= 2100, start = year ? end - 40 : 0;
      /* years stay plain (1993); other figures get a thousands separator (2,500; 2 500 in Russian, as its translations write it) */
      const loc = document.documentElement.lang === 'ru' ? 'ru' : 'en-GB';
      const fmt = v => (year ? String(Math.round(v)) : Math.round(v).toLocaleString(loc));
      if (reduce || !ScrollTrigger) { el.textContent = fmt(end); return; }
      const o = { v: start };
      gsap.to(o, { v: end, duration: 2.2, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v); },
        scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
  }

  /* ---------- Magnetic elements ---------- */
  function setupMagnetic() {
    if (!finePointer || reduce) return;
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      const xTo = gsap.quickTo(el, 'x', { duration: .6, ease: 'elastic.out(1, .4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: .6, ease: 'elastic.out(1, .4)' });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * .3); yTo((e.clientY - r.top - r.height / 2) * .35); });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------- Cursor ---------- */
  function setupCursor() {
    if (!finePointer || reduce) return;
    const ring = document.getElementById('cursor'), dot = document.getElementById('cursorDot');
    const rx = gsap.quickTo(ring, 'x', { duration: .55, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .55, ease: 'power3' });
    const dx = gsap.quickTo(dot, 'x', { duration: .08 }), dy = gsap.quickTo(dot, 'y', { duration: .08 });
    addEventListener('pointermove', e => { doc.classList.add('has-cursor'); rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY); }, { passive: true });
    document.addEventListener('pointerleave', () => doc.classList.remove('has-cursor'));
    addEventListener('pointerdown', () => ring.classList.add('down')); addEventListener('pointerup', () => ring.classList.remove('down'));
    document.addEventListener('pointerover', e => {
      const lab = e.target.closest('[data-cursor]');
      const hov = e.target.closest('a, button, [data-cursor-hover], input, select, textarea, label');
      ring.classList.toggle('label', !!lab); ring.textContent = lab ? lab.dataset.cursor : '';
      doc.classList.toggle('cursor-invert', !!(lab && lab.hasAttribute('data-cursor-invert')));
      ring.classList.toggle('hover', !lab && !!hov);
    });
  }

  /* ---------- Page transitions ---------- */
  const curtain = document.getElementById('curtain');
  const bars = curtain ? curtain.children : [];
  function isInternal(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    const href = a.getAttribute('href') || '';
    return /^\/?[a-z0-9-]+\.html(\?[\w=&%-]*)?(#[\w-]+)?$/i.test(href); /* includes privacy.html and terms.html, and careers.html?role=... */
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (e.defaultPrevented || !isInternal(a) || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    /* a link to a section of this same page (e.g. careers.html#jobs on Careers) scrolls there, no curtain */
    const hr = a.getAttribute('href'), hi = hr.indexOf('#');
    const here = location.pathname.split('/').pop() || 'index.html';
    if (hi > 0 && hr.slice(0, hi).split('?')[0].replace(/^\//, '') === here) {
      const el = document.getElementById(hr.slice(hi + 1));
      if (el) {
        if (doc.classList.contains('menu-open')) setMenu(false);
        lenis ? lenis.scrollTo(Math.max(0, el.getBoundingClientRect().top + window.scrollY - 80), { force: true }) : el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
        focusTarget(el);
        return;
      }
    }
    const go = () => { location.href = a.getAttribute('href'); };
    if (reduce || !curtain) return go();
    ss.set('saa-nav', '1');
    setMenu(false);
    gsap.set(bars, { transformOrigin: 'bottom' });
    gsap.to(bars, { scaleY: 1, duration: .55, ease: 'expo.inOut', stagger: .05, onComplete: go });
    setTimeout(go, 1600); /* safety */
  });
  addEventListener('pageshow', e => { if (e.persisted && curtain) gsap.set(bars, { scaleY: 0 }); });

  /* ---------- Preloader / entry ---------- */
  function entry() {
    const fromNav = ss.get('saa-nav') === '1'; ss.del('saa-nav');
    const seen = ss.get('saa-seen') === '1';
    const pre = document.querySelector('.preloader');
    const done = () => { doc.classList.add('preloaded'); start(); };
    if (reduce) { pre && pre.remove(); return done(); }
    if (fromNav && curtain) {
      pre && pre.remove();
      gsap.set(bars, { scaleY: 1, transformOrigin: 'top' });
      gsap.to(bars, { scaleY: 0, duration: .8, ease: 'expo.inOut', stagger: .05, delay: .05 });
      return setTimeout(done, 250);
    }
    if (!pre || seen) { pre && pre.remove(); return done(); }
    ss.set('saa-seen', '1');
    const count = pre.querySelector('.pl-count'), bar = pre.querySelector('.pl-bar i'), o = { v: 0 };
    const tl = gsap.timeline({ onComplete: () => { pre.remove(); } });
    tl.to(o, { v: 100, duration: 1.6, ease: 'power2.inOut', onUpdate: () => { if (count) count.textContent = Math.round(o.v); if (bar) bar.style.transform = `scaleX(${o.v / 100})`; } })
      .to(pre.querySelector('.preloader-inner'), { y: -40, opacity: 0, duration: .5, ease: 'power3.in' })
      .add(done, '-=.1')
      .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 1, ease: 'expo.inOut' }, '-=.2');
  }

  function start() {
    ctx = { gsap, ScrollTrigger, lenis, split, reduce, finePointer };
    setupReveals(); setupCounters(); setupMagnetic(); setupCursor();
    readyFns.splice(0).forEach(fn => { try { fn(ctx); } catch (err) { console.error(err); } });
    if (ScrollTrigger) { ScrollTrigger.refresh(); addEventListener('load', () => ScrollTrigger.refresh()); }
    document.fonts && document.fonts.ready.then(() => ScrollTrigger && ScrollTrigger.refresh());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', entry); else entry();
})();
