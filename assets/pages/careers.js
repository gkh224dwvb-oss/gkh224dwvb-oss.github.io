/* =========================================================================
   CAREERS page
   1. Hero: a field of vertical lines with pulses of light rising up them
   2. Signature: Emiratisation ribbons. Thin silk-like ribbons of light
      stream out of a red hoist line in three bands (green, white, black),
      a restrained echo of the UAE flag in navy and teal. Pinned and
      scrubbed: the ribbons draw out and the headline rises word by word.
   3. Path cards: pointer spotlight + rising entrance
   4. What we look for: lines fitted to the column, filled on scroll
   5. How to register: the line draws down and lights each step
   6. FAQ accordion
   Light mode: both canvases switch to a daylight palette (normal blending,
   deep teal, navy and flag colours on a pale field) and repaint on the
   'saa:theme' event, reduced-motion still frames included.
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  /* colour mode (assets/js/theme.js); dark is the default and keeps the original palette */
  const isLight = () => !!window.SAATheme && window.SAATheme.get() === 'light';

  /* Shared render-loop helper: runs only while the canvas is on screen and the tab is visible */
  function loopWhileVisible(canvas, draw) {
    let visible = true, raf = 0;
    const T0 = performance.now();
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      draw((now - T0) / 1000);
      raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!raf && !REDUCE && visible && !document.hidden) raf = requestAnimationFrame(frame); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        visible = es[0].isIntersecting;
        if (visible) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { rootMargin: '80px 0px' }).observe(canvas);
    }
    document.addEventListener('visibilitychange', start);
    return { start, now: () => (performance.now() - T0) / 1000 };
  }

  function sizeCanvas(canvas, ctx, small) {
    const r = canvas.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { W, H };
  }

  /* resize helper that ignores mobile toolbar jitter */
  function onResize(canvas, fn) {
    let t = 0, lw = canvas.getBoundingClientRect().width, lh = canvas.getBoundingClientRect().height;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const r = canvas.getBoundingClientRect();
        if (Math.abs(r.width - lw) < 1 && Math.abs(r.height - lh) < 90) return;
        lw = r.width; lh = r.height; fn();
      }, 140);
    });
  }

  /* ---------------------------------------------------------------------
     1. HERO: rising light
     --------------------------------------------------------------------- */
  function riseField(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hero = canvas.parentElement;
    let W = 1, H = 1, lines = [], small = false;
    let mx = -1e4, tx = -1e4, spot = 0, spotT = 0;

    /* one pre-rendered pulse sprite: a vertical streak with a bright tip at the top */
    const spr = document.createElement('canvas'); spr.width = 8; spr.height = 256;
    const sc = spr.getContext('2d');
    const g = sc.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(242,255,253,0)'); g.addColorStop(.03, 'rgba(242,255,253,1)');
    g.addColorStop(.12, 'rgba(94,214,204,.85)'); g.addColorStop(1, 'rgba(0,161,155,0)');
    sc.fillStyle = g; sc.fillRect(2, 0, 4, 256);
    /* daylight sprite: a deep teal tip fading to brand teal, drawn with normal blending */
    const sprL = document.createElement('canvas'); sprL.width = 8; sprL.height = 256;
    const scL = sprL.getContext('2d');
    const gL = scL.createLinearGradient(0, 0, 0, 256);
    gL.addColorStop(0, 'rgba(4,110,104,0)'); gL.addColorStop(.03, 'rgba(4,110,104,1)');
    gL.addColorStop(.12, 'rgba(0,161,155,.8)'); gL.addColorStop(1, 'rgba(0,161,155,0)');
    scL.fillStyle = gL; scL.fillRect(2, 0, 4, 256);

    function rnd(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
    function resize() {
      small = innerWidth < 700;
      ({ W, H } = sizeCanvas(canvas, ctx, small));
      const S = small ? 22 : 28;
      const n = Math.ceil(W / S) + 1;
      lines = [];
      for (let i = 0; i < n; i++) {
        const x = Math.round(i * S + S * .5) + .5;
        const pulses = [];
        for (let k = 0; k < 2; k++) pulses.push({ v: 26 + 70 * rnd(i, k), L: 50 + 150 * rnd(i, k + 7), ph: rnd(i, k + 3) * 4000 });
        lines.push({ x, pulses, a: .5 + .5 * rnd(i, 9) });
      }
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      mx += (tx - mx) * .08; spot += (spotT - spot) * .05;
      const day = isLight();
      /* faint rails (navy hairlines in daylight) */
      ctx.globalCompositeOperation = 'source-over';
      const rail = ctx.createLinearGradient(0, 0, 0, H);
      if (day) { rail.addColorStop(0, 'rgba(11,37,69,0)'); rail.addColorStop(.55, 'rgba(11,37,69,.06)'); rail.addColorStop(1, 'rgba(11,37,69,.12)'); }
      else { rail.addColorStop(0, 'rgba(94,214,204,0)'); rail.addColorStop(.55, 'rgba(94,214,204,.05)'); rail.addColorStop(1, 'rgba(94,214,204,.1)'); }
      ctx.strokeStyle = rail; ctx.lineWidth = 1; ctx.beginPath();
      for (const l of lines) { ctx.moveTo(l.x, 0); ctx.lineTo(l.x, H); }
      ctx.stroke();
      /* pulses: brighter toward the right, and around the pointer (added light on navy, plain ink in daylight) */
      ctx.globalCompositeOperation = day ? 'source-over' : 'lighter';
      const pulse = day ? sprL : spr;
      for (const l of lines) {
        const nx = l.x / W;
        let env = .12 + .88 * sstep(.18, .92, nx);
        if (spot > .01) env += spot * .9 * Math.exp(-Math.pow((l.x - mx) / 150, 2));
        env *= l.a;
        if (env < .02) continue;
        for (const p of l.pulses) {
          const span = H + p.L;
          const y = H - ((t * p.v + p.ph) % span);
          const fade = sstep(0, H * .35, y) * (.35 + .65 * sstep(0, H, y));
          const a = Math.min(.9, env * fade * .75);
          if (a < .01) continue;
          ctx.globalAlpha = a;
          ctx.drawImage(pulse, l.x - 2, y, 4, p.L);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    resize(); draw(12);
    const loop = loopWhileVisible(canvas, draw);
    onResize(canvas, () => { resize(); draw(loop.now() + 12); });
    document.addEventListener('saa:theme', () => draw(REDUCE ? 12 : loop.now() + 12));
    if (FINE && !REDUCE) {
      hero.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); tx = e.clientX - r.left; if (spotT === 0) mx = tx; spotT = 1; });
      hero.addEventListener('pointerleave', () => { spotT = 0; });
    }
    loop.start();
  }

  /* ---------------------------------------------------------------------
     2. SIGNATURE: Emiratisation ribbons
     --------------------------------------------------------------------- */
  function ribbonField(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const stage = canvas.parentElement;
    let W = 1, H = 1, small = false, STEP = 8, cols = 0, xs = null;
    let progress = 1;                     // 0..1 scroll reveal
    let mx = -1e4, my = -1e4, tx = -1e4, ty = -1e4, lift = 0, liftT = 0;

    /* flag colours, kept thin and low in alpha so they sit inside the navy and teal palette */
    const TEAL = [25, 194, 184], TEAL3 = [94, 214, 204];
    const BANDS = [
      { yc: .27, yp: .17, w: .11, wp: .07, core: [0, 115, 47], edge: TEAL, a: .58, ph: 0.0, sp: 1.0, delay: .14 },          // green
      { yc: .52, yp: .53, w: .095, wp: .06, core: [234, 241, 243], edge: TEAL3, a: .24, ph: 2.1, sp: .85, delay: .22 },     // white
      { yc: .77, yp: .86, w: .12, wp: .075, core: [0, 0, 0], edge: TEAL3, a: .6, ph: 4.2, sp: 1.15, delay: .30, dark: true } // black
    ];
    /* light motes that travel along each band */
    const MOTES = BANDS.map((b, i) => Array.from({ length: 8 }, (_, k) => ({
      s: ((k * .618 + i * .29) % 1), v: .018 + .02 * ((k * 37 + i * 11) % 7) / 7, u: (((k * 53 + i * 17) % 11) / 10 - .5) * .9, z: .6 + .8 * (((k * 29 + i) % 5) / 4)
    })));
    const RED = [255, 0, 0];
    /* daylight palette: on a pale field nothing can be lit by adding light, so the bands are drawn with
       normal blending in deeper colours. Green stays flag green, the white band turns to pearl strands
       with navy-grey rims, the black band to navy silk with teal rims, and the hoist to a deeper red. */
    const DAY = {
      bands: [{ core: [0, 115, 47], edge: [0, 128, 120], a: .72 }, { core: [255, 255, 255], edge: [58, 88, 120], a: .62 }, { core: [9, 27, 52], edge: [0, 150, 144], a: .46 }],
      motes: [[0, 115, 47], [58, 88, 120], [0, 150, 144]],
      red: [200, 16, 46], redGlow: [214, 40, 56]
    };
    let hx = 0, center = [], width = [];

    /* soft glow sprite for the travelling heads */
    const glow = document.createElement('canvas'); glow.width = glow.height = 128;
    const gc = glow.getContext('2d');
    const rg = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.18, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    gc.fillStyle = rg; gc.fillRect(0, 0, 128, 128);
    const tinted = {};
    function tintGlow(rgb) {
      const k = rgb.join(',');
      if (tinted[k]) return tinted[k];
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      x.drawImage(glow, 0, 0); x.globalCompositeOperation = 'source-in';
      x.fillStyle = 'rgb(' + k + ')'; x.fillRect(0, 0, 128, 128);
      return (tinted[k] = c);
    }

    function resize() {
      small = innerWidth < 700;
      ({ W, H } = sizeCanvas(canvas, ctx, small));
      STEP = small ? 9 : 8;
      cols = Math.ceil(W / STEP) + 2;
      xs = new Float32Array(cols);
      for (let c = 0; c < cols; c++) xs[c] = c * STEP - STEP;
      center = BANDS.map(() => new Float32Array(cols));
      width = BANDS.map(() => new Float32Array(cols));
      hx = Math.round(Math.max(7, Math.min(56, Math.max(16, W * .04)) * .5));   // in the page gutter, beside the type
    }
    const N = () => small ? 14 : 24;

    function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')'; }

    function draw(t) {
      const n = N();
      const pr = easeIO(clamp(progress / .3));           // red hoist draws first
      mx += (tx - mx) * .07; my += (ty - my) * .07; lift += (liftT - lift) * .05;

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      const day = isLight(), pal = day ? DAY.bands : BANDS;

      /* backdrop haze: gives the dark band something to sit against (a soft teal-grey cloud in daylight,
         so the pearl strands of the white band have a shade to read against) */
      const haze = .55 + .45 * easeOut(clamp(progress / .6));
      let g = ctx.createRadialGradient(W * .68, H * .64, 0, W * .68, H * .64, Math.max(W, H) * .62);
      if (day) { g.addColorStop(0, 'rgba(0,161,155,' + (.12 * haze).toFixed(3) + ')'); g.addColorStop(.55, 'rgba(11,37,69,' + (.08 * haze).toFixed(3) + ')'); g.addColorStop(1, 'rgba(11,37,69,0)'); }
      else { g.addColorStop(0, 'rgba(0,161,155,' + (.17 * haze).toFixed(3) + ')'); g.addColorStop(.55, 'rgba(11,37,69,' + (.32 * haze).toFixed(3) + ')'); g.addColorStop(1, 'rgba(2,10,22,0)'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      g = ctx.createRadialGradient(W * .2, H * .28, 0, W * .2, H * .28, Math.max(W, H) * .45);
      g.addColorStop(0, 'rgba(0,115,47,' + ((day ? .07 : .09) * haze).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,115,47,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      /* ribbon centre lines and widths for this frame */
      const reach = BANDS.map(b => {
        const p = easeIO(clamp((progress - b.delay) / .5));
        return { p, x: hx + (W - hx + 60) * p };
      });
      BANDS.forEach((b, i) => {
        const C = center[i], Wd = width[i];
        for (let c = 0; c < cols; c++) {
          const x = xs[c], nx = x / W;
          const tw = sstep(hx, hx + W * .2, x);          // ribbons are born thin at the hoist
          const y0 = H * (small ? b.yp : b.yc), am = small ? .62 : 1;
          let y = y0 + H * am * (.085 * Math.sin(nx * 2.3 + t * .22 * b.sp + b.ph) + .036 * Math.sin(nx * 5.4 - t * .37 * b.sp + b.ph * 1.7));
          y = lerp(y0, y, tw);
          C[c] = y;
          const w = H * (small ? b.wp : b.w) * (.86 * Math.sin(nx * 3.2 + t * .3 * b.sp + b.ph * 2.3) + .14 * Math.sin(nx * 8.1 - t * .5 + b.ph));
          Wd[c] = w * (.06 + .94 * tw);
        }
      });

      const bulge = lift > .01;
      function strandPath(i, u, k, xEnd, dark) {
        const C = center[i], Wd = width[i];
        ctx.beginPath();
        let started = false;
        for (let c = 0; c < cols; c++) {
          const x = xs[c];
          if (x < hx) continue;
          if (x > xEnd) break;
          let y = C[c] + u * Wd[c] + Math.sin(x * .011 + k * .9 + t * .6) * H * .0035;
          if (bulge) {
            const dx = (x - mx) / 190;
            if (dx > -3 && dx < 3) y += lift * 40 * Math.exp(-dx * dx) * Math.tanh((y - my) / 60) * Math.exp(-Math.pow((y - my) / 220, 2));
          }
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        return started;
      }

      /* the black band: dark silk that occludes the haze */
      const KI = 2, kb = pal[KI], kr = reach[KI];
      if (kr.p > 0) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = small ? 2.4 : 2.8;
        /* daylight: navy silk would show along its whole length, so (as at night, where it only reads against
           the haze) it fades in past the text column, and its tip feathers out while it draws */
        let silk = null;
        if (day) {
          const x0 = W * .42, x1 = W * .68, tip = kr.p < 1 ? 140 : 0;
          const fa = x => kb.a * clamp((x - x0) / (x1 - x0)) * (tip ? clamp((kr.x - x) / tip) : 1);
          silk = ctx.createLinearGradient(0, 0, W, 0);
          [0, x0, (x0 + x1) / 2, x1, kr.x - tip, kr.x - tip / 2, kr.x, W].filter(x => x >= 0 && x <= W).sort((a, b) => a - b)
            .forEach(x => silk.addColorStop(x / W, rgba(kb.core, fa(x))));
        }
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1) - .5, f = .5 + .5 * (1 - Math.abs(u) * 2);
          if (!strandPath(KI, u, k, kr.x)) continue;
          if (silk) { ctx.globalAlpha = f; ctx.strokeStyle = silk; } else ctx.strokeStyle = rgba(kb.core, kb.a * f);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      /* light bands, added together so crossings glow (plain strokes in daylight) */
      ctx.globalCompositeOperation = day ? 'source-over' : 'lighter';
      BANDS.forEach((b, i) => {
        const r = reach[i], pb = pal[i];
        if (r.p <= 0) return;
        for (let k = 0; k < n; k++) {
          const u = k / (n - 1) - .5, edge = Math.abs(u) * 2;
          let col, a;
          if (b.dark) {
            if (k !== 0 && k !== n - 1 && k !== (n >> 1)) continue;     // only the rims of the dark band catch light
            col = pb.edge; a = (k === (n >> 1) ? .07 : .2) * (day ? 2.4 : 1);
          } else {
            const m = clamp(1 - edge * 1.15);
            col = [lerp(pb.edge[0], pb.core[0], m), lerp(pb.edge[1], pb.core[1], m), lerp(pb.edge[2], pb.core[2], m)];
            a = pb.a * (.35 + .65 * (1 - edge * .6)) * (i === 0 ? 1 : .9);
          }
          if (!strandPath(i, u, k, r.x)) continue;
          ctx.lineWidth = 1;
          if (day && b.dark && r.p < 1) {       // daylight: the rims feather out at the tip with the navy silk
            const tg = ctx.createLinearGradient(r.x - 140, 0, r.x, 0);
            tg.addColorStop(0, rgba(col, a)); tg.addColorStop(1, rgba(col, 0));
            ctx.strokeStyle = tg;
          } else ctx.strokeStyle = rgba(col, a);
          ctx.stroke();
          /* a soft bloom on every few strands */
          if (!small && k % 4 === 1 && !b.dark) { ctx.lineWidth = 5; ctx.strokeStyle = rgba(col, a * .1); ctx.stroke(); }
        }
        /* travelling head while drawing out */
        if (r.p < 1) {
          const c = Math.max(0, Math.min(cols - 1, Math.round((r.x + STEP) / STEP)));
          const hy = center[i][c];
          const s = small ? 90 : 150;
          ctx.globalAlpha = (day ? .35 : .55) * Math.sin(Math.PI * Math.min(1, r.p * 1.2));
          ctx.drawImage(tintGlow(day ? pb.edge : b.dark ? TEAL3 : b.edge), r.x - s / 2, hy - s / 2, s, s);
          ctx.globalAlpha = 1;
        }
        /* motes drifting along the band */
        const spr = tintGlow(day ? DAY.motes[i] : b.dark ? TEAL3 : i === 1 ? [242, 255, 253] : [60, 200, 140]);
        for (const m of MOTES[i]) {
          if (small && m.z < 1) continue;
          const f = (m.s + t * m.v) % 1;
          const x = hx + (W - hx) * f;
          if (x > r.x) continue;
          const c = Math.max(0, Math.min(cols - 1, Math.round((x + STEP) / STEP)));
          const y = center[i][c] + m.u * width[i][c];
          const s = (small ? 16 : 22) * m.z;
          ctx.globalAlpha = .55 * Math.sin(Math.PI * f) * (b.dark ? .6 : 1);
          ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      });

      /* the red hoist: a thin vertical ribbon at the left edge */
      if (pr > 0) {
        const yEnd = H * pr, rn = small ? 4 : 6;
        for (let k = 0; k < rn; k++) {
          const u = k / (rn - 1) - .5;
          ctx.beginPath();
          for (let y = 0; y <= yEnd; y += 10) {
            const ny = y / H;
            const w = (small ? 7 : 11) * Math.sin(ny * 4.1 + t * .4 + k * .15);
            const x = hx + u * w + 2.2 * Math.sin(ny * 9 + t * .7 + k);
            y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.lineWidth = 1;
          ctx.strokeStyle = day ? rgba(DAY.red, .5 + .2 * (1 - Math.abs(u) * 2)) : rgba(RED, .3 + .14 * (1 - Math.abs(u) * 2));
          ctx.stroke();
          if (k === (rn >> 1)) { ctx.lineWidth = 7; ctx.strokeStyle = day ? rgba(DAY.red, .07) : rgba(RED, .045); ctx.stroke(); }
        }
        if (pr < 1) {
          ctx.globalAlpha = day ? .35 : .5;
          ctx.drawImage(tintGlow(day ? DAY.redGlow : [255, 70, 70]), hx - 60, yEnd - 60, 120, 120);
          ctx.globalAlpha = 1;
        }
        /* where the bands meet the hoist, a small knot of light */
        BANDS.forEach((b, i) => {
          if (reach[i].p <= 0) return;
          const y = H * (small ? b.yp : b.yc);
          if (y > yEnd) return;
          ctx.globalAlpha = .35 * Math.min(1, reach[i].p * 4);
          ctx.drawImage(tintGlow(day ? (b.dark ? DAY.redGlow : pal[i].edge) : b.dark ? [255, 90, 90] : b.edge), hx - 26, y - 26, 52, 52);
        });
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    resize();
    draw(20);
    const loop = loopWhileVisible(canvas, t => draw(t + 20));
    onResize(canvas, () => { resize(); draw(loop.now() + 20); });
    document.addEventListener('saa:theme', () => draw(REDUCE ? 20 : loop.now() + 20));
    if (FINE && !REDUCE) {
      stage.addEventListener('pointermove', e => {
        const r = canvas.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top;
        if (liftT === 0) { mx = tx; my = ty; } liftT = 1;
      });
      stage.addEventListener('pointerleave', () => { liftT = 0; });
    }
    loop.start();
    return {
      set(p) { progress = clamp(p); if (REDUCE) draw(20); },
      get progress() { return progress; },
      redraw() { draw(loop.now() + 20); }
    };
  }

  /* ---------------------------------------------------------------------
     Build visuals that do not depend on GSAP
     --------------------------------------------------------------------- */
  const riseCanvas = document.getElementById('riseField');
  if (riseCanvas) riseField(riseCanvas);

  const emiScene = document.querySelector('.emi-scene');
  const ribbonCanvas = document.getElementById('ribbons');
  let ribbons = null;
  try { ribbons = ribbonCanvas ? ribbonField(ribbonCanvas) : null; } catch (err) { ribbons = null; }
  if (emiScene && !ribbons) emiScene.classList.add('no-canvas');

  /* the shared CTA band renders an internal-style link; this one leaves the site */
  document.querySelectorAll('.cta-band a.btn[href^="http"]').forEach(a => {
    a.target = '_blank'; a.rel = 'noopener';
    if (!a.querySelector('.sr-only')) a.insertAdjacentHTML('beforeend', '<span class="sr-only"> (opens in a new tab)</span>');
    const arr = a.querySelector('.arr path');
    if (arr) arr.setAttribute('d', 'M7 17L17 7M9 7h8v8');
  });

  /* ---------------------------------------------------------------------
     6. FAQ accordion (works without GSAP)
     --------------------------------------------------------------------- */
  const acc = document.querySelector('[data-acc]');
  if (acc) {
    acc.classList.add('is-js');
    const items = [...acc.querySelectorAll('.acc-item')];
    const setOpen = (item, open) => {
      item.classList.toggle('open', open);
      const btn = item.querySelector('.acc-btn'), panel = item.querySelector('.acc-panel');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');
    };
    items.forEach((it, i) => setOpen(it, i === 0));
    items.forEach(it => {
      it.querySelector('.acc-btn').addEventListener('click', () => {
        setOpen(it, !it.classList.contains('open'));
        const ST = window.ScrollTrigger;
        if (ST) setTimeout(() => ST.refresh(), REDUCE ? 20 : 650);
      });
    });
  }

  /* the step rail runs from the first node to the last one */
  const stepsWrap = document.querySelector('.steps-wrap');
  function fitRail() {
    if (!stepsWrap) return;
    const rail = stepsWrap.querySelector('.steps-rail');
    const nodes = stepsWrap.querySelectorAll('.step-node');
    if (!rail || nodes.length < 2) return;
    const wr = stepsWrap.getBoundingClientRect();
    const a = nodes[0].getBoundingClientRect(), b = nodes[nodes.length - 1].getBoundingClientRect();
    rail.style.top = (a.top + a.height / 2 - wr.top).toFixed(1) + 'px';
    rail.style.bottom = (wr.bottom - (b.top + b.height / 2)).toFixed(1) + 'px';
  }
  fitRail();
  addEventListener('resize', () => setTimeout(fitRail, 150));

  /* ---------------------------------------------------------------------
     4a. Fit the "what we look for" lines to the column
     --------------------------------------------------------------------- */
  const lookWords = [...document.querySelectorAll('.look-w')];
  function fitLook() {
    const list = document.querySelector('.look-list');
    if (!list || !lookWords.length) return;
    const avail = list.clientWidth * .995;
    const cap = innerWidth < 700 ? 92 : 230;
    lookWords.forEach(w => { w.classList.remove('is-fit'); w.classList.add('is-measure'); });
    const nat = lookWords.map(w => w.getBoundingClientRect().width);
    lookWords.forEach((w, i) => {
      w.classList.remove('is-measure');
      if (nat[i] > 0) { w.style.fontSize = Math.min(cap, avail / nat[i] * 100).toFixed(2) + 'px'; w.classList.add('is-fit'); }
    });
  }
  fitLook();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitLook(); fitRail(); window.ScrollTrigger && window.ScrollTrigger.refresh(); });
  let fitT = 0, fitW = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(fitT);
    fitT = setTimeout(() => { if (Math.abs(innerWidth - fitW) < 1) return; fitW = innerWidth; fitLook(); }, 120);
  });

  /* ---------------------------------------------------------------------
     Motion (after the shared preloader and Lenis are ready)
     --------------------------------------------------------------------- */
  if (!window.SAA) return;
  window.SAA.ready(({ gsap, ScrollTrigger, reduce }) => {
    if (!ScrollTrigger) return;
    const mm = gsap.matchMedia();

    /* --- hero entrance + depth --- */
    const hero = document.querySelector('.careers-hero');
    if (hero && !reduce) {
      gsap.from(['.ch-lead', '.ch-actions .btn', '.ch-cue'], { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .08, delay: .45, clearProps: 'opacity,transform' });
      gsap.to('#riseField', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.ch-wrap', { yPercent: -12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }

    /* --- signature: Emiratisation ribbons --- */
    if (emiScene && !reduce) {
      const words = emiScene.querySelectorAll('.emi-w');
      const eyebrow = emiScene.querySelector('.emi-eyebrow');
      const foot = emiScene.querySelectorAll('.emi-lead, .emi-btn');
      const corner = emiScene.querySelector('.emi-corner');
      const proxy = { p: ribbons ? 0 : 1 };
      const push = () => { if (ribbons) ribbons.set(proxy.p); };

      mm.add({ tall: '(min-height: 560px)', short: '(max-height: 559px)' }, c => {
        if (c.conditions.tall) {
          /* the headline rises as the scene arrives, then the pin finishes the ribbons and the lead */
          emiScene.classList.add('is-live');
          proxy.p = ribbons ? 0 : 1; push();
          const intro = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: emiScene, start: 'top 85%', end: 'top top', scrub: .8, invalidateOnRefresh: true }
          });
          intro.to(proxy, { p: ribbons ? .45 : 1, duration: 1, onUpdate: push }, 0)
            .fromTo(eyebrow, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .25, ease: 'power2.out' }, .15)
            .fromTo(words, { yPercent: 135, rotate: 4 }, { yPercent: 0, rotate: 0, duration: .4, ease: 'power3.out', stagger: .06 }, .3);
          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: emiScene, start: 'top top', end: () => '+=' + Math.round(innerHeight * (innerWidth < 861 ? 1.1 : 1.3)),
              pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true
            }
          });
          tl.fromTo(proxy, { p: ribbons ? .45 : 1 }, { p: 1, duration: .66, onUpdate: push, immediateRender: false }, 0)
            .fromTo(foot, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: .16, ease: 'power2.out', stagger: .05 }, .06)
            .fromTo(corner, { opacity: 0 }, { opacity: 1, duration: .1 }, .3)
            .to({}, { duration: .2 });
          return () => {
            emiScene.classList.remove('is-live');
            gsap.set([eyebrow, ...words, ...foot, corner], { clearProps: 'all' });
          };
        }
        /* short screens: no pin, the ribbons draw out once as the scene arrives */
        proxy.p = ribbons ? 0 : 1; push();
        const tw = gsap.to(proxy, { p: 1, duration: 2.8, ease: 'none', onUpdate: push, scrollTrigger: { trigger: emiScene, start: 'top 75%', once: true } });
        gsap.from(words, { yPercent: 135, duration: 1.1, ease: 'expo.out', stagger: .06, scrollTrigger: { trigger: emiScene, start: 'top 60%', once: true } });
        return () => { tw.progress(1); };
      });
    }

    /* --- path cards: rise in, spotlight follows the pointer --- */
    const cards = [...document.querySelectorAll('.path-card')];
    if (cards.length && !reduce) {
      gsap.from(cards, { y: 120, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: .12, clearProps: 'opacity,transform',
        scrollTrigger: { trigger: '.path-grid', start: 'top 85%', once: true } });
      mm.add('(min-width: 961px)', () => {
        const items = gsap.utils.toArray('.path-item');
        items.forEach((it, i) => gsap.fromTo(it, { y: 30 * (2 - i) }, { y: -30 * (2 - i), ease: 'none',
          scrollTrigger: { trigger: '.path-grid', start: 'top bottom', end: 'bottom top', scrub: true } }));
      });
      /* the cursor label would vanish against the teal card: invert it there */
      const cv = document.querySelector('.pc-cv');
      if (cv && FINE) {
        cv.addEventListener('pointerenter', () => document.documentElement.classList.add('cursor-invert'));
        cv.addEventListener('pointerleave', () => document.documentElement.classList.remove('cursor-invert'));
      }
      if (FINE) cards.forEach(c => c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      }));
      cards.forEach(c => {
        const strokes = c.querySelectorAll('.pc-art path, .pc-art rect, .pc-art circle');
        gsap.from(strokes, { opacity: 0, scale: .7, transformOrigin: '50% 50%', duration: 1.1, ease: 'expo.out', stagger: .035, clearProps: 'opacity,transform',
          scrollTrigger: { trigger: c, start: 'top 80%', once: true } });
      });
    }

    /* --- what we look for: each line fills from left to right --- */
    if (!reduce) {
      document.querySelectorAll('.look-i').forEach(it => {
        const w = it.querySelector('.look-w');
        gsap.fromTo(w, { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: { trigger: it, start: 'top 88%', end: 'top 48%', scrub: .6 } });
        const k = it.querySelector('.look-k');
        if (k) gsap.from(k, { x: -30, opacity: 0, duration: 1, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: it, start: 'top 88%', once: true } });
      });
    }

    /* --- how to register: the line draws and lights each step --- */
    const sw = document.querySelector('.steps-wrap');
    if (sw && !reduce) {
      const steps = [...sw.querySelectorAll('.step')];
      const rail = sw.querySelector('.steps-rail');
      let nodeY = [], railTop = 0, railH = 1;
      const measure = () => {
        fitRail();
        const wr = sw.getBoundingClientRect(), rr = rail.getBoundingClientRect();
        railTop = rr.top - wr.top; railH = Math.max(1, rr.height);
        nodeY = steps.map(s => { const n = s.querySelector('.step-node').getBoundingClientRect(); return n.top + n.height / 2 - wr.top; });
      };
      const paint = p => {
        sw.style.setProperty('--rp', p.toFixed(4));
        const head = railTop + p * railH;
        steps.forEach((s, i) => s.classList.toggle('on', head >= nodeY[i] - 2));
      };
      sw.classList.add('is-live');
      measure(); paint(0);
      ScrollTrigger.addEventListener('refreshInit', fitRail);
      ScrollTrigger.create({
        trigger: rail, start: 'top 62%', end: 'bottom 62%', scrub: .5,
        onUpdate: st => paint(st.progress), onRefresh: st => { measure(); paint(st.progress); }
      });
      steps.forEach(s => gsap.from(s.querySelectorAll('.step-part, .step-title, .step-text'), {
        y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .07, clearProps: 'opacity,transform',
        scrollTrigger: { trigger: s, start: 'top 82%', once: true }
      }));
    }

    /* pins created here must refresh before the shared reveals below them */
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
  });
})();
