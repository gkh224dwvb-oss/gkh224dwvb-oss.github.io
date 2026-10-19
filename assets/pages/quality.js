/* =========================================================================
   QUALITY page
   1. Hero: a calibration ring whose five arcs light in turn
   2. Signature: the quality-system wheel (SVG, built from the panel markup
      so the five areas and twenty parts have one source of truth).
      - Desktop (>860px wide, >=600px tall): pinned; scroll turns the wheel
        and each area rests at the pointer while its panel is shown.
      - Everywhere else: tap, click, drag or use the tabs to turn it.
      - Keyboard: the tabs are a real tablist (arrows, Home, End).
      - Reduced motion: no pin, no tweening, still frame per selection.
   3. Principles, quotes and certificate motion
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = x => x * x * (3 - 2 * x);
  const rad = d => d * Math.PI / 180;
  const f1 = n => (Math.round(n * 10) / 10).toString();
  const pt = (r, a) => [500 + r * Math.cos(rad(a)), 500 + r * Math.sin(rad(a))];

  /* clockwise arc from a0 to a1 (degrees, 0 = 3 o'clock, centre 500,500) */
  function arc(r, a0, a1) {
    const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
    return 'M' + f1(x0) + ' ' + f1(y0) + 'A' + r + ' ' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + f1(x1) + ' ' + f1(y1);
  }
  /* the same arc drawn anticlockwise (so text on it reads upright on the lower half) */
  function arcRev(r, a0, a1) {
    const [x0, y0] = pt(r, a1), [x1, y1] = pt(r, a0);
    return 'M' + f1(x0) + ' ' + f1(y0) + 'A' + r + ' ' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 0 ' + f1(x1) + ' ' + f1(y1);
  }
  /* ring wedge with constant-width gaps between neighbours */
  function wedge(r0, r1, a0, a1, gap) {
    const g0 = gap / 2 / r0 * 180 / Math.PI, g1 = gap / 2 / r1 * 180 / Math.PI;
    const [ax, ay] = pt(r1, a0 + g1), [bx, by] = pt(r1, a1 - g1), [cx, cy] = pt(r0, a1 - g0), [dx, dy] = pt(r0, a0 + g0);
    return 'M' + f1(ax) + ' ' + f1(ay) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + f1(bx) + ' ' + f1(by) +
           'L' + f1(cx) + ' ' + f1(cy) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + f1(dx) + ' ' + f1(dy) + 'Z';
  }
  const line = (cls, r0, r1, a) => {
    const [x0, y0] = pt(r0, a), [x1, y1] = pt(r1, a);
    return '<line class="' + cls + '" x1="' + f1(x0) + '" y1="' + f1(y0) + '" x2="' + f1(x1) + '" y2="' + f1(y1) + '"/>';
  };
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ---------------------------------------------------------------------
     1. HERO RING
     --------------------------------------------------------------------- */
  const heroSvg = document.querySelector('.qh-ring svg');
  if (heroSvg) {
    let h = '<circle class="hr-line" cx="500" cy="500" r="486"/>';
    for (let k = 0; k < 120; k++) h += line('hr-tick' + (k % 6 === 0 ? ' maj' : ''), k % 6 === 0 ? 440 : 452, 466, k * 3 - 90);
    h += '<g class="hr-glow">';
    for (let k = 0; k < 5; k++) h += '<path class="hr-seg" d="' + arc(408, k * 72 - 126 + 2.4, k * 72 - 54 - 2.4) + '"/>';
    h += '</g>';
    for (let k = 0; k < 20; k++) { const [x, y] = pt(364, k * 18 - 117); h += '<circle class="hr-dot" cx="' + f1(x) + '" cy="' + f1(y) + '" r="4.5"/>'; }
    h += '<circle class="hr-dash" cx="500" cy="500" r="318"/><circle class="hr-line" cx="500" cy="500" r="250"/>';
    heroSvg.innerHTML = h;
  }

  /* ---------------------------------------------------------------------
     2. QUALITY SYSTEM WHEEL
     --------------------------------------------------------------------- */
  const sec = document.querySelector('.qs');
  const W = sec ? buildWheel(sec) : null;

  function buildWheel(sec) {
    const svg = sec.querySelector('.wheel');
    const box = sec.querySelector('.qs-wheel');
    const stage = sec.querySelector('.qs-stage');
    const hint = sec.querySelector('.qs-hint');
    const tablist = sec.querySelector('.qs-tabs');
    const tabs = [...sec.querySelectorAll('.qt')];
    const panelsBox = sec.querySelector('.qs-panels');
    const panels = [...sec.querySelectorAll('.qp')];
    if (!svg || !panels.length) return null;

    const AREAS = panels.map(p => ({
      name: p.querySelector('.qp-title').textContent.trim(),
      items: [...p.querySelectorAll('.qp-items li')].map(li => li.textContent.trim()),
      icon: p.querySelector('.qp-ic svg').innerHTML
    }));
    const N = AREAS.length, SEG = 360 / N;
    const R = { hub: 150, segIn: 168, segOut: 296, node: 314, lab: 400, tickIn: 480, tickOut: 494, rim: 500, frame: 510 };
    const LH = 21, MAXC = 15;

    /* word-wrap a part name into radial lines */
    const wrap = s => {
      const out = []; let cur = '';
      s.split(' ').forEach(w => { const t = cur ? cur + ' ' + w : w; if (t.length > MAXC && cur) { out.push(cur); cur = w; } else cur = t; });
      if (cur) out.push(cur);
      return out;
    };

    /* ---- defs ---- */
    let s = '<defs>' +
      '<radialGradient id="wDisc" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0E2D52"/><stop offset=".6" stop-color="#071A33"/><stop offset="1" stop-color="#04101F"/></radialGradient>' +
      '<linearGradient id="wSegOn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7FE3DA"/><stop offset=".55" stop-color="#19C2B8"/><stop offset="1" stop-color="#00A19B"/></linearGradient>' +
      '<radialGradient id="wHl" gradientUnits="userSpaceOnUse" cx="500" cy="500" r="500"><stop offset=".58" stop-color="#00A19B" stop-opacity=".02"/><stop offset=".8" stop-color="#00A19B" stop-opacity=".2"/><stop offset="1" stop-color="#5ED6CC" stop-opacity=".07"/></radialGradient>' +
      '<filter id="wGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="wSegGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16" result="b"/><feColorMatrix in="b" values="0 0 0 0 0  0 0 0 0 .63  0 0 0 0 .61  0 0 0 .9 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<path id="wHubPath" d="M374 500a126 126 0 1 1 252 0a126 126 0 1 1 -252 0"/>';
    AREAS.forEach((A, k) => {
      const a0 = k * SEG - SEG / 2, a1 = a0 + SEG;
      s += '<path id="wsnA' + k + '" d="' + arc(270, a0 + 2, a1 - 2) + '"/><path id="wsnB' + k + '" d="' + arcRev(281, a0 + 2, a1 - 2) + '"/>';
    });
    s += '</defs>';

    /* ---- static frame: disc, outer ring, window and pointer ---- */
    s += '<circle class="w-disc" cx="500" cy="500" r="' + R.rim + '" fill="url(#wDisc)"/>';
    s += '<circle class="w-frame" cx="500" cy="500" r="' + R.frame + '"/>';
    s += '<g class="w-fticks">';
    for (let k = 0; k < 72; k++) s += line('', 515, k % 9 === 0 ? 530 : 521, k * 5);
    s += '</g><path class="w-window" d=""/><path class="w-pointer" d=""/>';

    /* ---- rotating wheel ---- */
    s += '<g class="w-rot">';
    AREAS.forEach((A, k) => { s += '<path class="w-hl" d="' + wedge(R.segOut + 8, R.tickOut, k * SEG - SEG / 2, k * SEG + SEG / 2, 6) + '"/>'; });
    s += '<circle class="w-ring" cx="500" cy="500" r="' + R.tickOut + '"/>';
    for (let t = 0; t < 120; t++) s += line('w-tick' + (t % 6 === 0 ? ' maj' : ''), t % 6 === 0 ? 470 : R.tickIn, R.tickOut, t * 3 - SEG / 2);
    for (let k = 0; k < N; k++) s += line('w-div', R.segOut + 8, R.tickOut, k * SEG - SEG / 2);
    const labAngles = [];
    AREAS.forEach((A, k) => {
      const per = SEG / A.items.length;
      A.items.forEach((it, j) => {
        const a = k * SEG - SEG / 2 + (j + .5) * per;
        labAngles.push(a);
        const [nx, ny] = pt(R.node, a);
        s += line('w-bar" data-k="' + k, 340, 452, a);
        s += '<circle class="w-node" data-k="' + k + '" cx="' + f1(nx) + '" cy="' + f1(ny) + '" r="6"/>';
        const lines = wrap(it), cx = 500 + R.lab;
        s += '<g transform="rotate(' + f1(a) + ' 500 500)"><text class="w-lab" data-k="' + k + '" x="' + cx + '" y="500" text-anchor="middle">' +
          lines.map((l, i) => '<tspan x="' + cx + '" y="' + f1(500 + (i - (lines.length - 1) / 2) * LH + 7) + '">' + esc(l) + '</tspan>').join('') +
          '</text></g>';
      });
    });
    AREAS.forEach((A, k) => {
      const a0 = k * SEG - SEG / 2, a1 = a0 + SEG, d = wedge(R.segIn, R.segOut, a0, a1, 9), nm = esc(A.name.toUpperCase());
      s += '<g class="w-seg" data-k="' + k + '" data-cursor="Select">' +
        '<path class="w-seg-base" d="' + d + '"/><path class="w-seg-on" d="' + d + '" filter="url(#wSegGlow)"/>' +
        '<text class="w-seg-name w-sn-a"><textPath href="#wsnA' + k + '" startOffset="50%" text-anchor="middle">' + nm + '</textPath></text>' +
        '<text class="w-seg-name w-sn-b" style="opacity:0"><textPath href="#wsnB' + k + '" startOffset="50%" text-anchor="middle">' + nm + '</textPath></text>' +
        '<g class="w-ic">' + A.icon + '</g></g>';
    });
    s += '</g>';

    /* ---- hub: official emblem (never redrawn) + slow text ring ----
       the white emblem sits on the navy dial, the navy one on the daylight dial (light mode) */
    const emblem = () => 'assets/img/logo-emblem-' + (window.SAATheme && window.SAATheme.get() === 'light' ? 'navy' : 'white') + '.png';
    s += '<g class="w-hub"><circle class="w-hub-disc" cx="500" cy="500" r="' + R.hub + '"/>' +
      '<g class="w-hub-rot"><text class="w-hub-text"><textPath href="#wHubPath" textLength="786" lengthAdjust="spacing">SAA GROUP · QUALITY SYSTEM · SAA GROUP · QUALITY SYSTEM · </textPath></text></g>' +
      '<circle class="w-hub-ring" cx="500" cy="500" r="104"/>' +
      '<image href="' + emblem() + '" x="445" y="450" width="110" height="100"/></g>';
    svg.innerHTML = s;
    const hubImg = svg.querySelector('.w-hub image');
    document.addEventListener('saa:theme', () => {
      hubImg.setAttribute('href', emblem());
      /* rim labels take the new floor now, unless the turn-in tween still owns them (it resyncs when done) */
      if (labs.every(el => +el.style.opacity === +labOp[+el.dataset.k])) { labOp.fill(''); render(); }
    });

    const rotG = svg.querySelector('.w-rot'), hubRot = svg.querySelector('.w-hub-rot');
    const win = svg.querySelector('.w-window'), ptr = svg.querySelector('.w-pointer');
    const segs = [...svg.querySelectorAll('.w-seg')];
    const segOn = segs.map(g => g.querySelector('.w-seg-on'));
    const nameA = segs.map(g => g.querySelector('.w-sn-a')), nameB = segs.map(g => g.querySelector('.w-sn-b'));
    const icons = segs.map(g => g.querySelector('.w-ic'));
    const hls = [...svg.querySelectorAll('.w-hl')];
    const labs = [...svg.querySelectorAll('.w-lab')];
    const nodes = [...svg.querySelectorAll('.w-node')];
    const bars = [...svg.querySelectorAll('.w-bar')];
    const byK = list => AREAS.map((_, k) => list.filter(el => +el.dataset.k === k));
    const labsK = byK(labs), nodesK = byK(nodes), barsK = byK(bars);

    /* ---- state ---- */
    const st = { v: 0, P: 0, intro: 0 };
    let compact = false, active = -1, live = false, trig = null, motionReady = false;
    const onState = AREAS.map(() => null), labOp = AREAS.map(() => ''), nameState = AREAS.map(() => null), flip = labs.map(() => null);
    const wrapD = (v, k) => { const d = ((v - k) % N + N) % N; return Math.min(d, N - d); };

    function setPointer() {
      const P = st.P;
      win.setAttribute('d', arc(R.frame, P - SEG / 2 + 2, P + SEG / 2 - 2));
      const [tx, ty] = pt(516, P), [bx, by] = pt(538, P), nx = -Math.sin(rad(P)) * 11, ny = Math.cos(rad(P)) * 11;
      ptr.setAttribute('d', 'M' + f1(tx) + ' ' + f1(ty) + 'L' + f1(bx + nx) + ' ' + f1(by + ny) + 'L' + f1(bx - nx) + ' ' + f1(by - ny) + 'Z');
    }

    function render() {
      const rot = st.P - st.v * SEG + st.intro;
      rotG.setAttribute('transform', 'rotate(' + rot.toFixed(3) + ' 500 500)');
      hubRot.setAttribute('transform', 'rotate(' + (-rot * .5).toFixed(3) + ' 500 500)');
      const icR = compact ? 232 : 214, icS = compact ? 2.7 : 1.9;
      /* idle rim labels: navy on the daylight dial needs more weight to read as well as white on navy */
      const [lf, lr] = window.SAATheme && window.SAATheme.get() === 'light' ? [.74, .26] : [.44, .56];
      for (let k = 0; k < N; k++) {
        const act = clamp(1 - wrapD(st.v, k));
        const e = act * act * (3 - 2 * act);
        segOn[k].style.opacity = e.toFixed(3);
        hls[k].style.opacity = e.toFixed(3);
        const lo = (lf + lr * e).toFixed(2);
        if (labOp[k] !== lo) { labOp[k] = lo; labsK[k].forEach(el => { el.style.opacity = lo; }); }
        const on = act > .5;
        if (onState[k] !== on) {
          onState[k] = on;
          segs[k].classList.toggle('on', on);
          barsK[k].forEach(el => el.classList.toggle('on', on));
          nodesK[k].forEach(el => { el.classList.toggle('on', on); el.setAttribute('r', on ? 8 : 6); });
        }
        const lower = Math.sin(rad(k * SEG + rot)) > .25;
        if (nameState[k] !== lower) {
          nameState[k] = lower;
          nameA[k].style.opacity = lower ? 0 : 1; nameB[k].style.opacity = lower ? 1 : 0;
        }
        const [ix, iy] = pt(icR, k * SEG);
        icons[k].setAttribute('transform', 'translate(' + f1(ix) + ' ' + f1(iy) + ') rotate(' + (-rot).toFixed(2) + ') scale(' + icS + ') translate(-12 -12)');
      }
      if (!compact) {
        for (let i = 0; i < labs.length; i++) {
          const fl = Math.cos(rad(labAngles[i] + rot)) < 0;
          if (flip[i] !== fl) { flip[i] = fl; if (fl) labs[i].setAttribute('transform', 'rotate(180 ' + (500 + R.lab) + ' 500)'); else labs[i].removeAttribute('transform'); }
        }
      }
      const idx = ((Math.round(st.v) % N) + N) % N;
      if (idx !== active) setActive(idx);
    }

    /* ---- panel + tabs ---- */
    const parts = p => p.querySelectorAll('.qp-top, .qp-title, .qp-items li, .qp-note');
    function setActive(i) {
      const prev = active; active = i;
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
      const next = panels[i], old = prev >= 0 ? panels[prev] : null;
      const g = window.gsap, anim = g && motionReady && !REDUCE;
      panels.forEach(p => { if (p !== next && p !== old) p.hidden = true; });
      next.hidden = false;
      if (old && old !== next) {
        if (anim) {
          g.to(old, { opacity: 0, y: -14, duration: .22, ease: 'power2.in', overwrite: true,
            onComplete() { if (panels[active] !== old) old.hidden = true; g.set(old, { clearProps: 'opacity,transform' }); } });
        } else old.hidden = true;
      }
      if (anim) {
        g.set(next, { clearProps: 'opacity,transform' });
        g.fromTo(parts(next), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .8, delay: .1, stagger: .045, ease: 'expo.out', overwrite: true });
      }
      /* keep the selected chip in view on phones (scrolls only the chip row) */
      if (tablist && tablist.scrollWidth > tablist.clientWidth + 2) {
        const t = tabs[i];
        const left = t.offsetLeft - (tablist.clientWidth - t.offsetWidth) / 2;
        try { tablist.scrollTo({ left, behavior: REDUCE || !motionReady ? 'auto' : 'smooth' }); } catch (_) { tablist.scrollLeft = left; }
      }
    }

    /* ---- free-mode tween (no GSAP needed) ---- */
    let raf = 0;
    function stopTween() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function tweenV(target, dur) {
      stopTween();
      if (REDUCE || !dur) { st.v = target; render(); return; }
      const from = st.v, t0 = performance.now();
      const step = now => {
        const t = clamp((now - t0) / (dur * 1000));
        st.v = from + (target - from) * (1 - Math.pow(1 - t, 4));
        render();
        raf = t < 1 ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    }

    /* scroll-driven mapping: each area rests at the pointer for a while, then the wheel turns */
    const HOLD = .32;
    const stair = x => { const f = Math.floor(x); return clamp(f + smooth(clamp((x - f - HOLD) / (1 - 2 * HOLD))), 0, N - 1); };
    const xOf = p => -HOLD + p * (N - 1 + 2 * HOLD);

    let lenis = null;
    function go(k) {
      if (live && trig) {
        const p = (k + HOLD) / (N - 1 + 2 * HOLD);
        const y = Math.round(trig.start + p * (trig.end - trig.start)) + 1;
        if (lenis) lenis.scrollTo(y, { duration: 1.4 }); else window.scrollTo({ top: y, behavior: REDUCE ? 'auto' : 'smooth' });
        return;
      }
      let d = ((k - st.v) % N + N) % N; if (d > N / 2) d -= N;
      tweenV(st.v + d, 1.1);
    }

    tabs.forEach((t, k) => t.addEventListener('click', () => go(k)));
    tablist.addEventListener('keydown', e => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let k = null;
      if (e.key in keys) k = (active + keys[e.key] + N) % N;
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = N - 1;
      if (k === null) return;
      e.preventDefault();
      tabs[k].focus({ preventScroll: true });
      go(k);
    });

    /* ---- click / tap / drag on the wheel ---- */
    let drag = null;
    const angleAt = e => { const r = box.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    box.addEventListener('pointerdown', e => {
      if (live || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, a0: angleAt(e), v0: st.v, moved: false, seg: e.target.closest && e.target.closest('.w-seg') };
    });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
        drag.moved = true; stopTween(); box.classList.add('is-drag');
        try { box.setPointerCapture(e.pointerId); } catch (_) {}
      }
      let da = angleAt(e) - drag.a0;
      da = ((da + 540) % 360) - 180;
      drag.a0 += da; drag.v0 -= da / SEG;
      st.v = drag.v0; render();
    }, { passive: true });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null; box.classList.remove('is-drag');
      if (d.moved) tweenV(Math.round(st.v), .7);
      else if (d.seg && e.type === 'pointerup') go(+d.seg.dataset.k);
    };
    addEventListener('pointerup', endDrag);
    addEventListener('pointercancel', endDrag);
    svg.addEventListener('click', e => {
      const g = e.target.closest && e.target.closest('.w-seg');
      if (g && live) go(+g.dataset.k);
    });

    /* ---- layout: pointer side and compact rim ---- */
    const side = matchMedia('(min-width: 861px)');
    function setHint() {
      if (!hint) return;
      hint.textContent = live ? 'Scroll to turn the wheel' : (FINE ? 'Drag or click to turn' : 'Drag or tap to turn');
    }
    function layout() {
      st.P = side.matches ? 0 : 90;
      const c = box.clientWidth > 0 && box.clientWidth < 500;
      if (c !== compact) { compact = c; svg.classList.toggle('is-compact', c); flip.fill(null); }
      setPointer(); setHint(); render();
    }
    if (side.addEventListener) side.addEventListener('change', layout); else side.addListener(layout);
    if ('ResizeObserver' in window) new ResizeObserver(() => { const c = box.clientWidth < 500; if (c !== compact) layout(); }).observe(box);
    else addEventListener('resize', layout);

    panelsBox.classList.add('is-ready');
    panels.forEach((p, k) => { p.hidden = k !== 0; });
    layout();

    return {
      sec, stage, svg, box, st, render, stopTween, tabs, N, xOf, stair, setHint,
      setLive(on, t) { live = on; trig = t || null; setHint(); },
      setLenis(l) { lenis = l; },
      resync() { labOp.fill(''); render(); },
      ready() { motionReady = true; }
    };
  }

  /* ---------------------------------------------------------------------
     3. Motion hooks (after the shared preloader / Lenis are ready)
     --------------------------------------------------------------------- */
  if (!window.SAA) return;
  window.SAA.ready(({ gsap, ScrollTrigger, lenis, reduce }) => {
    if (W) { W.setLenis(lenis); W.ready(); }
    if (!ScrollTrigger) return;
    const mm = gsap.matchMedia();

    /* --- hero --- */
    const hero = document.querySelector('.q-hero');
    if (hero && !reduce) {
      gsap.from(['.qh-lead', '.qh-meta > div', '.qh-cue'], { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .08, delay: .45, clearProps: 'opacity' });
      gsap.from('.qh-ring', { opacity: 0, duration: 1.8, ease: 'power2.out', delay: .15, clearProps: 'opacity' });
      gsap.from('.qh-ring .hr-tick', { opacity: 0, duration: .5, stagger: { each: .006, from: 'start' }, delay: .3, clearProps: 'opacity' });
      gsap.to('.qh-ring', { yPercent: 20, rotate: 24, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.qh-wrap', { yPercent: -12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }

    /* --- signature: the wheel --- */
    if (W && !reduce) {
      const { st, render, svg, stage, tabs, N, xOf, stair } = W;

      /* turn-in on first sight */
      st.intro = -120; render();
      const tl = gsap.timeline({ paused: true });
      tl.to(st, { intro: 0, duration: 2.2, ease: 'expo.out', onUpdate: render }, 0)
        .from(svg.querySelectorAll('.w-seg-base'), { opacity: 0, scale: .55, svgOrigin: '500 500', duration: 1.3, ease: 'expo.out', stagger: .08 }, 0)
        .from(svg.querySelector('.w-hub'), { opacity: 0, scale: .4, svgOrigin: '500 500', duration: 1.3, ease: 'back.out(1.5)' }, .05)
        .from(svg.querySelectorAll('.w-tick'), { opacity: 0, duration: .5, stagger: .005 }, .15)
        .from(svg.querySelectorAll('.w-node, .w-bar'), { opacity: 0, duration: .5, stagger: .02 }, .3)
        .from(svg.querySelectorAll('.w-lab'), { opacity: 0, duration: .7, stagger: .025 }, .35)
        .from(svg.querySelectorAll('.w-window, .w-pointer'), { opacity: 0, duration: .8 }, .9)
        .eventCallback('onComplete', () => W.resync());
      ScrollTrigger.create({ trigger: stage, start: 'top 82%', once: true, onEnter: () => tl.play() });

      /* pinned scene on screens that can hold it */
      mm.add('(min-width: 861px) and (min-height: 600px)', () => {
        W.stopTween();
        W.sec.classList.add('is-live');
        const proxy = { p: 0 };
        const apply = () => {
          const x = xOf(proxy.p);
          st.v = stair(x);
          tabs.forEach((t, k) => t.style.setProperty('--p', clamp(x - k + .5).toFixed(3)));
          render();
        };
        const tw = gsap.to(proxy, {
          p: 1, ease: 'none', onUpdate: apply,
          scrollTrigger: {
            trigger: stage, start: 'top top', end: () => '+=' + Math.round(innerHeight * N * .78),
            pin: true, scrub: .5, anticipatePin: 1, invalidateOnRefresh: true, onRefresh: apply
          }
        });
        W.setLive(true, tw.scrollTrigger);
        apply();
        return () => {
          W.setLive(false);
          W.sec.classList.remove('is-live');
          tabs.forEach(t => t.style.removeProperty('--p'));
          st.v = Math.round(st.v);
          render();
        };
      });

      /* subtle 3D tilt toward the pointer */
      if (FINE) {
        const tilt = W.sec.querySelector('.qs-tilt');
        gsap.set(tilt, { transformPerspective: 1300 });
        const rx = gsap.quickTo(tilt, 'rotationX', { duration: .9, ease: 'power3' });
        const ry = gsap.quickTo(tilt, 'rotationY', { duration: .9, ease: 'power3' });
        stage.addEventListener('pointermove', e => {
          const r = W.box.getBoundingClientRect();
          const nx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -1, 1), ny = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -1, 1);
          ry(nx * 7); rx(-ny * 7);
        });
        stage.addEventListener('pointerleave', () => { rx(0); ry(0); });
      }
    }

    /* --- principles: rules draw, words rise --- */
    if (!reduce) {
      document.querySelectorAll('.pr-col').forEach((c, k) => {
        const tl = gsap.timeline({ delay: k * .12, scrollTrigger: { trigger: '.pr-cols', start: 'top 84%', once: true } });
        tl.from(c.querySelector('.pr-rule'), { scaleX: 0, duration: 1.3, ease: 'expo.inOut' })
          .from(c.querySelector('.pr-ic'), { scale: 0, rotate: -90, duration: 1, ease: 'back.out(1.6)' }, .25)
          .from(c.querySelector('.pr-word'), { yPercent: 60, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity,transform' }, .3)
          .from(c.querySelectorAll('.pr-for, .pr-text, .pr-list li'), { y: 30, opacity: 0, duration: 1, ease: 'expo.out', stagger: .06, clearProps: 'opacity,transform' }, .42);
      });
    }

    /* --- quality and growth: drifting type behind the statement --- */
    if (!reduce && document.querySelector('.qq')) {
      gsap.fromTo('.qq-type', { xPercent: 0 }, { xPercent: -32, ease: 'none', scrollTrigger: { trigger: '.qq', start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.fromTo('.qq-mark', { yPercent: -10 }, { yPercent: 30, ease: 'none', scrollTrigger: { trigger: '.qq', start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.from('.qq-join i', { scaleY: 0, ease: 'none', scrollTrigger: { trigger: '.qq-join', start: 'top 85%', end: 'bottom 55%', scrub: true } });
      gsap.from('.qq-cap', { x: 40, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: '.qq-cap', start: 'top 95%', once: true } });
    }

    /* --- certificate frame: rise in, tilt toward the pointer --- */
    const frame = document.querySelector('.cert-frame');
    if (frame && !reduce) {
      gsap.from(frame, { y: 60, opacity: 0, scale: .96, duration: 1.4, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: frame, start: 'top 88%', once: true } });
      if (FINE) {
        const doc = frame.querySelector('.cert-doc');
        frame.addEventListener('pointermove', e => {
          const r = frame.getBoundingClientRect();
          doc.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 12).toFixed(2) + 'deg');
          doc.style.setProperty('--rx', ((.5 - (e.clientY - r.top) / r.height) * 10).toFixed(2) + 'deg');
        });
        frame.addEventListener('pointerleave', () => { doc.style.setProperty('--rx', '0deg'); doc.style.setProperty('--ry', '0deg'); });
      }
    }

    /* site.js reveals were created before this page's pin; sort so the pin refreshes first */
    ScrollTrigger.sort();
  });
})();
