/* =========================================================================
   ABOUT page
   1. Hero: drifting seismic ridgelines on a 2D canvas (paused off-screen)
   2. Signature: pinned time scene. Odometer year 1993 -> current year,
      teal fill + dial + ruler, then captions swap through "today" facts.
   3. Chairman frame expands to full bleed; portrait contour art
   4. Strategic priorities: sticky cards that scale back as they pile up
   5. What we stand for: rule lines draw in
   ========================================================================= */
(function () {
  'use strict';

  const FROM = 1993;
  const NOW = Math.max(FROM + 1, new Date().getFullYear());
  const SPAN = NOW - FROM;
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = x => x * x * (3 - 2 * x);
  /* colour mode (assets/js/theme.js); the canvas repaints on every 'saa:theme' change */
  const isLight = () => !!window.SAATheme && window.SAATheme.get() === 'light';

  document.querySelectorAll('[data-now-year]').forEach(el => { el.textContent = NOW; });

  /* ---------------------------------------------------------------------
     1. HERO FIELD — layered seismic ridgelines, back-to-front with
        occlusion (each ridge erases the lines behind it).
     --------------------------------------------------------------------- */
  function heroField(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hero = canvas.parentElement;
    let W = 1, H = 1, N = 30, STEP = 9, cols = 0, xs = null, ys = null;
    let visible = true, raf = 0;
    let mx = 0, my = 0, tx = 0, ty = 0, lift = 0, liftT = 0;
    let light = isLight(), lastMs = 0;
    const T0 = performance.now();

    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      const small = W < 700;
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      N = small ? 20 : 34; STEP = small ? 7 : 9;
      cols = Math.ceil(W / STEP) + 1;
      xs = new Float32Array(cols); ys = new Float32Array(cols);
      for (let c = 0; c < cols; c++) xs[c] = Math.min(W, c * STEP);
    }

    function draw(ms) {
      lastMs = ms;
      const t = ms / 1000;
      const s = clamp(H / 900, .62, 1.2);
      mx += (tx - mx) * .08; my += (ty - my) * .08; lift += (liftT - lift) * .05;
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round';
      let below = -1e9;                 // lowest point drawn so far: occlusion only needs to reach this far
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const y0 = H * (.3 + .78 * Math.pow(u, 1.3));
        const amp = (.28 + .95 * u) * s;
        const rk = .62 + .38 * Math.sin(i * .5 + t * .16);
        const px = (((t * .05 + u * .2) % 1.4) - .2) * W;   // seismic packet travels across
        const pw = 50 + 90 * u;
        for (let c = 0; c < cols; c++) {
          const x = xs[c], nx = x / W;
          let d = 125 * Math.exp(-Math.pow((nx - .74) / .15, 2)) * rk
                + 62 * Math.exp(-Math.pow((nx - .34) / .11, 2)) * (1.15 - rk * .5)
                + 10 * Math.sin(x * .0065 + t * .33 + i * .42)
                + 5 * Math.sin(x * .017 - t * .52 + i * 1.07);
          const e = (x - px) / pw;
          if (e > -3 && e < 3) d += Math.exp(-e * e) * Math.sin(x * .11 - t * 7 + i * .8) * 26;
          if (lift > .01) d += lift * 54 * Math.exp(-Math.pow((x - mx) / 140, 2)) * Math.exp(-Math.pow((y0 - my) / 200, 2));
          ys[c] = y0 - d * amp;
        }
        // occlude what is already drawn behind this ridge (only down to the lowest earlier line, to save fill-rate)
        if (i > 0) {
          const floor = Math.min(H + 4, below + 4);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
          for (let c = 1; c < cols; c++) ctx.lineTo(xs[c], ys[c]);
          ctx.lineTo(W, floor); ctx.lineTo(0, floor); ctx.closePath();
          ctx.fillStyle = '#000'; ctx.fill();
        }
        for (let c = 0; c < cols; c++) if (ys[c] > below) below = ys[c];
        // the ridge line itself
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
        for (let c = 1; c < cols; c++) ctx.lineTo(xs[c], ys[c]);
        const major = i % 6 === 3;
        const a = Math.min(.78, (.07 + .36 * Math.pow(u, 1.1)) * (major ? 1.75 : 1));
        if (light) {
          /* daylight: misty teal ridges at the back deepen to navy at the front; major ridges in deep teal */
          const r = major ? 21 : Math.round(27 - 2 * u), g = major ? 95 : Math.round(113 - 67 * u), b = major ? 128 : Math.round(148 - 75 * u);
          ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a * (major ? .95 : .9)).toFixed(3) + ')';
        } else ctx.strokeStyle = 'rgba(98,184,218,' + a.toFixed(3) + ')';
        ctx.lineWidth = major ? 1.4 : 1;
        ctx.stroke();
      }
    }

    function loop(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(now - T0);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !REDUCE && visible) raf = requestAnimationFrame(loop); }

    resize();
    draw(REDUCE ? 14000 : 0);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        visible = es[0].isIntersecting;
        if (visible) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    /* repaint at once (also the reduced-motion still frame) so the mode switch never shows the old palette */
    document.addEventListener('saa:theme', () => { light = isLight(); draw(lastMs); });
    let rt = 0, lastW = W;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const r = canvas.getBoundingClientRect();
        if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - H) < 80 && !REDUCE) return; // ignore mobile toolbar jitter
        lastW = r.width; resize(); draw(performance.now() - T0);
      }, 140);
    });
    if (FINE && !REDUCE) {
      hero.addEventListener('pointermove', e => {
        const r = canvas.getBoundingClientRect();
        tx = e.clientX - r.left; ty = e.clientY - r.top;
        if (liftT === 0) { mx = tx; my = ty; }
        liftT = 1;
      });
      hero.addEventListener('pointerleave', () => { liftT = 0; });
    }
    start();
  }

  const heroCanvas = document.getElementById('heroField');
  if (heroCanvas) heroField(heroCanvas);

  /* ---------------------------------------------------------------------
     2. TIME SCENE — DOM is built here so the static frame works without GSAP
     --------------------------------------------------------------------- */
  function buildTime(sec) {
    const yr = sec.querySelector('.yr');
    const tag = sec.querySelector('.yr-tag');
    const reel = '<span class="reel"><span class="strip">' + '01234567890'.split('').map(d => '<span>' + d + '</span>').join('') + '</span></span>';
    const layers = [...yr.querySelectorAll('.yr-layer')];
    layers.forEach(l => { l.innerHTML = reel.repeat(4); });
    const strips = layers.map(l => [...l.querySelectorAll('.strip')]);

    /* ruler: one tick per year */
    const ruler = sec.querySelector('.ruler');
    const ticksBox = ruler.querySelector('.ruler-ticks');
    let th = '';
    for (let y = FROM; y <= NOW; y++) th += y % 10 === 0 ? '<i class="major"></i>' : '<i></i>';
    ticksBox.innerHTML = th;
    const ticks = [...ticksBox.children];
    const mids = [];
    for (let y = Math.ceil((FROM + 1) / 10) * 10; y < NOW; y += 10) if (y - FROM > 3 && NOW - y > 3) mids.push(y);
    ruler.querySelector('.ruler-labels').innerHTML =
      '<span style="left:0">' + FROM + '</span>' +
      mids.map(y => '<span class="mid" style="left:' + ((y - FROM) / SPAN * 100).toFixed(3) + '%">' + y + '</span>').join('') +
      '<span style="left:100%">' + NOW + '</span>';
    const rFill = ruler.querySelector('.ruler-fill'), rHead = ruler.querySelector('.ruler-head');
    let rulerW = ruler.clientWidth;

    /* dial: 120 minute ticks outside, one tick per year inside */
    const dialG = sec.querySelector('.dial-rot'), arc = sec.querySelector('.dial-arc');
    let dh = '';
    for (let k = 0; k < 120; k++) {
      const a = k / 120 * Math.PI * 2, maj = k % 10 === 0;
      const r1 = 492, r2 = maj ? 466 : 478;
      dh += '<line' + (maj ? ' class="maj"' : '') + ' x1="' + (500 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (500 - Math.cos(a) * r1).toFixed(1) +
            '" x2="' + (500 + Math.sin(a) * r2).toFixed(1) + '" y2="' + (500 - Math.cos(a) * r2).toFixed(1) + '"/>';
    }
    for (let k = 0; k <= SPAN; k++) {
      const a = (k / (SPAN + 1)) * Math.PI * 2;
      dh += '<line class="yr-t" x1="' + (500 + Math.sin(a) * 432).toFixed(1) + '" y1="' + (500 - Math.cos(a) * 432).toFixed(1) +
            '" x2="' + (500 + Math.sin(a) * 412).toFixed(1) + '" y2="' + (500 - Math.cos(a) * 412).toFixed(1) + '"/>';
    }
    dialG.innerHTML = dh;
    const yearTicks = [...dialG.querySelectorAll('.yr-t')];
    const C = 2 * Math.PI * 455;
    arc.style.strokeDasharray = C.toFixed(1);

    let lastYear = -1, lastPA = 1;
    function render(pA) {
      lastPA = pA;
      const v = FROM + SPAN * pA;
      const base = Math.floor(v), f = v - base;
      const ve = base + smooth(clamp((f - .5) / .5));      // digits rest on whole years, roll quickly between
      const pos = [1000, 100, 10, 1].map(p => {
        const d = Math.floor(ve / p) % 10;
        const frac = p === 1 ? ve - Math.floor(ve) : clamp((ve % p) - (p - 1));
        return d + frac;
      });
      for (const set of strips) for (let k = 0; k < 4; k++) set[k].style.transform = 'translate3d(0,' + (-pos[k]).toFixed(4) + 'em,0)';
      yr.style.setProperty('--f', pA.toFixed(4));
      yr.style.setProperty('--scan', pA > .015 && pA < .985 ? '1' : '0');
      rFill.style.transform = 'scaleX(' + pA.toFixed(4) + ')';
      rHead.style.transform = 'translateX(' + (pA * rulerW).toFixed(1) + 'px)';
      arc.style.strokeDashoffset = (C * (1 - pA)).toFixed(1);
      const y = Math.floor(ve + .5);
      if (y !== lastYear) {
        lastYear = y;
        const n = y - FROM;
        ticks.forEach((el, k) => el.classList.toggle('on', k <= n));
        yearTicks.forEach((el, k) => el.classList.toggle('on', k <= n));
        tag.textContent = y <= FROM ? 'Founded · Abu Dhabi' : y >= NOW ? 'Today · Abu Dhabi' : 'Since 1993';
      }
    }
    function measure() { rulerW = ruler.clientWidth; }
    let rz = 0;
    addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { measure(); render(lastPA); }, 100); });
    /* keeps turning through the whole scene, including the "today" captions */
    function spin(P) { dialG.style.transform = 'rotate(' + (P * -84).toFixed(2) + 'deg)'; }
    return { render, measure, spin };
  }

  const timeSec = document.querySelector('.time');
  const T = timeSec ? buildTime(timeSec) : null;
  if (T) { T.render(1); T.spin(1); }

  /* ---------------------------------------------------------------------
     3. Portrait placeholder art: topographic contour rings
     --------------------------------------------------------------------- */
  const cpSvg = document.querySelector('.cp-art svg');
  if (cpSvg) {
    const cx = 200, cy = 225; let out = '';
    for (let k = 0; k < 17; k++) {
      const R = 22 + k * 18, pts = [];
      for (let a = 0; a <= 72; a++) {
        const th = a / 72 * Math.PI * 2;
        const r = R * (1 + .09 * Math.sin(3 * th + k * .55) + .05 * Math.sin(5 * th - k * .8) + .025 * Math.sin(9 * th + k));
        pts.push((cx + r * Math.cos(th) * .88).toFixed(1) + ',' + (cy + r * Math.sin(th)).toFixed(1));
      }
      out += '<polygon points="' + pts.join(' ') + '" opacity="' + Math.max(.06, .62 - k * .033).toFixed(3) + '"/>';
    }
    cpSvg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="1">' + out + '</g>';
  }

  /* ---------------------------------------------------------------------
     4. Motion hooks (after the shared preloader / Lenis are ready)
     --------------------------------------------------------------------- */
  if (!window.SAA) return;
  window.SAA.ready(({ gsap, ScrollTrigger, lenis, reduce }) => {
    if (!ScrollTrigger) return;
    const mm = gsap.matchMedia();

    /* --- hero entrance + depth --- */
    const hero = document.querySelector('.about-hero');
    if (hero && !reduce) {
      gsap.from(['.ah-lead', '.ah-cta', '.ah-meta > div'], { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .08, delay: .45, clearProps: 'opacity' });
      gsap.from('.ah-badge', { scale: .6, opacity: 0, rotate: -60, duration: 1.6, ease: 'expo.out', delay: .3, clearProps: 'opacity' });
      gsap.to('#heroField', { yPercent: 22, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.ah-wrap', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.ah-badge', { yPercent: 60, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }

    /* --- signature: pinned time scene (only when the screen is tall enough to hold it) --- */
    if (timeSec && T && !reduce) {
      const caps = [...timeSec.querySelectorAll('.cap')];
      const btns = [...timeSec.querySelectorAll('.time-index button')];
      const segs = [...timeSec.querySelectorAll('.time-segs i')];
      const A = .5, HOLD = .06, LAST = caps.length - 1;
      let cur = -1, st = null;

      /* captions swap with a vertical wipe: the old one is cut away upwards
         while the new one is uncovered from below (reversed when scrolling back) */
      const parts = c => c.querySelectorAll('.cap-label, .cap-title, .cap-text, .cap-link');
      const OPEN = 'inset(-20% -4% -30% -4%)';
      const SHUT_TOP = 'inset(-20% -4% 100% -4%)', SHUT_BOT = 'inset(100% -4% -30% -4%)';
      function setCap(i, instant) {
        if (i === cur) return;
        const dir = i > cur ? 1 : -1, prev = caps[cur], next = caps[i];
        cur = i;
        caps.forEach((c, k) => {
          c.classList.toggle('is-on', k === i);
          c.querySelectorAll('a').forEach(a => { a.tabIndex = k === i ? 0 : -1; });
        });
        btns.forEach((b, k) => { b.classList.toggle('is-on', k === i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
        segs.forEach((s, k) => s.classList.toggle('on', k <= i));
        if (instant) {
          caps.forEach((c, k) => { gsap.set(c, { opacity: k === i ? 1 : 0 }); gsap.set(parts(c), { clearProps: 'clipPath,transform' }); });
          return;
        }
        if (prev) {
          gsap.to(parts(prev), {
            clipPath: dir > 0 ? SHUT_TOP : SHUT_BOT, y: -26 * dir, duration: .42, ease: 'power2.in', stagger: .035, overwrite: true,
            onComplete() { if (caps[cur] !== prev) { gsap.set(prev, { opacity: 0 }); gsap.set(parts(prev), { clearProps: 'clipPath,transform' }); } }
          });
        }
        gsap.set(next, { opacity: 1 });
        gsap.fromTo(parts(next), { clipPath: dir > 0 ? SHUT_BOT : SHUT_TOP, y: 44 * dir },
          { clipPath: OPEN, y: 0, duration: 1, delay: .22, stagger: .06, ease: 'expo.out', overwrite: true, clearProps: 'clipPath' });
      }

      mm.add('(min-height: 520px)', () => {
        timeSec.classList.add('is-live');
        cur = -1;
        const proxy = { p: 0 };
        const apply = () => {
          const P = proxy.p;
          const pA = clamp((P - HOLD) / (A - HOLD));
          T.render(pA); T.spin(P);
          timeSec.style.setProperty('--g', (.7 + .4 * pA + .25 * clamp((P - A) / (1 - A))).toFixed(3));
          setCap(P < A ? 0 : Math.min(LAST, 1 + Math.floor((P - A) / (1 - A) * LAST)));
        };
        T.render(0); setCap(0, true);
        const pinLen = () => Math.round(innerHeight * (innerWidth < 861 ? 5 : 6));
        const tw = gsap.to(proxy, {
          p: 1, ease: 'none', onUpdate: apply,
          scrollTrigger: {
            trigger: timeSec, start: 'top top', end: () => '+=' + pinLen(),
            pin: true, scrub: .6, anticipatePin: 1, invalidateOnRefresh: true,
            onRefresh: () => { T.measure(); apply(); }
          }
        });
        st = tw.scrollTrigger;
        ScrollTrigger.sort();
        return () => {   /* too short for a pinned scene: fall back to the static frame */
          st = null;
          timeSec.classList.remove('is-live');
          timeSec.style.removeProperty('--g');
          caps.forEach(c => {
            c.classList.remove('is-on'); gsap.killTweensOf(parts(c));
            gsap.set(c, { clearProps: 'opacity,transform' }); gsap.set(parts(c), { clearProps: 'clipPath,transform' });
            c.querySelectorAll('a').forEach(a => a.removeAttribute('tabindex'));
          });
          T.render(1); T.spin(1);
        };
      });

      const targetP = i => i === 0 ? 0 : A + (i - .5) / LAST * (1 - A);
      btns.forEach((b, i) => b.addEventListener('click', () => {
        if (!st) return;
        const y = st.start + targetP(i) * (st.end - st.start) + 2;
        lenis ? lenis.scrollTo(y, { duration: 1.6 }) : window.scrollTo({ top: y, behavior: 'smooth' });
      }));
    }

    /* --- chairman: frame opens to full bleed --- */
    const frame = document.querySelector('.chair-frame');
    if (frame && !reduce) {
      mm.add({ wide: '(min-width: 861px)', narrow: '(max-width: 860px)' }, c => {
        const from = c.conditions.wide ? 'inset(7% 5% 0% 5% round 40px)' : 'inset(3% 3% 0% 3% round 22px)';
        gsap.fromTo(frame, { clipPath: from }, {
          clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
          scrollTrigger: { trigger: '.chair', start: 'top bottom', end: 'top 15%', scrub: true }
        });
      });
      gsap.from('.chair-portrait', { y: 80, opacity: 0, duration: 1.4, ease: 'expo.out', clearProps: 'opacity', scrollTrigger: { trigger: '.chair-grid', start: 'top 85%', once: true } });
      gsap.from('.chair-sign > *', { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .1, clearProps: 'opacity', scrollTrigger: { trigger: '.chair-sign', start: 'top 92%', once: true } });
      gsap.from('.chair-close', { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity', scrollTrigger: { trigger: '.chair-close', start: 'top 92%', once: true } });
    }

    /* --- leadership: cards rise in order; message portraits drift inside their frames --- */
    if (!reduce) {
      if (document.querySelector('.team-grid')) gsap.from('.team-card', { y: 90, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: .12, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.team-grid', start: 'top 85%', once: true } });
      if (document.querySelector('.ceo-grid')) {
        gsap.from('.ceo-portrait', { y: 80, opacity: 0, duration: 1.4, ease: 'expo.out', clearProps: 'opacity', scrollTrigger: { trigger: '.ceo-grid', start: 'top 85%', once: true } });
        gsap.from('.ceo-sign > *', { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .1, clearProps: 'opacity', scrollTrigger: { trigger: '.ceo-sign', start: 'top 92%', once: true } });
      }
      document.querySelectorAll('.chair-portrait.has-photo img, .ceo-portrait img').forEach(img => {
        gsap.fromTo(img, { yPercent: -4, scale: 1.1 }, { yPercent: 4, scale: 1.1, ease: 'none', scrollTrigger: { trigger: img.closest('figure') || img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    }

    /* --- priorities: cards scale back and dim as the next one lands --- */
    const cards = [...document.querySelectorAll('.pcard')];
    if (cards.length) {
      const inner = cards.map(c => c.querySelector('.pcard-in'));
      const shade = cards.map(c => c.querySelector('.pc-shade'));
      let stickTop = cards.map(() => 0);
      const measure = () => { stickTop = cards.map(c => parseFloat(getComputedStyle(c).top) || 0); };
      const pile = () => {
        const vh = innerHeight;
        const prog = cards.map((c, k) => {
          const r = c.getBoundingClientRect();
          return clamp((vh - r.top) / Math.max(1, vh - stickTop[k]));
        });
        cards.forEach((c, k) => {
          let s = 0;
          for (let j = k + 1; j < cards.length; j++) s += prog[j];
          inner[k].style.transform = s > 0 ? 'scale(' + (1 - .05 * s).toFixed(4) + ')' : '';
          shade[k].style.opacity = Math.min(.55, .22 * s).toFixed(3);
        });
      };
      if (!reduce) {
        measure();
        ScrollTrigger.create({ trigger: '.stack', start: 'top bottom', end: 'bottom top', onUpdate: pile, onRefresh: () => { measure(); pile(); } });
        cards.forEach(c => {
          const paths = c.querySelectorAll('.pc-art path, .pc-art circle:not(.pc-pulse), .pc-art ellipse');
          gsap.from(paths, { opacity: 0, scale: .6, transformOrigin: '50% 50%', duration: 1.2, ease: 'expo.out', stagger: .04, clearProps: 'opacity,transform',
            scrollTrigger: { trigger: c, start: 'top 80%', once: true } });
          gsap.from(c.querySelectorAll('.pc-label, .pc-title, .pc-text, .tlink'), { y: 50, duration: 1.2, ease: 'expo.out', stagger: .06,
            scrollTrigger: { trigger: c, start: 'top 85%', once: true } });
        });
      }
    }

    /* --- what we stand for: rule lines draw across --- */
    if (!reduce) {
      document.querySelectorAll('.stand-row').forEach((row, k) => {
        const line = row.querySelector('.stand-line');
        const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 88%', once: true } });
        tl.from(line, { scaleX: 0, duration: 1.4, ease: 'expo.inOut' })
          .from(row.querySelector('.stand-ic'), { scale: 0, rotate: -90, duration: 1, ease: 'back.out(1.6)' }, .3)
          .from(row.querySelector('.stand-t'), { y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity' }, .35)
          .from(row.querySelector('.stand-d'), { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity' }, .45);
      });
    }

    /* The shared reveals (site.js) were created before this page's pin, so they
       would refresh first and ignore the pin's extra scroll distance. Sorting by
       start position makes the pin refresh first and everything below it line up. */
    ScrollTrigger.sort();
  });
})();
