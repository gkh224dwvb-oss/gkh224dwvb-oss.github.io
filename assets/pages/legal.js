/* =========================================================================
   LEGAL — privacy policy and terms of use
   1. Contents block: open on desktop (sticky list), collapsed on phones
   2. Scroll-spy: marks the section being read and fills a reading bar
   3. Contents links move keyboard focus to the section they jump to
   4. Print button
   Works without GSAP; the shared site.js handles the smooth anchor scroll.
   ========================================================================= */
(function () {
  'use strict';
  const toc = document.querySelector('.lg-toc');
  const doc = document.querySelector('.lg-doc');
  if (!toc || !doc) return;

  /* 1. contents block */
  const details = toc.querySelector('details');
  const phone = matchMedia('(max-width: 960px)');
  const syncDetails = () => { if (details) details.open = !phone.matches; };
  syncDetails();
  phone.addEventListener ? phone.addEventListener('change', syncDetails) : phone.addListener(syncDetails);

  /* 2. scroll-spy */
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const items = links.map(a => ({ a, sec: document.getElementById(a.getAttribute('href').slice(1)) })).filter(x => x.sec);
  const bar = toc.querySelector('.lg-prog');
  let current = null, ticking = false;
  function update() {
    ticking = false;
    const line = innerHeight * 0.32;
    let active = null;
    for (const it of items) { if (it.sec.getBoundingClientRect().top - line <= 0) active = it; else break; }
    /* at the very bottom, the last section is the one being read */
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4 && items.length) {
      const last = items[items.length - 1];
      if (last.sec.getBoundingClientRect().top < innerHeight) active = last;
    }
    if (active !== current) {
      if (current) current.a.removeAttribute('aria-current');
      if (active) active.a.setAttribute('aria-current', 'true');
      current = active;
    }
    if (bar) {
      const r = doc.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height - line)));
      bar.style.setProperty('--read', p.toFixed(3));
    }
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  update();

  /* 3. jump to the section from the real scroll position (so a smooth scroller
        that missed a native scroll cannot land short), then move focus there */
  let lenis = null;
  if (window.SAA && SAA.ready) SAA.ready(ctx => { lenis = ctx && ctx.lenis; });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  links.forEach(a => a.addEventListener('click', e => {
    const sec = document.getElementById(a.getAttribute('href').slice(1));
    if (!sec) return;
    e.preventDefault(); e.stopPropagation();
    if (phone.matches && details) details.open = false;
    const offset = parseFloat(getComputedStyle(sec).scrollMarginTop) || 100;
    const y = Math.max(0, sec.getBoundingClientRect().top + scrollY - offset);
    if (lenis) lenis.scrollTo(y); else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    const h = sec.querySelector('h2') || sec;
    h.setAttribute('tabindex', '-1');
    setTimeout(() => { try { h.focus({ preventScroll: true }); } catch (_) { h.focus(); } }, 30);
    try { history.replaceState(null, '', a.getAttribute('href')); } catch (_) {}
  }));

  /* 4. print */
  document.querySelectorAll('[data-print]').forEach(b => {
    /* shown from the start so the hero never shifts; hidden only where printing isn't possible */
    if (typeof window.print !== 'function') { b.hidden = true; return; }
    b.addEventListener('click', () => window.print());
  });
})();
