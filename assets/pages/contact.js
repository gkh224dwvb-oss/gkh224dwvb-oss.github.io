/* =========================================================================
   CONTACT page
   1. Abu Dhabi clock (hero meta)
   2. Signature: radar locator on a 2D canvas. Dot-matrix field, sweeping
      arm with phosphor trail, concentric pulses from the SAA marker, lock-on
      brackets. Static layers are cached; paused off-screen; still frame
      for reduced motion.
   3. Coordinate readout that ticks in like an instrument
   4. Copy buttons (Clipboard API, falls back to selecting the text)
   5. Enquiry form: role chips, contextual hints, mailto composer
   6. Scroll choreography via SAA.ready
   Light mode: the radar has a daylight palette (deep teal and navy ink on a
   pale panel; it never relied on additive blending) and repaints, cached
   base layer and reduced-motion still frame included, on 'saa:theme'.
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TAU = Math.PI * 2;
  const EMAIL = 'saaest@eim.ae';
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = x => 1 - Math.pow(1 - x, 3);
  /* colour mode (assets/js/theme.js); dark is the default and keeps the original palette */
  const isLight = () => !!window.SAATheme && window.SAATheme.get() === 'light';

  /* ---------------------------------------------------------------------
     1. ABU DHABI CLOCK (GST, UTC+4)
     --------------------------------------------------------------------- */
  const clocks = [...document.querySelectorAll('[data-clock]')];
  if (clocks.length) {
    let fmt = null;
    try { fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch (_) { fmt = null; }
    const pad = n => String(n).padStart(2, '0');
    const tick = () => {
      let s;
      if (fmt) s = fmt.format(new Date());
      else { const d = new Date(Date.now() + 4 * 3600e3); s = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); }
      for (const c of clocks) c.textContent = s;
    };
    tick(); setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------------------
     3. COORDINATE READOUT (defined first: the radar triggers it)
     --------------------------------------------------------------------- */
  function makeReadout(root) {
    const digits = [];
    root.querySelectorAll('.coord-v').forEach((el, line) => {
      const fin = el.dataset.final || el.textContent.trim();
      el.textContent = '';
      for (const ch of fin) {
        const s = document.createElement('span');
        if (/\d/.test(ch)) {
          s.className = REDUCE ? 'd' : 'd idle';
          s.textContent = REDUCE ? ch : '0';
          digits.push({ el: s, ch, line, done: false, at: 0 });
        } else { s.className = 'p'; s.textContent = ch; }
        el.appendChild(s);
      }
    });
    let ran = false;
    return {
      run(done) {
        if (ran) return; ran = true;
        if (REDUCE || !digits.length) { digits.forEach(d => { d.el.textContent = d.ch; d.el.className = 'd'; }); done && done(); return; }
        digits.forEach((d, i) => { d.at = 260 + i * 68 + d.line * 140; d.el.className = 'd spin'; });
        const t0 = performance.now();
        let last = 0;
        const step = now => {
          const e = now - t0, swap = now - last > 46;
          if (swap) last = now;
          let left = 0;
          for (const d of digits) {
            if (d.done) continue;
            if (e >= d.at) {
              d.done = true; d.el.textContent = d.ch; d.el.className = 'd set';
              setTimeout(() => { d.el.className = 'd'; }, 650);
            } else {
              left++;
              if (swap) d.el.textContent = String((Math.random() * 10) | 0);
            }
          }
          if (left) requestAnimationFrame(step); else if (done) done();
        };
        requestAnimationFrame(step);
      }
    };
  }

  /* ---------------------------------------------------------------------
     2. RADAR LOCATOR
     --------------------------------------------------------------------- */
  function radar(panel, onLock) {
    const canvas = panel.querySelector('.loc-canvas');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) { onLock(); return; }
    const scope = panel.querySelector('.loc-scope');
    const tag = panel.querySelector('.loc-tag');
    const tagBox = tag && tag.querySelector('.loc-tag-box');
    const base = document.createElement('canvas');
    const bctx = base.getContext('2d');

    const PERIOD = 5.6;          // seconds per sweep
    const PULSE = 2.9;           // seconds per pulse cycle
    const TRAIL = 1.25;          // radians of phosphor trail
    const M_ANG = -0.9;          // marker bearing from the scope centre (up and right)
    const TH0 = M_ANG + 0.9;     // sweep starts just past the marker
    const T0 = performance.now();

    /* palettes. Dark: the original phosphor teal on navy. Light: a daylight instrument, with deep teal line
       work, navy ink for the marker and brackets, and lit dots that darken (rather than brighten) */
    const PALETTES = {
      dark: {
        dot: f => 'rgba(98,184,218,' + (.07 + .22 * f * f).toFixed(3) + ')',
        disc: ['rgba(27,113,148,.11)', 'rgba(27,113,148,.04)', 'rgba(27,113,148,.08)'],
        cross: 'rgba(98,184,218,.17)', diag: 'rgba(98,184,218,.12)', ring: 'rgba(98,184,218,.15)', bezel: 'rgba(98,184,218,.45)',
        ticks: ['rgba(98,184,218,.6)', 'rgba(98,184,218,.34)', 'rgba(98,184,218,.17)'],
        label: 'rgba(147,168,188,.8)', hub: 'rgba(98,184,218,.7)',
        sweep: ['rgba(27,113,148,0)', 'rgba(27,113,148,.06)', 'rgba(46,141,181,.22)', 'rgba(98,184,218,.32)'], wedge: ['46,141,181', .26],
        lit: m => 'rgba(' + Math.round(98 + 138 * m * m) + ',' + Math.round(184 + 63 * m) + ',' + Math.round(218 + 33 * m) + ',' + (.18 + .8 * m).toFixed(3) + ')',
        edge: ['rgba(98,184,218,.08)', 'rgba(223,243,248,.95)'], pulse: ['98,184,218', .5], bearing: ['98,184,218', .5],
        glow: [['179,224,239', .8], ['27,113,148', .38]], blip: '244,251,253', blipMin: .3, lockRing: '98,184,218', brackets: '223,243,248'
      },
      light: {
        dot: f => 'rgba(25,46,73,' + (.1 + .24 * f * f).toFixed(3) + ')',
        disc: ['rgba(27,113,148,.12)', 'rgba(27,113,148,.04)', 'rgba(27,113,148,.1)'],
        cross: 'rgba(21,95,128,.24)', diag: 'rgba(21,95,128,.18)', ring: 'rgba(21,95,128,.2)', bezel: 'rgba(21,95,128,.6)',
        ticks: ['rgba(21,95,128,.75)', 'rgba(21,95,128,.45)', 'rgba(21,95,128,.24)'],
        label: 'rgba(70,96,122,.95)', hub: 'rgba(21,95,128,.85)',
        sweep: ['rgba(27,113,148,0)', 'rgba(27,113,148,.07)', 'rgba(27,113,148,.2)', 'rgba(27,113,148,.32)'], wedge: ['27,113,148', .26],
        lit: m => 'rgba(' + Math.round(27 - 11 * m) + ',' + Math.round(113 - 58 * m) + ',' + Math.round(148 - 64 * m) + ',' + (.24 + .74 * m).toFixed(3) + ')',
        edge: ['rgba(27,113,148,.1)', 'rgba(21,95,128,.95)'], pulse: ['27,113,148', .62], bearing: ['21,95,128', .6],
        glow: [['27,113,148', .5], ['27,113,148', .2]], blip: '25,46,73', blipMin: .45, lockRing: '27,113,148', brackets: '25,46,73'
      }
    };
    let P = isLight() ? PALETTES.light : PALETTES.dark;

    let W = 1, H = 1, dpr = 1, cx = 0, cy = 0, R = 100, mx = 0, my = 0, S = 22, small = false, PRMAX = 300;
    let N = 0, DX, DY, DA, DR, DM, BK;
    let visible = !('IntersectionObserver' in window), raf = 0, lockAt = -1, tNow = 0;
    let px = -9999, py = -9999, pAmt = 0, pTarget = 0;

    function layout() {
      const pr = panel.getBoundingClientRect(), sr = scope.getBoundingClientRect();
      W = Math.max(1, pr.width); H = Math.max(1, pr.height);
      small = W < 700;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = base.width = Math.round(W * dpr);
      canvas.height = base.height = Math.round(H * dpr);
      cx = sr.left - pr.left + sr.width / 2;
      cy = sr.top - pr.top + sr.height / 2;
      R = Math.max(90, Math.min(sr.width, sr.height) / 2 - (small ? 34 : 36));
      const md = R * .5;
      mx = cx + Math.cos(M_ANG) * md; my = cy + Math.sin(M_ANG) * md;
      PRMAX = R * (small ? 1.5 : 1.35);
      S = small ? 18 : 22;

      /* dot grid, anchored to the scope centre so rows line up with the crosshair */
      const ox = ((cx % S) + S) % S, oy = ((cy % S) + S) % S;
      const cols = Math.ceil((W - ox) / S) + 1, rows = Math.ceil((H - oy) / S) + 1;
      N = cols * rows;
      DX = new Float32Array(N); DY = new Float32Array(N); DA = new Float32Array(N);
      DR = new Float32Array(N); DM = new Float32Array(N); BK = new Uint8Array(N);
      let i = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
        const x = ox + c * S, y = oy + r * S, dx = x - cx, dy = y - cy;
        DX[i] = x; DY[i] = y;
        DA[i] = (Math.atan2(dy, dx) + TAU) % TAU;
        DR[i] = Math.sqrt(dx * dx + dy * dy);
        DM[i] = Math.hypot(x - mx, y - my);
      }
      drawBase();
      placeTag();
    }

    /* static layer: dot matrix, scope disc, crosshair, range rings, bezel */
    function drawBase() {
      const b = bctx;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.clearRect(0, 0, W, H);

      const NB = 6, paths = [];
      for (let k = 0; k < NB; k++) paths.push(new Path2D());
      for (let i = 0; i < N; i++) {
        const f = clamp(1 - DR[i] / (R * 2.2));
        paths[Math.min(NB - 1, Math.floor(f * NB))].rect(DX[i] - .75, DY[i] - .75, 1.5, 1.5);
      }
      paths.forEach((p, k) => { const f = (k + .5) / NB; b.fillStyle = P.dot(f); b.fill(p); });

      const g = b.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, P.disc[0]); g.addColorStop(.75, P.disc[1]); g.addColorStop(1, P.disc[2]);
      b.fillStyle = g; b.beginPath(); b.arc(cx, cy, R, 0, TAU); b.fill();

      b.lineWidth = 1;
      b.strokeStyle = P.cross;
      b.beginPath(); b.moveTo(cx - R, cy); b.lineTo(cx + R, cy); b.moveTo(cx, cy - R); b.lineTo(cx, cy + R); b.stroke();
      const d = R * Math.SQRT1_2;
      b.setLineDash([2, 6]); b.strokeStyle = P.diag;
      b.beginPath(); b.moveTo(cx - d, cy - d); b.lineTo(cx + d, cy + d); b.moveTo(cx + d, cy - d); b.lineTo(cx - d, cy + d); b.stroke();
      b.setLineDash([]);

      b.strokeStyle = P.ring;
      b.beginPath();
      for (const f of [.25, .5, .75]) { b.moveTo(cx + R * f, cy); b.arc(cx, cy, R * f, 0, TAU); }
      b.stroke();
      b.strokeStyle = P.bezel; b.lineWidth = 1.2;
      b.beginPath(); b.arc(cx, cy, R, 0, TAU); b.stroke();

      const tk = [new Path2D(), new Path2D(), new Path2D()];
      for (let deg = 0; deg < 360; deg += 2) {
        const a = deg * Math.PI / 180 - Math.PI / 2, lvl = deg % 30 === 0 ? 0 : deg % 10 === 0 ? 1 : 2;
        const len = [11, 7, 3.5][lvl], c = Math.cos(a), s = Math.sin(a);
        tk[lvl].moveTo(cx + c * (R + 4), cy + s * (R + 4)); tk[lvl].lineTo(cx + c * (R + 4 + len), cy + s * (R + 4 + len));
      }
      [[P.ticks[0], 1.3], [P.ticks[1], 1], [P.ticks[2], 1]].forEach(([col, lw], k) => { b.strokeStyle = col; b.lineWidth = lw; b.stroke(tk[k]); });

      b.font = '500 ' + (small ? 9 : 10) + 'px "IBM Plex Mono", ui-monospace, monospace';
      b.fillStyle = P.label; b.textAlign = 'center'; b.textBaseline = 'middle';
      const step = small ? 90 : 30, lr = R + (small ? 25 : 30);
      for (let deg = 0; deg < 360; deg += step) {
        const a = deg * Math.PI / 180 - Math.PI / 2;
        b.fillText(String(deg).padStart(3, '0'), cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
      }
      b.fillStyle = P.hub;
      b.beginPath(); b.arc(cx, cy, 2.5, 0, TAU); b.fill();
    }

    function placeTag() {
      if (!tag || !tagBox) return;
      tag.style.transform = 'translate(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px)';
      const bw = tagBox.offsetWidth || 200;
      let side = 'right';
      if (mx + 66 + bw > W - 44) side = (W >= 560 && mx - 66 - bw > 14) ? 'left' : 'top';
      tag.dataset.side = side;
      if (side === 'top') tag.style.setProperty('--bx', (clamp(mx - bw / 2, 14, W - 14 - bw) - mx).toFixed(1) + 'px');
    }

    function frame(t) {
      const L = lockAt < 0 ? 0 : easeOut(clamp((t - lockAt) / 1.4));
      const th = (t / PERIOD) * TAU + TH0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0, W, H);

      /* sweep wedge with phosphor falloff */
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      if (typeof ctx.createConicGradient === 'function') {
        const g = ctx.createConicGradient(th - TRAIL, cx, cy), f = TRAIL / TAU;
        g.addColorStop(0, P.sweep[0]);
        g.addColorStop(f * .55, P.sweep[1]);
        g.addColorStop(f * .96, P.sweep[2]);
        g.addColorStop(f, P.sweep[3]);
        g.addColorStop(f + .002, 'rgba(27,113,148,0)');
        g.addColorStop(1, 'rgba(27,113,148,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      } else {
        const n = 20;
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = 'rgba(' + P.wedge[0] + ',' + (P.wedge[1] * Math.pow(1 - k / n, 2)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, th - TRAIL * (k + 1) / n, th - TRAIL * k / n); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();

      /* pulses from the marker (only once it is locked) */
      const pr = [0, 0, 0], pa = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const ph = ((t / PULSE) + k / 3) % 1; pr[k] = ph * PRMAX; pa[k] = Math.pow(1 - ph, 1.5) * L; }

      /* lit dots: sweep trail + pulse fronts + pointer glow, batched by brightness */
      pAmt += (pTarget - pAmt) * .08;
      for (let i = 0; i < N; i++) {
        let a = 0;
        if (DR[i] < R) {
          let b = th - DA[i]; b -= Math.floor(b / TAU) * TAU;
          if (b < 2.6) a += .78 * Math.exp(-b / .5);
        }
        if (L > 0) for (let k = 0; k < 3; k++) {
          const dd = DM[i] - pr[k];
          if (dd > -18 && dd < 18) a += .7 * pa[k] * Math.exp(-dd * dd / 70);
        }
        if (pAmt > .02) {
          const dx = DX[i] - px, dy = DY[i] - py, q = dx * dx + dy * dy;
          if (q < 25600) { const f = 1 - Math.sqrt(q) / 160; a += .6 * pAmt * f * f; }
        }
        BK[i] = a > .05 ? Math.min(9, 1 + Math.floor(a * 9)) : 0;
      }
      for (let k = 1; k <= 9; k++) {
        const s = 1.5 + k * .17, h = s / 2;
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < N; i++) if (BK[i] === k) { ctx.rect(DX[i] - h, DY[i] - h, s, s); any = true; }
        if (!any) continue;
        ctx.fillStyle = P.lit(k / 9);
        ctx.fill();
      }

      /* leading edge of the sweep */
      const ex = cx + Math.cos(th) * R, ey = cy + Math.sin(th) * R;
      const lg = ctx.createLinearGradient(cx, cy, ex, ey);
      lg.addColorStop(0, P.edge[0]); lg.addColorStop(1, P.edge[1]);
      ctx.strokeStyle = lg; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = P.edge[1];
      ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, TAU); ctx.fill();

      if (L > 0) {
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          if (pa[k] < .01) continue;
          ctx.strokeStyle = 'rgba(' + P.pulse[0] + ',' + (P.pulse[1] * pa[k]).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(mx, my, Math.max(1, pr[k]), 0, TAU); ctx.stroke();
        }
        /* bearing line from the scope centre */
        ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 14;
        ctx.strokeStyle = 'rgba(' + P.bearing[0] + ',' + (P.bearing[1] * L).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (mx - cx) * L, cy + (my - cy) * L); ctx.stroke();
        ctx.setLineDash([]);
      }

      /* marker: faint blip until locked, flares as the sweep passes */
      let mb = th - M_ANG; mb -= Math.floor(mb / TAU) * TAU;
      const flare = Math.exp(-mb / .45);
      const vis = Math.max(L, .18 + flare * .82);
      const gr = 24 + 24 * flare + 8 * L;
      const gg = ctx.createRadialGradient(mx, my, 0, mx, my, gr);
      gg.addColorStop(0, 'rgba(' + P.glow[0][0] + ',' + (P.glow[0][1] * vis).toFixed(3) + ')');
      gg.addColorStop(.35, 'rgba(' + P.glow[1][0] + ',' + (P.glow[1][1] * vis).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(27,113,148,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(mx, my, gr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(' + P.blip + ',' + Math.max(P.blipMin, vis).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, TAU); ctx.fill();

      if (L > 0) {
        ctx.strokeStyle = 'rgba(' + P.lockRing + ',' + (.9 * L).toFixed(3) + ')'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(mx, my, 10 + 1.5 * Math.sin(t * 3), 0, TAU); ctx.stroke();
        /* lock-on brackets close in */
        const s = 19 + 72 * (1 - L), c = 7;
        ctx.strokeStyle = 'rgba(' + P.brackets + ',' + (.9 * L).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = mx + sx * s, y = my + sy * s;
          ctx.moveTo(x, y - sy * c); ctx.lineTo(x, y); ctx.lineTo(x - sx * c, y);
        }
        ctx.stroke();
      }
    }

    function loop(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      tNow = (now - T0) / 1000;
      frame(tNow);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !REDUCE && visible && !document.hidden) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    /* reduced motion: sweep frozen just past the marker, fully locked */
    const STILL_T = ((((M_ANG + .5 - TH0) % TAU) + TAU) % TAU) / TAU * PERIOD + PERIOD;
    function redraw() { frame(REDUCE ? STILL_T : tNow); }

    let locked = false;
    function lock() {
      if (locked) return; locked = true;
      if (!REDUCE) lockAt = (performance.now() - T0) / 1000;
      onLock();
    }

    if (REDUCE) lockAt = 0;
    layout();
    redraw();

    if (REDUCE || !('IntersectionObserver' in window)) lock();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        visible = es[es.length - 1].isIntersecting;
        if (visible) start(); else stop();
      }).observe(panel);
      if (!locked) new IntersectionObserver((es, obs) => {
        if (es.some(e => e.isIntersecting)) { lock(); obs.disconnect(); }
      }, { threshold: .45 }).observe(scope);
    }

    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

    let rt = 0, lastW = 0, lastH = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const r = panel.getBoundingClientRect();
        if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
        lastW = r.width; lastH = r.height;
        layout(); redraw();
      }, 120);
    };
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(panel); else addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); redraw(); });
    /* colour mode switched: new palette, rebuild the cached base layer, repaint now (also the still frame) */
    document.addEventListener('saa:theme', () => { P = isLight() ? PALETTES.light : PALETTES.dark; drawBase(); redraw(); });

    if (FINE && !REDUCE) {
      panel.addEventListener('pointermove', e => {
        const r = panel.getBoundingClientRect();
        px = e.clientX - r.left; py = e.clientY - r.top; pTarget = 1;
      });
      panel.addEventListener('pointerleave', () => { pTarget = 0; });
    }
    start();
  }

  const panel = document.getElementById('radar');
  if (panel) {
    const read = makeReadout(panel.querySelector('.loc-read'));
    const status = panel.querySelector('[data-status]');
    let fired = false;
    const onLock = () => {
      if (fired) return; fired = true;
      panel.classList.add('is-locking');
      read.run(() => {
        panel.classList.add('is-locked');
        if (status) status.textContent = 'Location locked';
      });
    };
    try { radar(panel, onLock); } catch (err) { console.error(err); onLock(); }
  }

  /* ---------------------------------------------------------------------
     4. COPY BUTTONS
     navigator.clipboard is called directly inside the click handler; when it
     is missing or refused, the visible text is selected so it can be copied.
     --------------------------------------------------------------------- */
  function selectNode(node) {
    try {
      const r = document.createRange(); r.selectNodeContents(node);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return true;
    } catch (_) { return false; }
  }
  function execCopy(text, target) {
    let ok = false;
    if (target && target.textContent.trim() === text) {
      selectNode(target);
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      return ok;
    }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    try { ta.select(); ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
  document.querySelectorAll('[data-copy]').forEach(btn => {
    const lbl = btn.querySelector('.lbl');
    const orig = lbl ? lbl.textContent : '';
    const box = btn.closest('.dl-card, .loc-bottom');
    const msg = box && box.querySelector('.copy-msg');
    let timer = 0;
    const report = ok => {
      clearTimeout(timer);
      if (lbl) lbl.textContent = ok ? 'Copied' : 'Selected';
      btn.classList.add('is-done');
      if (msg) msg.textContent = ok ? (btn.dataset.copyDone || 'Copied.') : (btn.dataset.copySel || 'Selected, ready to copy.');
      timer = setTimeout(() => { if (lbl) lbl.textContent = orig; btn.classList.remove('is-done'); if (msg) msg.textContent = ''; }, 2800);
    };
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      const target = btn.dataset.copySelect ? document.querySelector(btn.dataset.copySelect) : null;
      const fallback = () => {
        if (execCopy(text, target)) return report(true);
        if (target) selectNode(target);
        report(false);
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => report(true), fallback);
      } else fallback();
    });
  });

  /* ---------------------------------------------------------------------
     5. ENQUIRY FORM -> mailto
     Spam and safety checks:
     - honeypot "company_website": hidden from people; if a bot fills it we pretend success and send nothing
     - time trap: a send within 3 s of the form becoming ready is refused with a friendly retry message
     - session limit: 3 sends per 10 minutes (sessionStorage; if storage is blocked there is no limit)
     - clean lines: control characters and header-injection newlines are stripped before the mailto is built
     FORM SERVICE: to post to a form service later, replace openMail(href) in the submit handler with a
     fetch() POST of `data` to the endpoint (for example window.SAA_CONFIG.formEndpoint) and keep these checks.
     --------------------------------------------------------------------- */
  const GUARD = {
    MIN_MS: 3000, MAX_SENDS: 3, WINDOW_MS: 10 * 60 * 1000, KEY: 'saa-form-sends',
    line: v => String(v || '').replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim(),
    text: v => String(v || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g, '').trim(),
    sends() {
      try {
        const a = JSON.parse(sessionStorage.getItem(GUARD.KEY) || '[]'), t = Date.now();
        return Array.isArray(a) ? a.filter(x => typeof x === 'number' && t - x < GUARD.WINDOW_MS) : [];
      } catch (_) { return []; }
    },
    limited: () => GUARD.sends().length >= GUARD.MAX_SENDS,
    record() { try { const a = GUARD.sends(); a.push(Date.now()); sessionStorage.setItem(GUARD.KEY, JSON.stringify(a)); } catch (_) { /* storage blocked */ } }
  };
  const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
  const phoneOk = v => /^\+?[0-9 ()./-]{6,30}$/.test(v) && (v.match(/\d/g) || []).length >= 7 && (v.match(/\d/g) || []).length <= 15;
  const openMail = href => { window.location.href = href; };

  const form = document.getElementById('enqForm');
  if (form) {
    const EXT = window.SAA_EXT || {
      cv: 'careers.html?role=general#applyForm',
      jobs: 'careers.html#jobs',
      emirati: 'careers.html?role=emiratisation#applyForm'
    };
    const link = (href, text) => '<a href="' + href + '">' + text + '</a>';
    const ROLES = {
      'Client': ['Tell us the roles, the numbers and the location, onshore or offshore.', 'Roles, number of people, location and start date.'],
      'Job seeker': ['You can also ' + link(EXT.cv, 'send your CV') + ' or ' + link(EXT.jobs, 'view open jobs') + ' on our careers page.', 'The role you are looking for and your experience.'],
      'UAE National': ['National jobs for national talents. UAE Nationals can also ' + link(EXT.emirati, 'register for Emiratisation') + ' on our careers page.', 'The role you are looking for and your qualifications.'],
      'Supplier': ['Tell us what you supply and which part of the group it would serve.', 'What you supply and how it could support the SAA Group.'],
      'Other': ['Tell us how we can help.', 'How can we help?']
    };
    const hint = document.getElementById('enqHint');
    const out = document.getElementById('enqMsg');
    const $ = id => document.getElementById(id);
    const fName = $('fName'), fCompany = $('fCompany'), fEmail = $('fEmail'), fPhone = $('fPhone'), fMsg = $('fMsg'), trap = $('fWebsite');
    const readyAt = performance.now();
    let tried = false;

    const role = () => { const r = form.querySelector('input[name="role"]:checked'); return r ? r.value : 'Other'; };
    form.querySelectorAll('input[name="role"]').forEach(r => r.addEventListener('change', () => {
      const v = ROLES[role()] || ROLES.Other;
      hint.innerHTML = v[0]; fMsg.placeholder = v[1];
      hint.classList.remove('flash'); void hint.offsetWidth; if (!REDUCE) hint.classList.add('flash');
    }));

    function setErr(el, text) {
      const e = $(el.id + 'Err'); if (e) e.textContent = text || '';
      if (text) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    }
    function validate() {
      const bad = [];
      const chk = (ok, el, text) => { setErr(el, ok ? '' : text); if (!ok) bad.push(el); };
      const nv = GUARD.line(fName.value), cv = GUARD.line(fCompany.value), ev = GUARD.line(fEmail.value);
      const pv = GUARD.line(fPhone.value), mv = GUARD.text(fMsg.value);
      chk(nv.length >= 2 && nv.length <= 100, fName, nv.length > 100 ? 'Please shorten your name to 100 characters.' : 'Please enter your name.');
      chk(cv.length <= 120, fCompany, 'Please shorten the company name to 120 characters.');
      chk(EMAIL_RE.test(ev) && ev.length <= 254, fEmail, ev ? 'Please check your email address, for example name@company.com.' : 'Please enter your email address.');
      chk(!pv || phoneOk(pv), fPhone, 'Please check your phone number. Use digits, spaces and an optional + at the start.');
      chk(mv.length >= 2 && mv.length <= 2000, fMsg, mv.length > 2000 ? 'Please keep your message under 2,000 characters.' : 'Please write a short message.');
      return bad;
    }
    const recheck = () => { if (!tried) return; const bad = validate(); if (!bad.length && out.classList.contains('err')) { out.textContent = ''; out.className = 'form-msg enq-msg'; } };
    form.addEventListener('input', recheck);
    form.addEventListener('change', recheck);

    const say = text => { out.className = 'form-msg enq-msg err'; out.textContent = text; };
    const ICON_OK = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function thanks(name) {
      out.className = 'form-msg enq-msg';
      out.innerHTML = '';
      const ic = document.createElement('span'); ic.className = 'ok-ic'; ic.innerHTML = ICON_OK;
      const txt = document.createElement('span');
      const b = document.createElement('b'); b.textContent = name;
      const a = document.createElement('a'); a.href = 'mailto:' + EMAIL; a.textContent = EMAIL;
      if (name) txt.append('Thank you, ', b, '. '); else txt.append('Thank you. ');
      txt.append('Your email app should now open with your message to ', a,
        '. Press send there to reach our team. If nothing opens, email us at ' + EMAIL + ' or call +971 2 627 0622.');
      out.append(ic, txt);
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = {
        role: role(), name: GUARD.line(fName.value), company: GUARD.line(fCompany.value), email: GUARD.line(fEmail.value),
        phone: GUARD.line(fPhone.value), message: GUARD.text(fMsg.value)
      };

      /* honeypot: a bot filled the hidden field, so look successful and send nothing */
      if (trap && trap.value) { thanks(data.name); return; }

      tried = true;
      const bad = validate();
      if (bad.length) {
        say(bad.length === 1 ? 'Please check the highlighted field.' : 'Please check the ' + bad.length + ' highlighted fields.');
        bad[0].focus();
        return;
      }
      if (performance.now() - readyAt < GUARD.MIN_MS) { say('That was quick. Please wait a moment, then press Send enquiry again.'); return; }
      if (GUARD.limited()) { say('You have sent several enquiries in the last few minutes. Please wait a little, or email ' + EMAIL + ' directly.'); return; }

      const lines = ['I am a: ' + data.role, 'Name: ' + data.name];
      if (data.company) lines.push('Company: ' + data.company);
      lines.push('Email: ' + data.email);
      if (data.phone) lines.push('Phone: ' + data.phone);
      lines.push('', 'Message:', data.message, '', 'Sent from the SAA Group website contact form.');
      const subject = GUARD.line('Website enquiry (' + data.role + ') from ' + data.name + (data.company ? ', ' + data.company : ''));
      const href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));

      GUARD.record();
      thanks(data.name);
      form.dispatchEvent(new CustomEvent('saa:form-sent', { bubbles: true, detail: { form: form.id } }));
      openMail(href);
    });
  }

  /* ---------------------------------------------------------------------
     Card spotlight (fine pointers)
     --------------------------------------------------------------------- */
  if (FINE) document.querySelectorAll('.dl-card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--sx', (e.clientX - r.left).toFixed(0) + 'px');
      card.style.setProperty('--sy', (e.clientY - r.top).toFixed(0) + 'px');
    });
  });

  /* ---------------------------------------------------------------------
     6. SCROLL CHOREOGRAPHY
     --------------------------------------------------------------------- */
  if (!window.SAA) return;
  window.SAA.ready(({ gsap, ScrollTrigger, reduce }) => {
    if (!ScrollTrigger || reduce) return;

    /* hero entrance + depth */
    gsap.from(['.ct-lead', '.ct-meta > div', '.ct-down'], { y: 36, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .08, delay: .45, clearProps: 'opacity,transform' });
    gsap.from('.ct-ping', { opacity: 0, duration: 1.8, ease: 'power2.out', delay: .3, clearProps: 'opacity' });
    gsap.to('.ct-wrap', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.ct-hero', start: 'top top', end: 'bottom top', scrub: true } });

    /* radar panel opens from an inset instrument window to full bleed */
    const p = document.getElementById('radar');
    if (p) {
      const mm = gsap.matchMedia();
      mm.add({ big: '(min-width: 700px)', small: '(max-width: 699px)' }, c => {
        const from = c.conditions.big ? 'inset(5% 3% 0% 3% round 36px)' : 'inset(2% 3% 0% 3% round 22px)';
        gsap.fromTo(p, { clipPath: from }, {
          clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
          scrollTrigger: { trigger: p, start: 'top bottom', end: 'top 20%', scrub: true }
        });
      });
      gsap.from(p.querySelectorAll('.loc-top .eyebrow, .loc-sub, .loc-read, .loc-actions'), {
        y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .09,
        scrollTrigger: { trigger: p, start: 'top 55%', once: true }
      });
    }
  });
})();
