/* =========================================================================
   ADIPEC 2026 page
   1. Show state (before / during / after, in Gulf Standard Time) drives
      every [data-when] element. Preview another moment with ?now=ISO-date.
   2. Signature: particle field. Thousands of teal particles assemble into
      the real h1 letters "ADIPEC 2026." (sampled from an offscreen canvas
      at the exact position of the DOM text), scatter from the pointer or a
      finger, and re-form. Scrolling away blows them apart like dust.
      WebGL points, Canvas 2D fallback, still frame for reduced motion.
   3. Giant countdown with rolling digits
   4. Why meet SAA: sticky index with scroll-spy on desktop, stacked on phones
   5. Meeting request form: validates, composes a mailto, confirms
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const LOW = (navigator.hardwareConcurrency || 8) <= 4;   // fewer particles and a lighter canvas on modest devices
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const EMAIL = 'saaest@eim.ae';
  let LENIS = null;

  /* =======================================================================
     1. SHOW STATE
     ======================================================================= */
  const OPEN = Date.UTC(2026, 10, 2, 6, 0, 0);    // Mon 2 Nov 2026, 10:00 GST (UTC+4)
  const CLOSE = Date.UTC(2026, 10, 5, 14, 0, 0);  // Thu 5 Nov 2026, 18:00 GST
  const DAY1 = Date.UTC(2026, 10, 2, 0, 0, 0);
  let offset = 0;
  try {
    const q = new URLSearchParams(location.search).get('now');
    if (q) { const t = Date.parse(q); if (!isNaN(t)) offset = t - Date.now(); }
  } catch (_) { /* ignore */ }
  const now = () => Date.now() + offset;
  const stateAt = t => (t < OPEN ? 'soon' : t < CLOSE ? 'live' : 'done');
  let state = '';

  function applyState(s) {
    if (s === state) return;
    state = s;
    document.body.dataset.adipec = s;
    document.querySelectorAll('[data-when]').forEach(el => { el.hidden = !el.dataset.when.split(' ').includes(s); });
    /* during the show, days that have already passed (GST) cannot be picked */
    const gstToday = new Date(now() + 4 * 3600e3).toISOString().slice(0, 10);
    document.querySelectorAll('.day input[data-date]').forEach(inp => {
      const past = s === 'live' && inp.dataset.date < gstToday;
      inp.disabled = past;
      if (past) inp.checked = false;
    });
  }
  applyState(stateAt(now()));

  /* =======================================================================
     2. PARTICLE FIELD
     ======================================================================= */
  function initField() {
    const hero = document.querySelector('.ad-hero');
    let canvas = document.getElementById('adField');
    const word = document.getElementById('adWord');
    if (!hero || !canvas || !word) return null;

    let mode = '';
    let gl = null, prog = null, bufDyn = null, bufStat = null, aDyn = -1, aStat = -1, U = {}, maxPt = 64;
    let soft = false;   // software WebGL (no GPU): lighter canvas and a steady 30 fps
    let c2 = null;

    let W = 1, H = 1, DPR = 1, N = 0, NT = 0;
    let X, Y, VX, VY, HX, HY, DX, DY, K, SW, B0, SZ, TI, DL, PH, dyn, stat;
    let box = { x0: 0, y0: 0, x1: 1, y1: 1 }, fontPx = 120, anchor = { x: 0, y: 0, w: 0 }, frameNo = 0;
    let built = false, wantStart = false, started = false, tStart = 0;
    let raf = 0, last = 0, visible = true, disp = 0, alpha = REDUCE ? 1 : 0, lastDispCss = -1, calmTick = 0;
    const P = { x: -9999, y: -9999, vx: 0, vy: 0, on: 0, target: 0, has: false };
    const isLight = () => !!(window.SAATheme && window.SAATheme.get() === 'light');
    let light = isLight();   // daylight palette and normal blending (see render)

    /* ---------- renderers ---------- */
    function setupGL() {
      const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
      let g = null;
      try { g = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (_) { g = null; }
      if (!g) return false;
      const VS =
        'attribute vec3 aDyn; attribute vec2 aStat; uniform vec2 uRes; uniform float uDpr; uniform float uMaxPt;' +
        'varying float vB; varying float vT;' +
        'void main(){ vec2 p = aDyn.xy / uRes * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0);' +
        ' gl_PointSize = min(uMaxPt, aStat.x * uDpr * (0.9 + 0.32 * min(aDyn.z, 2.2))); vB = aDyn.z; vT = aStat.y; }';
      /* Dark: glowing teal that whitens where it is bright, added together (blendFunc ONE, ONE).
         Light (uLight = 1): deep teal ink that darkens to navy where it is bright, painted over the
         daylight sky with normal blending, because added light vanishes on a pale background. */
      const FS =
        'precision mediump float; uniform float uAlpha; uniform float uLight; varying float vB; varying float vT;' +
        'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;' +
        ' float halo = smoothstep(0.5, 0.0, d); halo *= halo; float core = smoothstep(0.25, 0.04, d);' +
        ' if (uLight > 0.5) {' +
        '  float dot = smoothstep(0.44, 0.2, d);' +
        '  vec3 ink = mix(vec3(0.089, 0.360, 0.483), vec3(0.070, 0.275, 0.363), vT);' +
        '  vec3 lc = mix(ink, vec3(0.131, 0.238, 0.379), clamp((vB - 0.9) * 0.8, 0.0, 0.8));' +
        '  float la = min(1.0, (halo * 0.2 + dot * 0.9) * clamp(vB * 1.15, 0.0, 1.4) * uAlpha);' +
        '  gl_FragColor = vec4(lc * la, la); return; }' +
        ' vec3 teal = mix(vec3(0.180, 0.553, 0.710), vec3(0.420, 0.760, 0.880), vT);' +
        ' vec3 col = mix(teal, vec3(0.880, 0.957, 0.976), clamp((vB - 0.9) * 0.9, 0.0, 0.85));' +
        ' float a = (halo * 0.6 + core * 0.95) * clamp(vB, 0.0, 2.4) * uAlpha;' +
        ' gl_FragColor = vec4(col * a, a * 0.6); }';
      const sh = (type, src) => {
        const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s);
        if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error('shader');
        return s;
      };
      const p = g.createProgram();
      g.attachShader(p, sh(g.VERTEX_SHADER, VS)); g.attachShader(p, sh(g.FRAGMENT_SHADER, FS)); g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error('link');
      prog = p; gl = g;
      aDyn = g.getAttribLocation(p, 'aDyn'); aStat = g.getAttribLocation(p, 'aStat');
      ['uRes', 'uDpr', 'uMaxPt', 'uAlpha', 'uLight'].forEach(n => { U[n] = g.getUniformLocation(p, n); });
      bufDyn = g.createBuffer(); bufStat = g.createBuffer();
      const r = g.getParameter(g.ALIASED_POINT_SIZE_RANGE); if (r && r[1]) maxPt = r[1];
      try {
        const dbg = g.getExtension('WEBGL_debug_renderer_info');
        soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(g.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : g.RENDERER)));
      } catch (_) { soft = false; }
      g.disable(g.DEPTH_TEST); g.enable(g.BLEND);   /* the blend function follows the colour mode, in render() */
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(); });
      return true;
    }
    function fail() {
      mode = ''; stop();
      hero.classList.remove('pf-on', 'pf-live');
      canvas.style.display = 'none';
    }
    function freshCanvas() {
      const nc = canvas.cloneNode(false); canvas.replaceWith(nc); canvas = nc;
    }
    try { if (setupGL()) mode = 'gl'; } catch (_) { gl = null; freshCanvas(); }
    if (!mode) {
      try { c2 = canvas.getContext('2d'); } catch (_) { c2 = null; }
      if (c2) mode = '2d';
    }
    if (!mode) return null;
    const hint = document.getElementById('adHint');
    if (hint && !FINE) hint.textContent = 'Touch the letters';

    /* ---------- layout: make the word fill the line, then measure ---------- */
    function fitWord() {
      word.style.fontSize = '';
      const cur = parseFloat(getComputedStyle(word).fontSize) || 100;
      const avail = word.clientWidth;
      const rg = document.createRange(); rg.selectNodeContents(word);
      const lines = new Map();
      [...rg.getClientRects()].forEach(r => {
        if (r.width < 1) return;
        const key = Math.round(r.top / 8);
        const l = lines.get(key) || { a: 1e9, b: -1e9 };
        l.a = Math.min(l.a, r.left); l.b = Math.max(l.b, r.right); lines.set(key, l);
      });
      let maxW = 0; lines.forEach(l => { maxW = Math.max(maxW, l.b - l.a); });
      if (!maxW || !avail) return;
      let next = cur * avail / maxW * 0.985;
      next = Math.min(next, innerHeight * (innerWidth < 700 ? 0.17 : 0.25), 300);
      word.style.fontSize = next.toFixed(2) + 'px';
    }

    /* where the word sits inside the hero: if this moves later (late font, reflow), the field re-samples */
    function wordPos() {
      const a = word.getBoundingClientRect(), b = hero.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, w: a.width };
    }
    function drifted() {
      const q = wordPos();
      return Math.abs(q.x - anchor.x) > 2 || Math.abs(q.y - anchor.y) > 2 || Math.abs(q.w - anchor.w) > 2;
    }

    function measure() {
      const r = hero.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      DPR = Math.min(window.devicePixelRatio || 1, soft ? 1 : W < 700 || LOW ? 1.5 : 2);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    }

    /* Draw each glyph of the DOM word into an offscreen canvas at its exact on-screen box, then sample it */
    function sample(target) {
      const cr = canvas.getBoundingClientRect();
      const ow = Math.ceil(W), oh = Math.ceil(H);
      const off = document.createElement('canvas'); off.width = ow; off.height = oh;
      const o = off.getContext('2d', { willReadFrequently: true });
      if (!o) return null;
      fontPx = parseFloat(getComputedStyle(word).fontSize) || 120;
      const fam = 'Archivo, "Arial Black", "Helvetica Neue", Arial, sans-serif';
      o.font = '900 ' + fontPx + 'px ' + fam;
      try { o.font = '900 expanded ' + fontPx + 'px ' + fam; } catch (_) { /* keep plain */ }
      try { if ('fontStretch' in o) o.fontStretch = 'expanded'; } catch (_) { /* optional */ }
      o.fillStyle = '#fff'; o.textBaseline = 'alphabetic'; o.textAlign = 'left';
      const mm = o.measureText('ADIPEC');
      const asc = mm.fontBoundingBoxAscent, des = mm.fontBoundingBoxDescent;
      const ratio = asc > 0 && des >= 0 ? asc / (asc + des) : 0.8;

      const rg = document.createRange();
      const tw = document.createTreeWalker(word, NodeFilter.SHOW_TEXT);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, node, glyphs = 0;
      while ((node = tw.nextNode())) {
        const txt = node.nodeValue;
        for (let i = 0; i < txt.length; i++) {
          const ch = txt[i];
          if (/\s/.test(ch)) continue;
          rg.setStart(node, i); rg.setEnd(node, i + 1);
          const r = rg.getClientRects()[0];
          if (!r || r.width < 1) continue;
          const cw = o.measureText(ch).width || r.width;
          const left = r.left - cr.left, top = r.top - cr.top;
          o.setTransform(r.width / cw, 0, 0, 1, left, top + r.height * ratio);
          o.fillText(ch, 0, 0);
          glyphs++;
          x0 = Math.min(x0, left); x1 = Math.max(x1, left + r.width);
          y0 = Math.min(y0, top); y1 = Math.max(y1, top + r.height);
        }
      }
      o.setTransform(1, 0, 0, 1, 0, 0);
      if (!glyphs) return null;
      const bx0 = clamp(Math.floor(x0) - 6, 0, ow - 1), bx1 = clamp(Math.ceil(x1) + 6, 0, ow - 1);
      const by0 = clamp(Math.floor(y0) - 6, 0, oh - 1), by1 = clamp(Math.ceil(y1) + 6, 0, oh - 1);
      const img = o.getImageData(0, 0, ow, oh).data;
      const A = (x, y) => (x < 0 || y < 0 || x >= ow || y >= oh ? 0 : img[(y * ow + x) * 4 + 3]);
      let filled = 0;
      for (let y = by0; y <= by1; y += 2) for (let x = bx0; x <= bx1; x += 2) if (A(x, y) > 127) filled++;
      const area = filled * 4;
      if (area < 60) return null;
      const step = Math.max(1.35, Math.sqrt(area / target));
      const e = Math.max(2, Math.round(fontPx * 0.02));
      const pts = [], edge = [];
      for (let y = by0 + step / 2; y <= by1; y += step) {
        for (let x = bx0 + step / 2; x <= bx1; x += step) {
          const jx = x + (Math.random() - 0.5) * step * 0.8, jy = y + (Math.random() - 0.5) * step * 0.8;
          const ix = jx | 0, iy = jy | 0;
          if (A(ix, iy) > 127) {
            pts.push(jx, jy);
            edge.push(A(ix - e, iy) < 128 || A(ix + e, iy) < 128 || A(ix, iy - e) < 128 || A(ix, iy + e) < 128 ? 1 : 0);
          }
        }
      }
      box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
      return { pts, edge };
    }

    function build(first) {
      fitWord(); measure();
      const phone = W < 700;
      let target = phone ? 2000 : W < 1100 ? 4400 : 7000;
      if (LOW) target = Math.round(target * 0.7);
      if (mode === '2d') target = Math.round(target * 0.55);
      const s = sample(target);
      if (!s) return false;
      const nt = s.pts.length / 2;
      const nd = Math.round((phone ? 170 : 720) * (mode === '2d' ? 0.6 : 1) * (LOW ? 0.7 : 1));
      const n = nt + nd;
      const old = X ? { X, Y, VX, VY, n: N } : null;
      const F = () => new Float32Array(n);
      X = F(); Y = F(); VX = F(); VY = F(); HX = F(); HY = F(); DX = F(); DY = F();
      K = F(); SW = F(); B0 = F(); SZ = F(); TI = F(); DL = F(); PH = F();
      dyn = new Float32Array(n * 3); stat = new Float32Array(n * 2);
      N = n; NT = nt;
      const far = Math.max(W, H);
      const bw = Math.max(1, box.x1 - box.x0);
      for (let i = 0; i < n; i++) {
        const R = Math.random;
        PH[i] = R() * 6.2832; TI[i] = R();
        if (i < nt) {
          HX[i] = s.pts[i * 2]; HY[i] = s.pts[i * 2 + 1];
          const ed = s.edge[i];
          B0[i] = 0.72 + R() * 0.34 + ed * 0.36;
          SZ[i] = (phone ? 3.2 : 3.6) * (0.72 + R() * 0.5) * (ed ? 1.1 : 1);
          K[i] = 0.026 + R() * 0.03;
          SW[i] = (R() < 0.5 ? -1 : 1) * (0.12 + R() * 0.28);
          DL[i] = 0.05 + (HX[i] - box.x0) / bw * 0.95 + R() * 0.45;
          const a = -Math.PI / 2 + (R() - 0.5) * 2.7, dist = (0.3 + R() * 0.8) * far * 0.6;
          DX[i] = Math.cos(a) * dist; DY[i] = Math.sin(a) * dist;
        } else {
          HX[i] = R() * W; HY[i] = R() * H;
          B0[i] = 0.12 + R() * 0.32;
          SZ[i] = 1.3 + R() * 2.3;
          DX[i] = (R() - 0.5) * 0.16; DY[i] = -(0.04 + R() * 0.22);
          DL[i] = R() * 0.8;
        }
        if (old && i < old.n) { X[i] = old.X[i]; Y[i] = old.Y[i]; VX[i] = old.VX[i]; VY[i] = old.VY[i]; }
        else if (first && !REDUCE && i < nt) { X[i] = R() * W; Y[i] = R() * H; VX[i] = (R() - 0.5) * 2; VY[i] = (R() - 0.5) * 2; }
        else { X[i] = HX[i]; Y[i] = HY[i]; }
        stat[i * 2] = SZ[i]; stat[i * 2 + 1] = TI[i];
      }
      if (mode === 'gl') {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufStat); gl.bufferData(gl.ARRAY_BUFFER, stat, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufDyn); gl.bufferData(gl.ARRAY_BUFFER, dyn.byteLength, gl.DYNAMIC_DRAW);
      }
      anchor = wordPos();
      built = true;
      hero.classList.add('pf-on');
      if (!REDUCE) hero.classList.add('pf-live');
      return true;
    }

    /* ---------- simulation ---------- */
    function step(dt, ts) {
      const intro = started ? ts : -1;
      const R = clamp(fontPx * 0.95, 70, 200), R2 = R * R;
      const pOn = P.on;
      const damp = Math.pow(0.86, dt);
      const period = 7.5;
      const sw = started && ts > 2.2 ? ((ts - 2.2) % period) / period : -1;
      const bw = box.x1 - box.x0;
      const sweepX = box.x0 - 320 + sw * (bw + 640);
      for (let i = 0; i < NT; i++) {
        let x = X[i], y = Y[i], vx = VX[i], vy = VY[i];
        let tx = HX[i] + Math.sin(ts * 1.3 + PH[i]) * 0.7;
        let ty = HY[i] + Math.cos(ts * 1.1 + PH[i] * 1.7) * 0.7;
        if (disp > 0.001) { tx += DX[i] * disp; ty += DY[i] * disp; }
        let k = 0;
        if (intro >= 0) { const a = (intro - DL[i]) / 0.9; k = a <= 0 ? 0 : a >= 1 ? K[i] : K[i] * a * a; }
        const ex = tx - x, ey = ty - y;
        let ax = ex * k - ey * k * SW[i], ay = ey * k + ex * k * SW[i];
        if (pOn > 0.01) {
          const dx = x - P.x, dy = y - P.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) + 0.001, f = 1 - d / R, ff = f * f * 7.5 * pOn;
            ax += dx / d * ff + P.vx * f * 0.09 * pOn;
            ay += dy / d * ff + P.vy * f * 0.09 * pOn;
          }
        }
        vx = (vx + ax * dt) * damp; vy = (vy + ay * dt) * damp;
        const sp2 = vx * vx + vy * vy;
        if (sp2 > 1600) { const q = 40 / Math.sqrt(sp2); vx *= q; vy *= q; }
        x += vx * dt; y += vy * dt;
        X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy;
        let b = B0[i] * (0.8 + 0.2 * Math.sin(ts * 2.1 + PH[i] * 3)) + Math.min(1.1, Math.sqrt(sp2) * 0.085);
        if (sw >= 0) { const q = (x + (y - box.y0) * 0.45 - sweepX) / 70; if (q > -3 && q < 3) b += Math.exp(-q * q) * 0.95; }
        const j = i * 3; dyn[j] = x; dyn[j + 1] = y; dyn[j + 2] = b;
      }
      const lift = disp * 2.2;
      for (let i = NT; i < N; i++) {
        let x = X[i], y = Y[i], vx = VX[i], vy = VY[i];
        vx += (DX[i] - vx) * 0.02 * dt; vy += (DY[i] - lift - vy) * 0.02 * dt;
        if (pOn > 0.01) {
          const dx = x - P.x, dy = y - P.y, d2 = dx * dx + dy * dy;
          if (d2 < R2 * 1.5) { const d = Math.sqrt(d2) + 0.001, f = 1 - d / (R * 1.22); if (f > 0) { vx += dx / d * f * 0.5 * pOn * dt; vy += dy / d * f * 0.5 * pOn * dt; } }
        }
        x += vx * dt; y += vy * dt;
        if (y < -12) { y = H + 12; x = Math.random() * W; } else if (y > H + 12) y = -12;
        if (x < -12) x = W + 12; else if (x > W + 12) x = -12;
        X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy;
        const j = i * 3; dyn[j] = x; dyn[j + 1] = y;
        dyn[j + 2] = B0[i] * (0.55 + 0.45 * Math.sin(ts * 0.9 + PH[i])) * (intro >= 0 ? clamp((intro - DL[i]) / 1.2, 0, 1) : 0);
      }
    }

    function stillFrame() {
      for (let i = 0; i < N; i++) {
        X[i] = HX[i]; Y[i] = HY[i];
        const j = i * 3; dyn[j] = X[i]; dyn[j + 1] = Y[i];
        dyn[j + 2] = i < NT ? B0[i] * (0.85 + 0.15 * Math.sin(PH[i] * 3)) : B0[i] * 0.7;
      }
      alpha = 1; render();
    }

    function render() {
      if (mode === 'gl') {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        if (!N) return;
        gl.useProgram(prog);
        gl.blendFunc(gl.ONE, light ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
        gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uDpr, DPR); gl.uniform1f(U.uMaxPt, maxPt); gl.uniform1f(U.uAlpha, alpha);
        gl.uniform1f(U.uLight, light ? 1 : 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufStat);
        gl.enableVertexAttribArray(aStat); gl.vertexAttribPointer(aStat, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufDyn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn);
        gl.enableVertexAttribArray(aDyn); gl.vertexAttribPointer(aDyn, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, N);
      } else if (mode === '2d') {
        c2.setTransform(DPR, 0, 0, DPR, 0, 0);
        c2.globalCompositeOperation = 'source-over'; c2.globalAlpha = 1;
        c2.clearRect(0, 0, W, H);
        /* dark: two light teals added together; light: deep teal ink painted normally */
        c2.globalCompositeOperation = light ? 'source-over' : 'lighter';
        for (let pass = 0; pass < 2; pass++) {
          c2.fillStyle = light ? (pass ? '#155F80' : '#1B7194') : pass ? '#62B8DA' : '#2E8DB5';
          for (let i = 0; i < N; i++) {
            if ((TI[i] > 0.5 ? 1 : 0) !== pass) continue;
            const j = i * 3, b = dyn[j + 2] * alpha;
            if (b < 0.04) continue;
            c2.globalAlpha = Math.min(1, b * 0.62);
            const s = SZ[i] * 0.72;
            c2.fillRect(dyn[j] - s / 2, dyn[j + 1] - s / 2, s, s);
          }
        }
        c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over';
      }
    }

    /* ---------- loop ---------- */
    function frame(ms) {
      raf = 0;
      if (!visible || document.hidden || !mode) { last = 0; return; }
      if ((soft || (started && (ms - tStart) > 3600 && P.on < 0.02 && P.target === 0 && disp < 0.001)) && (++calmTick & 1)) {
        raf = requestAnimationFrame(frame); return;
      }
      const dt = last ? clamp((ms - last) / 16.667, 0.25, 2.5) : 1;
      last = ms;
      const ts = started ? (ms - tStart) / 1000 : 0;
      P.on += (P.target - P.on) * Math.min(1, 0.12 * dt);
      P.vx *= 0.82; P.vy *= 0.82;
      const r = hero.getBoundingClientRect();
      const p = clamp(-r.top / (r.height * 0.8), 0, 1);
      disp = p * p;   /* letters loosen gently at first, then blow apart */
      if (Math.abs(p - lastDispCss) > 0.004) { hero.style.setProperty('--disp', p.toFixed(3)); lastDispCss = p; }
      if (started) alpha = Math.min(1, alpha + 0.02 * dt);
      if (built && ++frameNo % 30 === 0 && drifted()) build(false);
      step(dt, ts);
      render();
      raf = requestAnimationFrame(frame);
    }
    function play() { if (!raf && !REDUCE && mode && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    function begin() {
      wantStart = true;
      if (!built || started) return;
      started = true; tStart = performance.now();
      if (REDUCE) stillFrame(); else play();
    }

    /* ---------- pointer / touch ---------- */
    function pointAt(cx, cy) {
      const r = hero.getBoundingClientRect();
      const x = cx - r.left, y = cy - r.top;
      if (P.has) { P.vx = P.vx * 0.5 + (x - P.x) * 0.5; P.vy = P.vy * 0.5 + (y - P.y) * 0.5; }
      P.x = x; P.y = y; P.has = true; P.target = 1;
    }
    function burst(cx, cy) {
      if (!built || REDUCE) return;
      const r = hero.getBoundingClientRect();
      const x = cx - r.left, y = cy - r.top, R = clamp(fontPx * 2.1, 140, 420);
      for (let i = 0; i < NT; i++) {
        const dx = X[i] - x, dy = Y[i] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        if (d < R) { const f = (1 - d / R) * 26; VX[i] += dx / d * f; VY[i] += dy / d * f; }
      }
    }
    if (!REDUCE) {
      if (FINE) {
        hero.addEventListener('pointermove', e => pointAt(e.clientX, e.clientY), { passive: true });
        hero.addEventListener('pointerleave', () => { P.target = 0; P.has = false; });
      }
      hero.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) { P.has = false; pointAt(t.clientX, t.clientY); } }, { passive: true });
      hero.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) pointAt(t.clientX, t.clientY); }, { passive: true });
      hero.addEventListener('touchend', () => { P.target = 0; P.has = false; }, { passive: true });
      hero.addEventListener('pointerdown', e => { if (!e.target.closest('a, button, input, select, textarea')) burst(e.clientX, e.clientY); });
    }

    /* ---------- visibility, resize ---------- */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? play() : stop(); }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) play(); });
    /* the header switch changed the colour mode: repaint now (this also redraws the reduced-motion still frame) */
    document.addEventListener('saa:theme', () => { light = isLight(); if (built && mode) render(); });
    let rz = 0, lastW = innerWidth, lastH = innerHeight;
    addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        if (Math.abs(innerWidth - lastW) < 2 && Math.abs(innerHeight - lastH) < 120) return;   // ignore phone toolbar jitter
        lastW = innerWidth; lastH = innerHeight;
        if (!build(false)) return;
        if (REDUCE) stillFrame();
      }, 180);
    });

    /* ---------- go, once the display font is ready ---------- */
    let tried = false;
    const go = () => {
      if (tried) return; tried = true;
      if (!build(true)) { fail(); return; }
      if (REDUCE) { stillFrame(); return; }
      render();
      if (wantStart) begin();
    };
    if (REDUCE && document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', () => { if (built && drifted() && build(false)) stillFrame(); });
    }
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const idle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 120));
    const goLater = () => requestAnimationFrame(() => requestAnimationFrame(() => idle(go)));
    fontsReady.then(() => (document.fonts && document.fonts.load ? document.fonts.load('900 100px Archivo').catch(() => {}) : null)).then(goLater, goLater);
    setTimeout(goLater, 3500);

    return { begin };
  }

  let field = null;
  try { field = initField(); } catch (err) {
    const h = document.querySelector('.ad-hero'); if (h) h.classList.remove('pf-on', 'pf-live');
  }

  /* =======================================================================
     3. COUNTDOWN
     ======================================================================= */
  function initCountdown() {
    const clock = document.getElementById('cdClock');
    const pillDays = document.querySelector('.ad-pill .js-days');
    const srText = document.getElementById('cdText');
    const dayLabel = document.getElementById('cdDay');
    const local = document.getElementById('cdLocal');
    const seps = clock ? [...clock.querySelectorAll('.cd-sep')] : [];
    const groups = {};
    if (clock) clock.querySelectorAll('.cd-num').forEach(el => {
      groups[el.dataset.unit] = { el, slots: [], bar: el.parentElement.querySelector('.cd-bar'), p: -1 };
    });

    /* "in your time zone" hint for visitors outside the UAE */
    if (local && new Date(OPEN).getTimezoneOffset() !== -240) {
      try {
        /* in the page language (Western digits) when translated; English keeps the visitor's own format */
        const loc = window.SAAI18n && SAAI18n.lang && SAAI18n.lang !== 'en' ? document.documentElement.lang + '-u-nu-latn' : undefined;
        const f = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        local.textContent = 'In your time zone: ' + f.format(new Date(OPEN)) + '.';
      } catch (_) { /* optional */ }
    }

    function slot() {
      const el = document.createElement('span'); el.className = 'dg';
      const inn = document.createElement('span'); inn.className = 'dg-in';
      const a = document.createElement('span'), b = document.createElement('span');
      inn.append(a, b); el.append(inn);
      return { el, inn, a, b, v: '' };
    }
    /* the new digit drops in from above, the old one falls away below */
    function roll(s, v, anim) {
      if (s.v === v) return;
      if (!anim || !s.v || REDUCE) {
        s.a.textContent = v; s.b.textContent = '';
        s.inn.style.transition = 'none'; s.inn.style.transform = 'none'; s.v = v; return;
      }
      s.b.textContent = s.v; s.a.textContent = v;
      s.inn.style.transition = 'none'; s.inn.style.transform = 'translate3d(0,-1em,0)';
      void s.inn.offsetHeight;
      s.inn.style.transition = ''; s.inn.style.transform = 'none';
      s.v = v;
    }
    let scrambling = false;
    function set(u, val, anim) {
      const g = groups[u]; if (!g) return;
      const str = String(val).padStart(2, '0');
      if (g.slots.length !== str.length) {
        g.el.textContent = ''; g.slots = [];
        for (let k = 0; k < str.length; k++) { const s = slot(); g.slots.push(s); g.el.append(s.el); }
        anim = false;
      }
      g.slots.forEach((s, k) => roll(s, str[k], anim && !scrambling));
      if (scrambling) g.slots.forEach((s, k) => { s.v = str[k]; });
    }
    function bar(u, p) {
      const g = groups[u]; if (!g || !g.bar) return;
      g.bar.classList.toggle('snap', p > g.p + 0.0001 && g.p >= 0);
      g.bar.style.setProperty('--p', p.toFixed(4));
      g.p = p;
    }

    let first = true, lastMin = -1;
    function tick() {
      const t = now();
      applyState(stateAt(t));
      if (state === 'soon') {
        const sec = Math.floor(Math.max(0, OPEN - t) / 1000);
        const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        set('d', d, !first); set('h', h, !first); set('m', m, !first); set('s', s, !first);
        bar('d', 1); bar('h', h / 24); bar('m', m / 60); bar('s', s / 60);
        if (!REDUCE) seps.forEach(el => el.classList.toggle('dim', s % 2 === 1));
        const minKey = Math.floor(sec / 60);
        if (minKey !== lastMin) {
          lastMin = minKey;
          if (pillDays) pillDays.textContent = d >= 2 ? d + ' days to go · 2–5 Nov' : d === 1 ? '1 day to go · 2–5 Nov' : 'Opens in ' + Math.max(1, Math.ceil(sec / 3600)) + ' h · 2–5 Nov';
          if (srText) srText.textContent = 'ADIPEC 2026 opens on Monday 2 November 2026 at 10:00 Gulf Standard Time, in ' +
            d + (d === 1 ? ' day, ' : ' days, ') + h + (h === 1 ? ' hour and ' : ' hours and ') + m + (m === 1 ? ' minute.' : ' minutes.');
        }
        first = false;
      } else if (state === 'live' && dayLabel) {
        const n = clamp(Math.floor((t + 4 * 3600e3 - DAY1) / 864e5) + 1, 1, 4);
        dayLabel.textContent = ['Monday 2', 'Tuesday 3', 'Wednesday 4', 'Thursday 5'][n - 1] + ' November · Day ' + n + ' of 4';
      }
      setTimeout(tick, state === 'soon' ? 1000 - (now() % 1000) + 15 : 30000);
    }
    tick();

    /* digits shuffle once when the clock first comes into view */
    function scramble() {
      if (REDUCE || state !== 'soon') return;
      const all = [];
      ['d', 'h', 'm', 's'].forEach(u => groups[u] && groups[u].slots.forEach(s => all.push(s)));
      scrambling = true;
      const t0 = performance.now(); let lastSwap = 0;
      const run = ms => {
        const el = ms - t0; let busy = false;
        const swap = ms - lastSwap > 55; if (swap) lastSwap = ms;
        all.forEach((s, k) => {
          if (el < 520 + k * 85) { busy = true; if (swap) s.a.textContent = String(Math.floor(Math.random() * 10)); }
          else s.a.textContent = s.v;
        });
        if (busy) requestAnimationFrame(run); else scrambling = false;
      };
      requestAnimationFrame(run);
    }
    if (clock && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); scramble(); } }, { threshold: 0.35 });
      io.observe(clock);
    }
  }
  initCountdown();

  /* =======================================================================
     4. WHY MEET SAA: sticky index with scroll-spy (desktop), stacked panels (phones)
     ======================================================================= */
  function initWhy() {
    const wrap = document.getElementById('whyWrap');
    if (!wrap) return;
    const tabs = [...wrap.querySelectorAll('.why-tab')], panels = [...wrap.querySelectorAll('.why-panel')];
    panels.forEach(p => p.querySelectorAll('.why-art svg > *').forEach(el => el.setAttribute('pathLength', '1')));
    wrap.classList.add('why-js');
    function setOn(i) {
      tabs.forEach((t, k) => { t.classList.toggle('is-on', k === i); if (k === i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
      panels.forEach((p, k) => p.classList.toggle('is-on', k === i));
    }
    setOn(0);
    if (REDUCE || !('IntersectionObserver' in window)) panels.forEach(p => p.classList.add('seen'));
    if (!('IntersectionObserver' in window)) return;
    /* line art draws once a panel arrives; the index follows the panel at the centre of the screen */
    const seen = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); seen.unobserve(e.target); } }), { threshold: 0.3 });
    const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setOn(panels.indexOf(e.target)); }), { rootMargin: '-45% 0px -50% 0px' });
    panels.forEach(p => { seen.observe(p); spy.observe(p); });
  }
  initWhy();

  /* =======================================================================
     5. MEETING REQUEST FORM
     ======================================================================= */
  /* Spam and safety checks, shared in spirit with the contact form:
     - honeypot (#mWebsite, named saa_hpx so autofill and password managers skip it): hidden from people; if a bot fills it we pretend success and send nothing
     - time trap: a send within 3 s of the form becoming ready is refused with a friendly retry message
     - session limit: 3 sends per 10 minutes (sessionStorage; if storage is blocked there is no limit)
     - clean lines: control characters and header-injection newlines are stripped before the mailto is built
     FORM SERVICE: to post to a form service later, replace openMail(href) in the submit handler with a
     fetch() POST of `data` to the endpoint (for example window.SAA_CONFIG.formEndpoint) and keep these checks. */
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

  function initForm() {
    const form = document.getElementById('meetForm');
    if (!form) return;
    const $ = id => document.getElementById(id);
    const done = $('meetDone'), msg = $('meetMsg'), sum = $('doneSum');
    const topic = $('mTopic'), trap = $('mWebsite');
    const readyAt = performance.now();
    let tried = false;

    /* "Discuss this at ADIPEC" buttons pre-select the topic */
    document.querySelectorAll('[data-topic]').forEach(a => a.addEventListener('click', () => {
      if (!topic) return;
      topic.value = a.dataset.topic;
      if (tried) validate();
      topic.classList.remove('flash'); void topic.offsetWidth; topic.classList.add('flash');
      if (!form.hidden) setTimeout(() => { const n = $('mName'); if (n && !n.value) n.focus({ preventScroll: true }); }, 1300);
    }));

    function say(text, ok) { msg.classList.toggle('ok', !!ok); msg.classList.toggle('err', !ok); msg.textContent = text; }
    function setErr(el, errId, text) {
      const field = el.closest('.field');
      if (field) field.classList.toggle('is-bad', !!text);
      const e = $(errId); if (e) e.textContent = text || '';
      if (el.tagName !== 'FIELDSET') { if (text) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    }
    function validate() {
      const bad = [];
      const chk = (ok, el, errId, text) => { setErr(el, errId, ok ? '' : text); if (!ok) bad.push(el); };
      const name = $('mName'), company = $('mCompany'), email = $('mEmail'), phone = $('mPhone'), mmsg = $('mMsg'), days = $('mDays');
      const nv = GUARD.line(name.value), cv = GUARD.line(company.value), ev = GUARD.line(email.value), pv = GUARD.line(phone.value);
      chk(nv.length >= 2 && nv.length <= 100, name, 'mNameErr', nv.length > 100 ? 'Please shorten your name to 100 characters.' : 'Please enter your name.');
      chk(cv.length >= 2 && cv.length <= 120, company, 'mCompanyErr', cv.length > 120 ? 'Please shorten the company name to 120 characters.' : 'Please enter your company.');
      chk(EMAIL_RE.test(ev) && ev.length <= 254, email, 'mEmailErr', ev ? 'Please check your email address, for example name@company.com.' : 'Please enter your email address.');
      chk(!pv || phoneOk(pv), phone, 'mPhoneErr', 'Please check your phone number. Use digits, spaces and an optional + at the start.');
      if (days && !days.hidden) chk(!!form.querySelector('input[name="day"]:checked'), days, 'mDayErr', 'Please choose a day.');
      chk(!!topic.value, topic, 'mTopicErr', 'Please choose a topic.');
      chk(GUARD.text(mmsg.value).length <= 2000, mmsg, 'mMsgErr', 'Please keep your message under 2,000 characters.');
      return bad;
    }
    const recheck = () => { if (!tried) return; const bad = validate(); if (!bad.length && msg.classList.contains('err')) msg.textContent = ''; };
    form.addEventListener('input', recheck);
    form.addEventListener('change', recheck);

    function showDone(data, day) {
      sum.textContent = '';
      [['Name', data.name], ['Company', data.company], ['Day', day], ['Topic', data.topic]].forEach(([k, v]) => {
        if (!v) return;
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        sum.append(dt, dd);
      });
      msg.textContent = '';
      form.hidden = true; done.hidden = false;
      const title = $('doneTitle'); if (title) title.focus({ preventScroll: true });
      const card = done.parentElement, top = card.getBoundingClientRect().top;
      if (top < 90 || top > innerHeight * 0.6) {
        if (LENIS) LENIS.scrollTo(card, { offset: -110, duration: 1.1 });
        else window.scrollTo({ top: top + scrollY - 110, behavior: REDUCE ? 'auto' : 'smooth' });
      }
      const gsap = window.gsap;
      if (gsap && !REDUCE) {
        gsap.from(done.children, { y: 26, opacity: 0, duration: .9, ease: 'expo.out', stagger: .06, clearProps: 'opacity,transform' });
        const path = done.querySelector('.done-mark path'), ring = done.querySelector('.done-mark circle');
        [ring, path].forEach((el, k) => { if (!el) return; el.setAttribute('pathLength', '1'); gsap.fromTo(el, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, delay: .15 + k * .35, ease: 'expo.out' }); });
      }
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      const daysEl = $('mDays');
      const dayInput = form.querySelector('input[name="day"]:checked');
      const day = daysEl && !daysEl.hidden && dayInput ? dayInput.value : '';
      const data = {
        name: GUARD.line($('mName').value), company: GUARD.line($('mCompany').value), email: GUARD.line($('mEmail').value),
        phone: GUARD.line($('mPhone').value), topic: GUARD.line(topic.value), message: GUARD.text($('mMsg').value)
      };

      /* honeypot: a bot filled the hidden field, so look successful and send nothing */
      if (trap && trap.value) { showDone(data, day); return; }

      tried = true;
      const bad = validate();
      if (bad.length) {
        say(bad.length === 1 ? 'Please check the highlighted field.' : 'Please check the ' + bad.length + ' highlighted fields.');
        const f = bad[0];
        const target = f.tagName === 'FIELDSET' ? (f.querySelector('input:checked:not(:disabled)') || f.querySelector('input:not(:disabled)')) : f;
        if (target) target.focus();
        return;
      }
      if (performance.now() - readyAt < GUARD.MIN_MS) {
        say('That was quick. Please wait a moment, then press Send request again.');
        return;
      }
      if (GUARD.limited()) {
        say('You have sent several requests in the last few minutes. Please wait a little, or email ' + EMAIL + ' directly.');
        return;
      }

      const after = state === 'done';
      const lines = [
        'Hello SAA Group,', '',
        after ? 'I would like to request a meeting with SAA Group.'
              : 'I would like to request a meeting with Mohamed El Naggar and the SAA Group team at ADIPEC 2026 (2–5 November 2026, ADNEC Centre Abu Dhabi).', '',
        'Name: ' + data.name, 'Company: ' + data.company, 'Email: ' + data.email
      ];
      if (data.phone) lines.push('Phone: ' + data.phone);
      if (day) lines.push('Preferred day: ' + day);
      lines.push('Topic: ' + data.topic);
      if (data.message) lines.push('', 'Message:', data.message);
      lines.push('', 'Sent from the ADIPEC 2026 page of the SAA Group website.');
      const subject = GUARD.line((after ? 'Meeting request' : 'ADIPEC 2026 meeting request') + ' · ' + data.company);
      const href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));

      GUARD.record();
      showDone(data, day);
      form.dispatchEvent(new CustomEvent('saa:form-sent', { bubbles: true, detail: { form: form.id } }));
      openMail(href);
    });

    const copy = $('doneCopy'), live = $('doneLive');
    if (copy) copy.addEventListener('click', () => {
      const ok = () => {
        copy.textContent = 'Copied'; if (live) live.textContent = 'Email address copied.';
        setTimeout(() => { copy.textContent = 'Copy email address'; }, 2200);
      };
      const fallback = () => {
        const ta = document.createElement('textarea'); ta.value = EMAIL; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
        try { document.execCommand('copy'); ok(); } catch (_) { /* nothing more to do */ }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(EMAIL).then(ok, fallback);
      else fallback();
    });
    const edit = $('doneEdit');
    if (edit) edit.addEventListener('click', () => {
      done.hidden = true; form.hidden = false;
      const n = $('mName'); if (n) n.focus();
    });
  }
  initForm();

  /* =======================================================================
     6. MOTION (after the shared preloader, Lenis and GSAP are ready)
     ======================================================================= */
  const kick = () => { if (field) field.begin(); };
  if (!window.SAA || typeof window.SAA.ready !== 'function') { kick(); return; }
  window.SAA.ready(({ gsap, ScrollTrigger, lenis, reduce }) => {
    LENIS = lenis || null;
    kick();
    if (reduce || !gsap) return;

    /* hero entrance */
    gsap.from('.ad-pre-in', { yPercent: 110, duration: 1.3, ease: 'expo.out', delay: 0.1 });
    gsap.from('.ad-word', { opacity: 0, duration: 2, ease: 'power2.out', delay: 0.2, clearProps: 'opacity' });
    gsap.from(['.ad-top', '.ad-foot > *', '.ad-facts > div'], { y: 30, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.07, delay: 0.75, clearProps: 'opacity,transform' });
    if (!ScrollTrigger) return;

    /* countdown */
    gsap.from('.cd-clock > *', { yPercent: 24, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.07, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.cd-stage', start: 'top 85%', once: true } });
    gsap.from('.cd-big', { yPercent: 30, opacity: 0, duration: 1.3, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: '.cd-stage', start: 'top 85%', once: true } });
    gsap.from('.cd-head, .cd-foot', { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.cd', start: 'top 80%', once: true } });

    /* why */
    gsap.from('.why-tab', { x: -40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.why-wrap', start: 'top 82%', once: true } });
    gsap.utils.toArray('.why-panel').forEach(p => gsap.from(p, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: p, start: 'top 90%', once: true } }));

    /* Mohamed's badge: drops onto its lanyard, sways with scroll speed, tilts toward the pointer */
    const swing = document.getElementById('hostSwing'), badge = document.getElementById('hostBadge');
    if (swing && badge) {
      const sway = gsap.quickTo(swing, 'rotation', { duration: 1.8, ease: 'elastic.out(1, 0.28)' });
      let settle = 0;
      gsap.from(swing, { yPercent: -40, opacity: 0, duration: 1.3, ease: 'back.out(1.5)', scrollTrigger: { trigger: '.host', start: 'top 72%', once: true,
        onEnter: () => { sway(-9); clearTimeout(settle); settle = setTimeout(() => sway(0), 260); } } });
      ScrollTrigger.create({ trigger: '.host', start: 'top bottom', end: 'bottom top', onUpdate: self => {
        sway(clamp(self.getVelocity() / -320, -8, 8));
        clearTimeout(settle); settle = setTimeout(() => sway(0), 140);
      } });
      if (FINE) {
        const rx = gsap.quickTo(badge, 'rotationX', { duration: .8, ease: 'power3.out' });
        const ry = gsap.quickTo(badge, 'rotationY', { duration: .8, ease: 'power3.out' });
        badge.addEventListener('pointermove', e => {
          const r = badge.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          ry((x - .5) * 14); rx((.5 - y) * 10); badge.style.setProperty('--shine', (110 - x * 120).toFixed(1) + '%');
        });
        badge.addEventListener('pointerleave', () => { rx(0); ry(0); badge.style.setProperty('--shine', '120%'); });
      }
      gsap.from('.host-copy .eyebrow', { y: 24, opacity: 0, duration: 1, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: '.host-copy', start: 'top 85%', once: true } });
    }

    /* the stand: fins rise and the render wipes in when the section arrives */
    const stand = document.querySelector('.stand');
    if (stand) {
      stand.classList.add('st-anim');
      ScrollTrigger.create({ trigger: stand, start: 'top 70%', once: true, onEnter: () => stand.classList.add('is-on') });
      gsap.fromTo('.st-fins', { yPercent: 8 }, { yPercent: -10, ease: 'none', scrollTrigger: { trigger: stand, start: 'top bottom', end: 'bottom top', scrub: true } });
    }

    /* meeting */
    gsap.from('.meet-alt li', { y: 24, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.07, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.meet-alt', start: 'top 92%', once: true } });
  });
})();
