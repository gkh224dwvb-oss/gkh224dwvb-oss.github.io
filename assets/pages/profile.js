/* =========================================================================
   COMPANY PROFILE 2026 (profile.html, www.saagroup.ae/profile)
   1. Chapter navigation: a slim bar under the header on phones and tablets
      (opens the full list), a column of dots on desktop. It follows the
      chapter in view and stays hidden on the cover and the contents.
   2. Actions: Share (the phone's share sheet, else the link is copied),
      Download PDF (the print dialog, once every image has loaded) and
      Save our contact (the vCard; downloaded by name, except on iPhone and
      iPad, where Safari opens it in Contacts).
   3. Signature, "How we recruit": the eleven steps sit on a road that snakes
      through them (four or three to a row; one column on phones). The road
      draws itself as the page scrolls and a red marker drives along it,
      lighting each step as it arrives.
   4. Motion, after site.js has started (SAA.ready): the cover entrance and
      its parallax, the emblem tilting towards the pointer, the red rules on
      the figures, the laurel drawing on the award, the photo reveals, the
      industry icons drawing themselves, the flag rule on Emiratisation and
      the office map. Reduced motion shows every finished frame at once.
   ========================================================================= */
(() => {
  'use strict';
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const PROFILE_URL = 'https://www.saagroup.ae/profile';
  /* play once and stay. Not ScrollTrigger's once: true, which kills triggers inside ScrollTrigger's own refresh
     when the page opens already scrolled down (a reload mid-page) and throws "reading 'pin'" */
  const ONCE = 'play none none none';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------------------------------------------------------------
     Message under the page (share and copy). role="status" reads it out.
     --------------------------------------------------------------------- */
  const toast = $('#pfToast');
  let toastTimer = 0;
  function say(msg, extra, ms) {
    if (!toast) return null;
    clearTimeout(toastTimer);
    toast.textContent = '';
    const m = document.createElement('span'); m.textContent = msg; toast.appendChild(m);
    let x = null;
    if (extra) {
      toast.appendChild(document.createTextNode(' '));
      x = document.createElement('span'); x.className = 'pf-toast-url'; x.setAttribute('translate', 'no'); x.dir = 'ltr'; x.textContent = extra;
      toast.appendChild(x);
    }
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms || 4200);
    return x;
  }
  function selectNode(node) {
    try { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) { /* nothing to select */ }
  }
  function execCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    let ok = false;
    try { ta.select(); ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------------------------------------------------------------------
     1. CHAPTER NAVIGATION
     --------------------------------------------------------------------- */
  const nav = $('#pfNav'), navToggle = $('#pfNavToggle'), navList = $('#pfNavList');
  const chapters = $$('[data-chapter]');
  if (nav && navToggle && navList && chapters.length) {
    const links = $$('a', navList), segs = $$('.pf-nav-segs i', nav);
    const numEl = $('#pfNavNum'), curEl = $('#pfNavCur');
    let cur = -2, ticking = false;
    const setOpen = open => {
      nav.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    };
    const setCur = i => {
      if (i === cur) return;
      cur = i;
      nav.classList.toggle('on', i >= 0);
      if (i < 0) setOpen(false);
      links.forEach((a, k) => { if (k === i) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      segs.forEach((s, k) => { s.classList.toggle('on', i >= 0 && k < i); s.classList.toggle('cur', k === i); });
      if (i >= 0 && links[i]) {
        const n = $('.pf-nav-li-n', links[i]), t = $('.pf-nav-li-t', links[i]);
        if (numEl && n) numEl.textContent = n.textContent;
        if (curEl && t) curEl.textContent = t.textContent;
      }
    };
    /* the chapter whose top has passed 40% of the screen; none above the first or below the last */
    const measure = () => {
      ticking = false;
      const line = innerHeight * .4;
      let i = -1;
      for (let k = 0; k < chapters.length; k++) { if (chapters[k].getBoundingClientRect().top <= line) i = k; else break; }
      if (i === chapters.length - 1 && chapters[i].getBoundingClientRect().bottom < line) i = -1;
      setCur(i);
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(measure); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    measure();

    navToggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    navList.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', e => { if (nav.classList.contains('open') && !nav.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); navToggle.focus(); }
    });
    /* Tab past the last chapter in the open list: close it and carry on from the current chapter,
       not from the cover (the list sits at the top of <main>) */
    navList.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || e.shiftKey || e.target !== links[links.length - 1]) return;
      const ch = chapters[Math.max(0, cur)];
      if (!ch) return;
      e.preventDefault(); setOpen(false);
      if (!ch.hasAttribute('tabindex')) ch.setAttribute('tabindex', '-1');
      ch.focus({ preventScroll: true });
    });
    /* keyboard focus leaving the open list closes it */
    nav.addEventListener('focusout', e => { if (nav.classList.contains('open') && e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false); });
  }

  /* ---------------------------------------------------------------------
     2. ACTIONS
     --------------------------------------------------------------------- */
  /* Share: the phone's own share sheet; else the link is copied (or selected, ready to copy) */
  $$('[data-share]').forEach(btn => btn.addEventListener('click', () => {
    const copied = () => say(btn.dataset.copyDone || 'Link copied.', PROFILE_URL, 4200);
    const fallback = () => {
      if (execCopy(PROFILE_URL)) return copied();
      const node = say(btn.dataset.copySel || 'Link selected, ready to copy.', PROFILE_URL, 9000);
      if (node) selectNode(node);
    };
    const copy = () => {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') navigator.clipboard.writeText(PROFILE_URL).then(copied, fallback);
      else fallback();
    };
    if (typeof navigator.share === 'function') {
      navigator.share({ title: document.title, url: PROFILE_URL }).catch(err => { if (!err || err.name !== 'AbortError') copy(); });
    } else copy();
  }));

  /* Download PDF: load every lazy image first (or wait at most 2.5 s), then open the print dialog */
  function eagerImages() {
    $$('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
    return $$('img').filter(img => !img.complete);
  }
  addEventListener('beforeprint', () => { eagerImages(); finishMotion(); });
  /* printing from the browser menu gives no time to load lazy images: fetch them quietly once the page has settled */
  addEventListener('load', () => setTimeout(eagerImages, 3000), { once: true });
  $$('[data-print]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.getAttribute('aria-busy') === 'true') return;
    const waiting = eagerImages();
    finishMotion();
    btn.setAttribute('aria-busy', 'true');
    const loaded = Promise.all(waiting.map(img => new Promise(res => {
      img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true });
    })));
    Promise.race([loaded, new Promise(res => setTimeout(res, 2500))]).then(() => {
      btn.removeAttribute('aria-busy');
      window.print();
    });
  }));

  /* Save our contact: a named download, except on iPhone and iPad, where Safari shows the card in Contacts */
  const IOS = /iP(hone|od|ad)/.test(navigator.platform || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!IOS) $$('[data-vcf]').forEach(a => a.setAttribute('download', 'SAA-Group.vcf'));

  /* Industries: a soft light follows the pointer across each tile */
  if (FINE) {
    const grid = $('.pf-ind-grid');
    if (grid) grid.addEventListener('pointermove', e => {
      const tile = e.target.closest('.pf-ind-tile'); if (!tile) return;
      const r = tile.getBoundingClientRect();
      tile.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      tile.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---------------------------------------------------------------------
     3. THE ROAD (How we recruit)
     --------------------------------------------------------------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const road = (() => {
    const wrap = $('#pfRoad'), svg = $('#pfRoadSvg');
    if (!wrap || !svg) return null;
    const ol = $('.pfr-steps', wrap), steps = $$('.pfr-step', wrap);
    const base = $('.pfr-base', svg), lane = $('.pfr-lane', svg), fill = $('.pfr-fill', svg), car = $('.pfr-car', svg);
    const probe = document.createElementNS(NS, 'path');
    probe.setAttribute('fill', 'none'); probe.setAttribute('stroke', 'none'); probe.setAttribute('visibility', 'hidden');
    svg.appendChild(probe);
    const state = { p: 0 };
    let L = 0, stops = [], lastKey = '';

    /* snake order: left to right on odd rows, right to left on even rows (grid columns follow the
       reading direction, so Arabic and Urdu snake the other way on their own) */
    function place(cols) {
      steps.forEach((s, i) => {
        if (cols <= 1) { s.style.gridRow = ''; s.style.gridColumn = ''; return; }
        const r = Math.floor(i / cols), k = i % cols;
        s.style.gridRow = String(r + 1);
        s.style.gridColumn = String(r % 2 ? cols - k : k + 1);
      });
    }
    function build() {
      const cols = parseInt(getComputedStyle(ol).getPropertyValue('--cols'), 10) || 1;
      place(cols);
      const wr = wrap.getBoundingClientRect();
      const W = wr.width, H = wr.height;
      if (!W || !H) return;
      const pts = steps.map(s => {
        const n = $('.pfr-node', s).getBoundingClientRect();
        return { x: n.left + n.width / 2 - wr.left, y: n.top + n.height / 2 - wr.top };
      });
      const key = [W, H].concat(pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1))).join('|');
      if (key === lastKey) return;
      lastKey = key;
      svg.setAttribute('viewBox', `0 0 ${W.toFixed(1)} ${H.toFixed(1)}`);
      /* the turns may reach into the page margin, short of the screen edge */
      const gutter = parseFloat(getComputedStyle(wrap.parentElement).paddingInlineStart) || 16;
      const f = v => v.toFixed(1);
      const segs = [`M${f(pts[0].x)} ${f(pts[0].y)}`];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) > 2 || cols <= 1) segs.push(`L${f(b.x)} ${f(b.y)}`);
        else {
          /* the turn at the end of a row: a half loop out towards the nearer edge */
          const side = a.x > W / 2 ? 1 : -1;
          const room = (side > 0 ? W - a.x : a.x) + gutter * .5;
          const r = Math.max(12, Math.min(Math.abs(b.y - a.y) / 2, room));
          const k = r * 4 / 3;
          segs.push(`C${f(a.x + side * k)} ${f(a.y)} ${f(b.x + side * k)} ${f(b.y)} ${f(b.x)} ${f(b.y)}`);
        }
      }
      const d = segs.join(' ');
      [base, lane, fill].forEach(p => p.setAttribute('d', d));
      L = fill.getTotalLength();
      stops = segs.map((_, i) => {
        if (i === 0) return 0;
        probe.setAttribute('d', segs.slice(0, i + 1).join(' '));
        return probe.getTotalLength();
      });
      draw();
    }
    function draw() {
      if (!L) return;
      const len = L * Math.min(1, Math.max(0, state.p));
      fill.style.strokeDasharray = `${L} ${L}`;
      fill.style.strokeDashoffset = String(L - len);
      const pt = fill.getPointAtLength(Math.max(.01, len));
      car.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      car.style.opacity = state.p > 0.002 ? '1' : '0';
      steps.forEach((s, i) => s.classList.toggle('on', len >= stops[i] - 2));
    }
    let raf = 0;
    const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); };
    if ('ResizeObserver' in window) new ResizeObserver(soon).observe(wrap);
    addEventListener('resize', soon, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
    /* without motion (or until site.js starts) the road is drawn in full when motion is off */
    if (REDUCE || !window.gsap || !window.ScrollTrigger) state.p = 1;
    build();
    return { state, draw, build, wrap };
  })();

  /* print and "Download PDF": every animation jumps to its last frame */
  function finishMotion() {
    if (road) { road.state.p = 1; road.draw(); }
    const ST = window.ScrollTrigger;
    if (ST) ST.getAll().forEach(st => { if (st.vars && (st.vars.once || st.vars.toggleActions === ONCE) && st.animation) st.animation.progress(1); });
  }

  /* ---------------------------------------------------------------------
     4. MOTION
     --------------------------------------------------------------------- */
  const pathLen = el => { try { return el.getTotalLength(); } catch (_) { return 0; } };
  /* line icons draw themselves: each stroke runs from nothing to whole */
  function drawLines(gsap, shapes, vars) {
    const els = shapes.filter(el => pathLen(el) > 0);
    els.forEach(el => { const l = pathLen(el) + 1; el.style.strokeDasharray = `${l} ${l}`; el.style.strokeDashoffset = String(l); });
    return gsap.to(els, Object.assign({ strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut',
      onComplete() { els.forEach(el => { el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; }); } }, vars));
  }

  if (!window.SAA || typeof window.SAA.ready !== 'function') return;
  window.SAA.ready(({ gsap, ScrollTrigger, reduce }) => {
    if (!gsap) return;
    const still = reduce || REDUCE || !ScrollTrigger;

    /* the road follows the scroll; a short scrub keeps the marker smooth */
    if (road) {
      if (still) { road.state.p = 1; road.draw(); }
      else {
        road.state.p = 0; road.draw();
        gsap.to(road.state, {
          p: 1, ease: 'none', onUpdate: road.draw,
          scrollTrigger: { trigger: road.wrap, start: 'top 72%', end: 'bottom 62%', scrub: .6, invalidateOnRefresh: true }
        });
      }
    }
    if (still) return;

    /* ----- Cover ----- */
    const cover = $('#cover');
    if (cover) {
      const stage = $('.pfc-stage', cover), emblem = $('.pfc-emblem', cover), seal = $('.pfc-seal', cover);
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      if (stage) tl.from(stage, { scale: .82, opacity: 0, duration: 1.8 }, 0);
      if (seal) tl.from(seal, { scale: .4, rotate: -90, opacity: 0, duration: 1.6, transformOrigin: '50% 50%' }, .5);
      tl.from($$('.pfc-kicker, .pfc-since, .pfc-tag, .pfc-actions', cover), { y: 28, opacity: 0, duration: 1.2, stagger: .08 }, .35)
        .from($$('.pfc-cred', cover), { y: 24, opacity: 0, duration: 1.1, stagger: .07 }, .7)
        .from($$('.pfc-cue', cover), { opacity: 0, duration: 1 }, 1.2);
      /* scrolling away: the emblem drifts up and the copy fades, a little slower than the page */
      const away = { trigger: cover, start: 'top top', end: 'bottom top', scrub: true };
      if (stage) gsap.to(stage, { yPercent: -16, ease: 'none', scrollTrigger: away });
      gsap.to($('.pfc-copy', cover), { yPercent: -10, opacity: .25, ease: 'none', scrollTrigger: away });
      /* the emblem leans towards the pointer */
      if (FINE && emblem) {
        gsap.set(emblem, { transformPerspective: 900 });
        const rx = gsap.quickTo(emblem, 'rotationX', { duration: .9, ease: 'power3' });
        const ry = gsap.quickTo(emblem, 'rotationY', { duration: .9, ease: 'power3' });
        cover.addEventListener('pointermove', e => {
          const r = cover.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - .5) * 14);
          rx(-((e.clientY - r.top) / r.height - .5) * 10);
        }, { passive: true });
        cover.addEventListener('pointerleave', () => { rx(0); ry(0); });
      }
    }

    /* ----- 01: the red rules on the figures, the award laurel ----- */
    const figs = $$('.pf-fig');
    if (figs.length) gsap.fromTo(figs, { '--k': 0 }, { '--k': 1, duration: 1, ease: 'expo.out', stagger: .12, scrollTrigger: { trigger: '.pf-figs', start: 'top 85%', toggleActions: ONCE } });
    const award = $('.pf-award');
    if (award) {
      const atl = gsap.timeline({ scrollTrigger: { trigger: award, start: 'top 82%', toggleActions: ONCE } });
      atl.from(award, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0)
        .add(drawLines(gsap, $$('.pf-award-laurel', award), { duration: 1.4 }), .3)
        .from($$('.pf-award-leaf', award), { opacity: 0, duration: .8, ease: 'power2.out' }, .9)
        .from($$('.pf-award-yr', award), { opacity: 0, y: 10, duration: .8, ease: 'power3.out' }, .8)
        .from($$('.pf-award-body > *', award), { y: 24, opacity: 0, duration: 1, stagger: .08, ease: 'expo.out' }, .35);
    }

    /* ----- 02: portraits open from the bottom ----- */
    $$('.pf-word-photo').forEach(ph => {
      const img = $('img', ph);
      const ptl = gsap.timeline({ scrollTrigger: { trigger: ph, start: 'top 85%', toggleActions: ONCE } });
      ptl.fromTo(ph, { clipPath: 'inset(100% 0% 0% 0% round 26px)' }, { clipPath: 'inset(0% 0% 0% 0% round 26px)', duration: 1.4, ease: 'expo.inOut', clearProps: 'clipPath' }, 0);
      if (img) ptl.from(img, { scale: 1.18, duration: 1.8, ease: 'expo.out' }, .1);
      const tag = $('.pf-word-tag', ph);
      if (tag) ptl.from(tag, { y: -12, opacity: 0, duration: .8, ease: 'power3.out' }, .9);
    });
    $$('.pf-word-body').forEach(b => {
      gsap.from(b.children, { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: b, start: 'top 85%', toggleActions: ONCE } });
    });

    /* ----- 05: industry tiles rise, and their icons draw themselves ----- */
    const ind = $('.pf-ind-grid');
    if (ind) {
      const tiles = $$('.pf-ind-tile', ind);
      const itl = gsap.timeline({ scrollTrigger: { trigger: ind, start: 'top 85%', toggleActions: ONCE } });
      itl.from(tiles, { y: 40, opacity: 0, duration: 1, ease: 'expo.out', stagger: { each: .045, grid: 'auto', from: 'start' } }, 0);
      tiles.forEach((tile, i) => itl.add(drawLines(gsap, $$('.pf-ind-ic svg > *', tile), { duration: 1.2 }), .15 + i * .045));
    }

    /* ----- 04 and 03: icon strokes on the service cards and the values ----- */
    [['.pf-svc-cards', '.pf-svc-ic svg > *'], ['.pf-rec', '.pf-rec-ic svg > *'], ['.pf-values', '.pf-value-ic svg > *'], ['.pf-emi-grid', '.pf-emi-ic svg > *']].forEach(([list, sel]) => {
      const el = $(list); if (!el) return;
      const shapes = $$(sel, el); if (!shapes.length) return;
      const tw = drawLines(gsap, shapes, { duration: 1.3, stagger: .03, paused: true });
      ScrollTrigger.create({ trigger: el, start: 'top 85%', onEnter: () => tw.play() });
    });

    /* ----- 06: the flag rule runs across, each card's colour bar follows ----- */
    const emi = $('#emiratisation');
    if (emi) {
      const rule = $('.pf-flagrule', emi);
      if (rule) gsap.fromTo(rule, { '--k': 0 }, { '--k': 1, duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: emi, start: 'top 80%', toggleActions: ONCE } });
      const cards = $$('.pf-emi-card', emi);
      if (cards.length) gsap.fromTo(cards, { '--k': 0 }, { '--k': 1, duration: 1.1, ease: 'expo.out', stagger: .12, delay: .25, scrollTrigger: { trigger: '.pf-emi-grid', start: 'top 85%', toggleActions: ONCE } });
    }

    /* ----- 08: the map pins land one by one, then the links between them appear ----- */
    const map = $('.pf-map');
    if (map) {
      const mtl = gsap.timeline({ scrollTrigger: { trigger: map, start: 'top 80%', toggleActions: ONCE } });
      const pins = $$('.pf-map-pin', map);
      pins.forEach((pin, i) => {
        mtl.from($$('.pf-map-ring, .pf-map-core', pin), { scale: 0, transformOrigin: '50% 50%', duration: .9, ease: 'back.out(2.2)', stagger: .08 }, .15 + i * .22);
      });
      mtl.from($$('.pf-map-link', map), { opacity: 0, duration: .9, ease: 'power2.out', stagger: .18 }, .55)
        .from($$('.pf-map-l, .pf-map-s', map), { opacity: 0, y: 8, duration: .8, ease: 'power3.out', stagger: .06 }, .4);
    }

    /* ----- 10: a line sweeps under each group company ----- */
    const cos = $$('.pf-co');
    if (cos.length) {
      const ctl = gsap.timeline({ scrollTrigger: { trigger: '.pf-cos', start: 'top 82%', toggleActions: ONCE } });
      ctl.fromTo(cos, { '--k': 0 }, { '--k': 1, duration: .8, ease: 'power2.inOut', stagger: .1 }, .2)
        .to(cos, { '--k': 0, duration: .8, ease: 'power2.inOut', stagger: .1 }, .75);
    }
  });
})();
