/* =========================================================================
   SERVICES page
   1. Signature: "onshore to offshore". A night landscape drawn on a 2D
      canvas as perspective contour lines: desert dunes with heat shimmer,
      pumpjacks, a pipe rack, tanks and a flare, then the coast, the sea,
      a supply vessel and offshore platforms. Pinned: scrolling pans the
      camera across the coast while the captions swap. In light mode the
      same field is drawn by day (see PAL), repainted live on 'saa:theme'.
   2. Sector accordion (works without GSAP), line art draws in on open
   3. How we deliver: the progress line draws on scroll
   4. Who we serve: type band slides with scroll
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = x => x * x * (3 - 2 * x);
  /* fewer cores or little memory: start one detail level down and keep the pixel ratio lower */
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

  /* On a software GPU (no hardware acceleration) an accelerated 2D canvas is
     emulated and very slow, so every canvas of the scene stays on the CPU there. */
  const SOFT = (() => {
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
    } catch (_) { return false; }
  })();
  const ctx2d = (c, o) => c.getContext('2d', SOFT ? Object.assign({ willReadFrequently: true }, o) : o);
  // Without a GPU, a backdrop blur over the live canvas costs more than a frame; services.css drops it.
  if (SOFT) document.documentElement.classList.add('svc-lite');

  /* =======================================================================
     1. FIELD SCENE
     ======================================================================= */
  function createField(canvas) {
    let ctx = null;
    try { ctx = ctx2d(canvas, { alpha: false }); } catch (_) { ctx = null; }
    if (!ctx) return null;

    const CAM_H = 3.3, D_FAR = 1250, D_HAZE = 190;

    let W = 1, H = 1, dpr = 1, f = 1, hy = 0, cx = 0, small = false;
    let N = 60, STEP = 5, cols = 0, dNear = 8, lvl = LOW ? 1 : 0;
    let rowD = null, U = null, YS = null, TY = null, rowFill = [], cu = null, cv = null;
    let skyGrad = null, groundGrad = null, hazeGrad = null, landGrad = null, seaGrad = null, tintGrad = null;
    let p = .5, pT = .5, t = 3.2, raf = 0, last = 0, running = false, visible = true;
    let mx = 0, mxT = 0, my = 0, myT = 0, frames = 0, cost = 0;
    let onFrame = null;
    const cam = { x: 0, yaw: 0, cY: 1, sY: 0, h: CAM_H };
    const seaLights = [];

    /* ---------- sprites ---------- */
    function radial(sz, stops) {
      const c = document.createElement('canvas'); c.width = c.height = sz;
      const g = ctx2d(c), gr = g.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      stops.forEach(s => gr.addColorStop(s[0], s[1]));
      g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
      return c;
    }
    const SPR_AMBER = radial(64, [[0, 'rgba(255,246,226,1)'], [.12, 'rgba(255,210,140,.95)'], [.36, 'rgba(255,164,74,.3)'], [1, 'rgba(255,140,50,0)']]);
    const SPR_FLAME = radial(64, [[0, 'rgba(255,252,240,1)'], [.22, 'rgba(255,200,118,.92)'], [.55, 'rgba(255,140,52,.3)'], [1, 'rgba(255,120,40,0)']]);
    const SPR_TEAL = radial(128, [[0, 'rgba(231,247,251,.85)'], [.1, 'rgba(166,218,235,.42)'], [.42, 'rgba(27,113,148,.1)'], [1, 'rgba(27,113,148,0)']]);
    const SPR_MOON = (() => {
      const s = 96, c = document.createElement('canvas'); c.width = c.height = s;
      const g = ctx2d(c), r = s * .4;
      g.fillStyle = '#E7F4F7'; g.beginPath(); g.arc(s / 2, s / 2, r, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(s / 2 + r * .5, s / 2 - r * .22, r * .9, 0, TAU); g.fill();
      return c;
    })();
    /* daylight sprites: these are drawn with normal blending, so they carry their own colour */
    const SPR_SUN = radial(96, [[0, 'rgba(255,255,252,1)'], [.36, 'rgba(255,253,244,1)'], [.42, 'rgba(255,246,222,.9)'], [.5, 'rgba(255,240,210,0)'], [1, 'rgba(255,240,210,0)']]);
    const SPR_SUNGLOW = radial(128, [[0, 'rgba(255,255,255,1)'], [.12, 'rgba(255,251,238,.85)'], [.4, 'rgba(255,240,212,.3)'], [1, 'rgba(255,240,212,0)']]);
    const SPR_CLOUD = radial(64, [[0, 'rgba(255,255,255,.9)'], [.5, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
    const SPR_DOT = radial(32, [[0, 'rgba(21,95,128,1)'], [.42, 'rgba(21,95,128,.95)'], [.62, 'rgba(27,113,148,.3)'], [1, 'rgba(27,113,148,0)']]);
    const SPR_FLAME_DAY = radial(64, [[0, 'rgba(255,226,170,1)'], [.22, 'rgba(244,150,66,.95)'], [.55, 'rgba(232,112,44,.35)'], [1, 'rgba(232,112,44,0)']]);
    const SPR_HALO_DAY = radial(64, [[0, 'rgba(255,190,120,.5)'], [.4, 'rgba(255,190,120,.18)'], [1, 'rgba(255,190,120,0)']]);

    /* ---------- colour palettes: the night scene (dark mode) and the same field by day (light mode) ----------
       By day the glows use normal blending (additive light vanishes on a pale sky), the lamps become small
       teal markers, the flares are toned down, and the line work turns navy on land and deep teal at sea. */
    const PAL = {
      dark: {
        sky: [[0, '#192E49'], [.48, '#1C3555'], [.86, '#223E63'], [1, '#234B72']],
        ground: [[0, 33, 60, 96], [.05, 29, 54, 87], [.45, 26, 50, 81], [1, 18, 35, 58]],
        haze: [[0, 'rgba(35,75,114,0)'], [.42, 'rgba(35,75,114,.5)'], [1, 'rgba(33,60,96,0)']],
        glows: [['123,193,218', .14], ['27,113,148', .3], ['176,223,238', .2]],
        stars: '#DEF1F5', clouds: false, horizon: 'rgba(154,212,232,.16)',
        orb: SPR_MOON, orbK: 1, orbGlow: SPR_TEAL, orbGlowA: .55,
        land: ['rgb(179,193,201)', 'rgb(240,247,243)'], sea: ['rgb(22,83,118)', 'rgb(104,189,221)'],
        rim: 'rgba(178,219,232,', sil: '#192E49', wake: 'rgba(196,227,240,.26)',
        blend: 'lighter', lamp: SPR_AMBER, lampK: 1, flame: SPR_FLAME, halo: SPR_AMBER, haloA: .32,
        refl: '#FFB561', reflA: .7, shore: [['rgba(98,184,218,.16)', 7], ['rgba(229,246,249,.55)', 1.3]], tint: null
      },
      light: {
        sky: [[0, '#A3CDE2'], [.5, '#C6DEEC'], [.86, '#E1EBF3'], [1, '#EDF4F3']],
        ground: [[0, 233, 239, 240], [.05, 238, 240, 238], [.45, 244, 242, 236], [1, 248, 247, 242]],
        haze: [[0, 'rgba(236,242,243,0)'], [.42, 'rgba(236,242,243,.75)'], [1, 'rgba(230,237,238,0)']],
        glows: [['255,244,224', .55], ['27,113,148', .1], ['255,255,255', .6]],
        stars: null, clouds: true, horizon: 'rgba(25,46,73,.16)',
        orb: SPR_SUN, orbK: 2.4, orbGlow: SPR_SUNGLOW, orbGlowA: .95,
        land: ['rgb(86,110,134)', 'rgb(25,46,73)'], sea: ['rgb(27,113,148)', 'rgb(21,95,128)'],
        rim: 'rgba(25,46,73,', sil: '#EBF2F2', wake: 'rgba(21,95,128,.3)',
        blend: 'source-over', lamp: SPR_DOT, lampK: .7, flame: SPR_FLAME_DAY, halo: SPR_HALO_DAY, haloA: .5,
        refl: 'rgb(21,95,128)', reflA: .35, shore: [['rgba(27,113,148,.16)', 6], ['rgba(21,95,128,.6)', 1.2]],
        tint: [[0, 'rgb(201,220,235)'], [.4, 'rgb(213,227,240)'], [1, 'rgb(229,237,245)']]
      }
    };
    let C = PAL.dark;
    const pickPalette = () => { C = PAL[window.SAATheme && window.SAATheme.get() === 'light' ? 'light' : 'dark']; };
    pickPalette();

    /* fair-weather clouds for the day sky: fixed in the sky like the stars, drifting slowly */
    const CLOUDS = [[-1.6, .19, .3], [-1.12, .1, .2], [-.78, .25, .34], [-.3, .13, .24], [.12, .22, .3], [.5, .09, .18], [.86, .17, .28], [1.32, .24, .32], [1.7, .11, .22]];

    /* ---------- stars (fixed in the sky, so they turn with the camera) ---------- */
    let seed = 11;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const STARS = [];
    for (let i = 0; i < 280; i++) STARS.push({ az: -1.9 + rnd() * 3.8, el: .014 + Math.pow(rnd(), 1.2) * .5, r: rnd() < .07 ? 1.6 : .6 + rnd() * .7, ph: rnd() * TAU, sp: .6 + rnd() * 1.8 });

    /* ---------- terrain ---------- */
    const coastX = z => 6 + 7 * Math.sin(z * .011 + .5) + 3 * Math.sin(z * .037 + 2.2) + 1.2 * Math.sin(z * .093 + .7);
    const PADS = [];
    function landH(x, z) {
      // long sinuous crests with a gentle windward side and a steep slip face
      const v = z * .82 - x * .57;
      const u = x * .82 + z * .57 + 9 * Math.sin(v * .027 + .5) + 3.5 * Math.sin(v * .081 + 1.9);
      let s = u * .0135; s -= Math.floor(s);
      const pr = s < .8 ? sstep(s / .8) : 1 - sstep((s - .8) / .2);
      let s2 = u * .043 + v * .016; s2 -= Math.floor(s2);
      const p2 = s2 < .72 ? sstep(s2 / .72) : 1 - sstep((s2 - .72) / .28);
      let h = Math.pow(pr, 1.25) * (1.45 + .6 * Math.sin(v * .019 + u * .004)) + .3 * p2 + .3 * Math.sin(x * .011 + z * .007 + 1) + .3;
      h *= sstep(clamp((coastX(z) - x - 1) / 26)) * sstep(clamp((z - 4) / 46));   // flat beach, and flat ground where the camera stands
      for (let k = 0; k < PADS.length; k++) {                  // level pads under the structures
        const q = PADS[k], dx = x - q.x, dz = z - q.z;
        if (dx > q.r || dx < -q.r || dz > q.r || dz < -q.r) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 < q.r * q.r) h *= .1 + .9 * sstep(Math.sqrt(d2) / q.r);
      }
      return h;
    }
    const seaH = (x, z) => -.2 + .09 * Math.sin(x * .23 + z * .06 - t * 1.15) + .07 * Math.sin(z * .2 - x * .1 - t * .8 + 1.7) + .035 * Math.sin(x * .57 + z * .43 - t * 2.1);

    /* ---------- the field: world positions (x across, z away from the camera line) ---------- */
    const OBJ = [
      { k: 'pump', x: -118, z: 34, ph: 0, dir: 1 },
      { k: 'pump', x: -150, z: 72, ph: 2.2, dir: -1 },
      { k: 'pump', x: -94, z: 62, ph: 4.1, dir: 1 },
      { k: 'pump', x: -58, z: 104, ph: 1.3, dir: -1 },
      { k: 'pump', x: -178, z: 150, ph: 3.4, dir: 1 },
      { k: 'pump', x: -34, z: 192, ph: 5.2, dir: 1 },
      { k: 'pump', x: -214, z: 236, ph: .7, dir: -1 },
      { k: 'pump', x: -12, z: 120, ph: 2.9, dir: 1 },
      { k: 'rack', x: -198, x2: -102, z: 118 },
      { k: 'tank', x: -142, z: 252, r: 5.2, h: 6.4 },
      { k: 'tank', x: -127, z: 262, r: 4.2, h: 5.4 },
      { k: 'tank', x: -112, z: 256, r: 4.2, h: 5.4 },
      { k: 'flare', x: -204, z: 384, ph: 0 },
      { k: 'flare', x: -60, z: 470, ph: 2 },
      { k: 'plant', x: -118, z: 640 },
      { k: 'plant', x: -300, z: 840, s: .8 },
      { k: 'jetty', x: 0, x2: 20, z: 92 },
      { k: 'buoy', x: 30, z: 58, ph: 0 },
      { k: 'buoy', x: 128, z: 74, ph: 1.3 },
      { k: 'vessel', x: 52, z: 128, ph: 0, dir: 1 },
      { k: 'vessel', x: 146, z: 96, ph: 2, dir: -1 },
      { k: 'well', x: 32, z: 226 },
      { k: 'well', x: 156, z: 176 },
      { k: 'jacket', x: 94, z: 300 },
      { k: 'jacket', x: 210, z: 660, s: .85 },
      { k: 'well', x: 272, z: 520 },
      { k: 'jacket', x: 40, z: 820, s: .8 }
    ];
    OBJ.forEach(o => {
      if (o.k === 'jetty') { o.x = coastX(o.z) - 2; o.x2 += o.x; }
      o.sea = /jetty|buoy|vessel|well|jacket/.test(o.k);
      o.w = { pump: 6, rack: 60, tank: 6, flare: 4, plant: 40, jetty: 30, buoy: 2, vessel: 26, well: 7, jacket: 20 }[o.k];
      if (o.sea) return;
      if (o.k === 'rack') for (let x = o.x; x <= o.x2; x += 8) PADS.push({ x, z: o.z, r: 9 });
      else PADS.push({ x: o.x, z: o.z, r: o.k === 'plant' ? 46 : o.k === 'tank' ? o.r * 2.6 : 11 });
    });

    /* ---------- camera ---------- */
    function setCam(pp) {
      const e = sstep(clamp(pp));
      cam.x = lerp(-88, 100, e) + mx * 2.5;
      cam.yaw = lerp(-.52, .52, e) + mx * .03;
      cam.h = CAM_H + my * .3;
      cam.cY = Math.cos(cam.yaw); cam.sY = Math.sin(cam.yaw);
    }
    function proj(x, z, h) {
      const dx = x - cam.x, d = dx * cam.sY + z * cam.cY;
      if (d < 1) return null;
      const s = f / d;
      return { u: cx + (dx * cam.cY - z * cam.sY) * s, v: hy + (cam.h - h) * s, s, d };
    }
    function azX(az) {
      const a = az - cam.yaw;
      if (a <= -1.4) return -1e5; if (a >= 1.4) return 1e5;
      return cx + f * Math.tan(a);
    }

    /* ---------- sizing ---------- */
    let off = null, offCtx = null;
    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      small = W < 700;
      dpr = Math.min(window.devicePixelRatio || 1, small || LOW ? 1.5 : 2, Math.sqrt((small ? 2.4e6 : 4.4e6) / (W * H)));
      if (lvl >= 2) dpr = Math.min(dpr, 1);
      canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hy = Math.round(H * (small ? .47 : .5));
      cx = W / 2;
      f = Math.max(W * .72, H);
      N = Math.round((small ? 46 : 68) * [1, .78, .6][lvl]);
      STEP = (small ? 4 : 5) + [0, 1, 3][lvl];
      cols = Math.ceil(W / STEP) + 1;
      U = new Float32Array(cols);
      for (let c = 0; c < cols; c++) U[c] = (Math.min(W, c * STEP) - cx) / f;
      dNear = f * CAM_H / ((H - hy) * 1.05);
      rowD = new Float32Array(N);
      const i0 = 1 / D_FAR, i1 = 1 / dNear;
      for (let i = 0; i < N; i++) rowD[i] = 1 / (i0 + (i1 - i0) * Math.pow(i / (N - 1), 1.55));
      YS = new Float32Array(N * cols); TY = new Uint8Array(N * cols);
      cu = new Float32Array(N); cv = new Float32Array(N);
      colours();

      if (!off) { off = document.createElement('canvas'); offCtx = ctx2d(off); }
      off.width = canvas.width; off.height = Math.ceil(50 * dpr);
    }
    /* the gradients and row fills that depend on both the size and the colour mode */
    function colours() {
      // each row's occlusion band is filled with the ground colour at that row's height on screen
      const GS = C.ground;
      rowFill = [];
      for (let i = 0; i < N; i++) {
        const q = clamp((CAM_H * f / rowD[i]) / Math.max(1, H - hy));
        let k = 1; while (k < GS.length - 1 && GS[k][0] < q) k++;
        const A = GS[k - 1], B = GS[k], m = clamp((q - A[0]) / (B[0] - A[0]));
        rowFill.push('rgb(' + Math.round(lerp(A[1], B[1], m)) + ',' + Math.round(lerp(A[2], B[2], m)) + ',' + Math.round(lerp(A[3], B[3], m)) + ')');
      }

      skyGrad = ctx.createLinearGradient(0, 0, 0, hy);
      C.sky.forEach(([o, c]) => skyGrad.addColorStop(o, c));
      groundGrad = ctx.createLinearGradient(0, hy, 0, H);
      GS.forEach(([o, r, g, b]) => groundGrad.addColorStop(o, 'rgb(' + r + ',' + g + ',' + b + ')'));
      hazeGrad = ctx.createLinearGradient(0, hy - 18, 0, hy + 24);
      C.haze.forEach(([o, c]) => hazeGrad.addColorStop(o, c));
      if (C.tint) { tintGrad = ctx.createLinearGradient(0, hy, 0, H); C.tint.forEach(([o, c]) => tintGrad.addColorStop(o, c)); }
    }

    /* ---------- drawing helpers ---------- */
    const objA = d => clamp(1.05 - d / 900, .3, .95);
    function glowAt(spr, x, y, w, h, a) {
      ctx.globalCompositeOperation = C.blend;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    function lamp(P, lx, ly, k, sea, dir, base) {
      const x = P.u + lx * P.s * (dir || 1), y = P.v + ly * P.s;
      const size = clamp(4 + P.s * 1.6, 5, 26) * k * C.lampK;
      glowAt(C.lamp, x, y, size, size, .95 * Math.min(1, k + .2));
      if (sea) seaLights.push({ x, y, base: base == null ? P.v : base, d: P.d, a: Math.min(1, k + .1), s: P.s });
    }
    function begin(P, dir) {
      ctx.save(); ctx.translate(P.u, P.v); ctx.scale(P.s * (dir || 1), P.s);
      ctx.lineWidth = Math.min(1.7, .95 + P.s * .012) / P.s;
      ctx.strokeStyle = C.rim + objA(P.d).toFixed(3) + ')';
      ctx.fillStyle = C.sil;
    }
    function glow(x, rx, ry, rgb, a) {
      if (x < -rx || x > W + rx) return;
      ctx.save(); ctx.translate(x, hy); ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(.32, 'rgba(' + rgb + ',' + (a * .42).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 1.01);
      ctx.restore();
    }
    function stars() {
      ctx.fillStyle = C.stars;
      for (let i = 0; i < STARS.length; i++) {
        const s = STARS[i], a = s.az - cam.yaw;
        if (a < -1.2 || a > 1.2) continue;
        const x = cx + f * Math.tan(a);
        if (x < -2 || x > W + 2) continue;
        const y = hy - f * Math.tan(s.el);
        if (y < -2 || y > hy - 8) continue;
        ctx.globalAlpha = (.3 + .7 * (.5 + .5 * Math.sin(t * s.sp + s.ph))) * clamp((hy - y) / 140) * .85;
        ctx.fillRect(x, y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }
    function clouds() {
      for (const [az0, el, w] of CLOUDS) {
        const az = ((az0 + t * .0016 + 1.9) % 3.8 + 3.8) % 3.8 - 1.9;   // drift, wrapping round the sky
        const x = azX(az), cw = w * f, ch = cw * .14;
        if (x < -cw || x > W + cw) continue;
        const y = hy - f * Math.tan(el);
        glowAt(SPR_CLOUD, x, y, cw, ch, .75);
        glowAt(SPR_CLOUD, x - cw * .26, y + ch * .18, cw * .58, ch * .8, .6);
        glowAt(SPR_CLOUD, x + cw * .24, y + ch * .12, cw * .52, ch * .9, .6);
      }
    }

    /* ---------- structures (local units, y up is negative) ---------- */
    function pump(o, V) {
      const P = V.P, dir = o.dir || 1, ph = t * 1.35 + o.ph, th = .2 * Math.sin(ph);
      begin(P, dir);
      ctx.beginPath(); ctx.rect(-4.6, -.4, 9.9, .4); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1.35, -.4); ctx.lineTo(.1, -4.85); ctx.lineTo(1.25, -.4);
      ctx.moveTo(-.9, -1.9); ctx.lineTo(.82, -1.9); ctx.moveTo(-.58, -2.95); ctx.lineTo(.56, -2.95);
      ctx.stroke();
      const kx = -3.05, ky = -1.62, ca = -ph - Math.PI / 2;
      const pinx = kx + Math.cos(ca) * 1.05, piny = ky + Math.sin(ca) * 1.05;
      ctx.beginPath(); ctx.rect(-3.7, -2.05, 1.3, 1.65); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.arc(kx, ky, 1.45, ca + Math.PI - .55, ca + Math.PI + .55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-4.45, -1.15, .7, .75); ctx.fill(); ctx.stroke();
      const c = Math.cos(th), s = Math.sin(th), pvx = .1, pvy = -5;
      const fx = pvx + 3.75 * c, fy = pvy + 3.75 * s, bx = pvx - 2.95 * c, by = pvy - 2.95 * s;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(pinx, piny); ctx.moveTo(kx, ky); ctx.lineTo(pinx, piny); ctx.stroke();
      const nx = -s * .19, ny = c * .19;
      ctx.beginPath(); ctx.moveTo(bx - nx, by - ny); ctx.lineTo(fx - nx, fy - ny); ctx.lineTo(fx + nx, fy + ny); ctx.lineTo(bx + nx, by + ny); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(th);
      ctx.beginPath(); ctx.moveTo(-.3, -.5); ctx.quadraticCurveTo(1.25, -.42, 1.12, 1.35); ctx.lineTo(.62, 1.4); ctx.quadraticCurveTo(.66, .2, -.3, .22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      const ry = fy + 1.12 * s + 1.2 * c;
      ctx.beginPath(); ctx.moveTo(4.95, ry); ctx.lineTo(4.95, -1.15); ctx.stroke();
      ctx.beginPath(); ctx.rect(4.65, -1.15, .6, .75); ctx.fill(); ctx.stroke();
      ctx.restore();
      return P.v + 1;
    }

    function rack(o) {
      const n = Math.max(2, Math.round((o.x2 - o.x) / 7)), pts = [];
      for (let i = 0; i <= n; i++) {
        const x = lerp(o.x, o.x2, i / n), P = proj(x, o.z, landH(x, o.z));
        if (P && P.d > dNear * .7 && P.u > -200 && P.u < W + 200) pts.push(P);
      }
      if (pts.length < 2) return hy;
      const dm = pts[pts.length >> 1].d;
      ctx.lineWidth = 1; ctx.strokeStyle = C.rim + objA(dm).toFixed(3) + ')';
      let maxV = hy;
      ctx.beginPath();
      for (const P of pts) {
        const t1 = P.v - 4.3 * P.s, t2 = P.v - 2.7 * P.s, w = .95 * P.s;
        ctx.moveTo(P.u, P.v); ctx.lineTo(P.u, t1);
        ctx.moveTo(P.u - w, t1); ctx.lineTo(P.u + w, t1);
        ctx.moveTo(P.u - w * .8, t2); ctx.lineTo(P.u + w * .8, t2);
        ctx.moveTo(P.u, t1 + .9 * P.s); ctx.lineTo(P.u + w, t1);
        if (P.v > maxV) maxV = P.v;
      }
      ctx.stroke();
      [[4.62, 1], [4.98, .8], [3.02, .65]].forEach(([hh, a]) => {
        ctx.globalAlpha = a; ctx.beginPath();
        pts.forEach((P, i) => { const y = P.v - hh * P.s; i ? ctx.lineTo(P.u, y) : ctx.moveTo(P.u, y); });
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      const m = pts.length >> 1, A = pts[m], B = pts[m + 1];
      if (B) {   // expansion loop
        const ax = lerp(A.u, B.u, .2), bx = lerp(A.u, B.u, .8);
        const ay = lerp(A.v - 4.98 * A.s, B.v - 4.98 * B.s, .2), by = lerp(A.v - 4.98 * A.s, B.v - 4.98 * B.s, .8);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 2.6 * A.s); ctx.lineTo(bx, by - 2.6 * B.s); ctx.lineTo(bx, by); ctx.stroke();
      }
      pts.forEach((P, i) => { if (i % 3 === 1) lamp(P, 0, -4.3, .5, false); });
      return maxV;
    }

    function tank(o, V) {
      const P = V.P, r = o.r, h = o.h;
      begin(P);
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r, -h); ctx.quadraticCurveTo(0, -h - r * .42, r, -h); ctx.lineTo(r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = .5;
      ctx.beginPath(); for (let k = 1; k < 4; k++) { const y = -h * k / 4; ctx.moveTo(-r, y); ctx.lineTo(r, y); }
      ctx.moveTo(-r * .9, 0); ctx.lineTo(r * .55, -h); ctx.stroke();
      ctx.restore();
      lamp(P, 0, -h - r * .26, .55, false);
      return P.v + 1;
    }

    function flare(o, V) {
      const P = V.P, Hh = 32;
      begin(P);
      ctx.beginPath();
      ctx.moveTo(-1.6, 0); ctx.lineTo(-.35, -Hh); ctx.moveTo(1.6, 0); ctx.lineTo(.35, -Hh);
      for (let k = 0; k < 9; k++) {
        const y0 = -k * Hh / 9, y1 = -(k + 1) * Hh / 9, w0 = lerp(1.6, .35, k / 9), w1 = lerp(1.6, .35, (k + 1) / 9);
        ctx.moveTo(k % 2 ? w0 : -w0, y0); ctx.lineTo(k % 2 ? -w1 : w1, y1);
      }
      ctx.moveTo(0, -Hh); ctx.lineTo(0, -Hh - 1.8);
      ctx.stroke();
      ctx.restore();
      const fl = 1 + .16 * Math.sin(t * 9 + o.ph) + .09 * Math.sin(t * 15.7 + o.ph * 2);
      const fx = P.u, fy = P.v - (Hh + 3) * P.s, sz = clamp(7 * P.s, 7, 44) * fl;
      glowAt(C.halo, fx, fy, sz * 5, sz * 5, C.haloA);
      glowAt(C.flame, fx, fy - sz * .2, sz * .7, sz * 1.45, .95);
      lamp(P, 0, -Hh * .52, .42, false);
      return P.v + 1;
    }

    const COLS = [[-24, 2.2, 20], [-19, 1.6, 30], [-14, 2.6, 17], [-7, 1.5, 36], [-3, 2.2, 26], [3, 3.2, 14], [9, 1.7, 22], [13, 1.2, 28]];
    function plant(o, V) {
      const P = V.P, k = o.s || 1;
      begin(P); ctx.scale(k, k);
      ctx.beginPath();
      for (const [x, w, h] of COLS) { ctx.moveTo(x - w / 2, 0); ctx.lineTo(x - w / 2, -h + w / 2); ctx.arc(x, -h + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w / 2, 0); }
      ctx.rect(17, -6, 8, 6); ctx.rect(27, -5, 7, 5); ctx.rect(-30, -4, 5, 4);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-27, -8); ctx.lineTo(35, -8); ctx.moveTo(-27, -9.4); ctx.lineTo(35, -9.4); ctx.stroke();
      ctx.restore();
      COLS.forEach(([x, , h], i) => lamp(P, x * k, -(h + .6) * k, .42 + .2 * Math.sin(t * 1.6 + i * 1.9), false));
      lamp(P, 21 * k, -6.4 * k, .35, false); lamp(P, -12 * k, -9.4 * k, .3, false); lamp(P, 6 * k, -9.4 * k, .3, false);
      return P.v + 1;
    }

    function jacket(o, V) {
      const P = V.P, k = o.s || 1;
      begin(P); ctx.scale(k, k);
      const xo = y => 9.5 - (.6 - y) * .236, xi = y => 3.4 - (.6 - y) * .085;
      ctx.beginPath();
      ctx.moveTo(-9.5, .6); ctx.lineTo(-7, -10); ctx.moveTo(9.5, .6); ctx.lineTo(7, -10);
      ctx.moveTo(-3.4, .6); ctx.lineTo(-2.5, -10); ctx.moveTo(3.4, .6); ctx.lineTo(2.5, -10);
      for (const [y0, y1] of [[.3, -4.8], [-4.8, -10]]) {
        for (const g of [-1, 1]) { ctx.moveTo(g * xo(y0), y0); ctx.lineTo(g * xi(y1), y1); ctx.moveTo(g * xi(y0), y0); ctx.lineTo(g * xo(y1), y1); }
        ctx.moveTo(-xi(y0), y0); ctx.lineTo(xi(y1), y1); ctx.moveTo(xi(y0), y0); ctx.lineTo(-xi(y1), y1);
        ctx.moveTo(-xo(y1), y1); ctx.lineTo(xo(y1), y1);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.rect(-9, -11.8, 18, 1.8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-8.4, -15.6, 16.8, 3.8); ctx.rect(-7.6, -19.2, 5.8, 3.6); ctx.rect(-.6, -21, 6.4, 5.4); ctx.rect(5.8, -17.8, 2.6, 2.2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8.4, -15.6); ctx.lineTo(-15, -15.9); ctx.lineTo(-15, -16.6); ctx.lineTo(-8.4, -16.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8.4, -12); ctx.lineTo(-14, -15.9);
      ctx.moveTo(-6.6, -19.2); ctx.lineTo(-4.6, -36); ctx.lineTo(-2.6, -19.2);
      for (let q = 1; q < 6; q++) { const y = -19.2 - q * 2.9, w = lerp(2, .25, q / 5.8); ctx.moveTo(-4.6 - w, y); ctx.lineTo(-4.6 + w, y); }
      ctx.moveTo(7.1, -17.8); ctx.lineTo(7.1, -21.5); ctx.lineTo(15.5, -29); ctx.lineTo(15.5, -23.5);
      ctx.moveTo(8.4, -13); ctx.lineTo(19, -22.5);
      ctx.stroke();
      ctx.restore();
      const L = (x, y, kk) => lamp(P, x * k, y * k, kk, true);
      for (let x = -8; x <= 8; x += 4) L(x, -11.8, .5);
      L(-4.6, -36.4, .85); L(15.5, -29.3, .6); L(-15, -16.6, .45); L(2.6, -21.2, .5); L(-4.6, -27, .4); L(-6, -15.6, .35); L(6, -15.6, .35);
      const fl = 1 + .2 * Math.sin(t * 10 + o.x), fx = P.u + 19.6 * P.s * k, fy = P.v - 23.6 * P.s * k, sz = clamp(4 * P.s * k, 6, 30) * fl;
      glowAt(C.flame, fx, fy, sz * .7, sz * 1.4, .95);
      seaLights.push({ x: fx, y: fy, base: P.v, d: P.d, a: 1, s: P.s });
      return P.v + 1;
    }

    function well(o, V) {
      const P = V.P;
      begin(P);
      ctx.beginPath();
      ctx.moveTo(-3.4, .5); ctx.lineTo(-2.6, -6.4); ctx.moveTo(3.4, .5); ctx.lineTo(2.6, -6.4);
      ctx.moveTo(-3.3, -.1); ctx.lineTo(2.9, -3.2); ctx.moveTo(3.3, -.1); ctx.lineTo(-2.9, -3.2);
      ctx.moveTo(-2.9, -3.2); ctx.lineTo(2.9, -3.2); ctx.moveTo(-2.9, -3.2); ctx.lineTo(2.65, -6.2); ctx.moveTo(2.9, -3.2); ctx.lineTo(-2.65, -6.2);
      ctx.stroke();
      ctx.beginPath(); ctx.rect(-3.6, -7.4, 7.2, 1.1); ctx.rect(-2.8, -9.6, 3.8, 2.2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -9.6); ctx.lineTo(1, -10.4); ctx.lineTo(5.4, -10.6); ctx.lineTo(5.4, -11.1); ctx.lineTo(1, -11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -9.6); ctx.lineTo(-2, -13.5); ctx.stroke();
      ctx.restore();
      const blink = Math.sin(t * 2.2 + o.x) > .1 ? 1 : .3;
      lamp(P, -2, -13.7, .75 * blink, true); lamp(P, -3.4, -7.4, .4, true); lamp(P, 3.4, -7.4, .4, true);
      return P.v + 1;
    }

    function vessel(o, V) {
      const P = V.P, dir = o.dir || 1;
      ctx.save(); ctx.translate(P.u, P.v); ctx.scale(P.s * dir, P.s);
      ctx.lineWidth = 1 / P.s; ctx.strokeStyle = C.wake;
      ctx.beginPath(); ctx.moveTo(-9, .1); ctx.lineTo(-30, -.1); ctx.moveTo(-9, .3); ctx.lineTo(-24, 1.1); ctx.stroke();
      ctx.restore();
      begin(P, dir);
      ctx.beginPath(); ctx.moveTo(-9, .3); ctx.lineTo(-9, -1.5); ctx.lineTo(4.8, -1.5); ctx.lineTo(8.2, -2.9); ctx.lineTo(9, -2.9); ctx.lineTo(7.4, .3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(2.2, -5, 3.6, 3.5); ctx.rect(2.7, -5.9, 2.6, .9); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, -5.9); ctx.lineTo(4, -8.6); ctx.moveTo(3.2, -7.6); ctx.lineTo(4.8, -7.6); ctx.moveTo(-8.6, -1.5); ctx.lineTo(-8.6, -2.6); ctx.lineTo(1.6, -2.6); ctx.stroke();
      ctx.restore();
      lamp(P, 4, -8.8, .7, true, dir); lamp(P, 3, -3.9, .32, true, dir); lamp(P, 4.1, -3.9, .32, true, dir); lamp(P, 5.2, -3.9, .32, true, dir); lamp(P, -8.8, -1.8, .4, true, dir);
      return P.v + 1;
    }

    function buoy(o, V) {
      const P = V.P, bob = Math.sin(t * 1.6 + o.ph) * .14;
      const Q = { u: P.u, v: P.v + bob * P.s, s: P.s, d: P.d };
      begin(Q);
      ctx.beginPath(); ctx.moveTo(-.36, .15); ctx.lineTo(-.28, -.3); ctx.lineTo(.28, -.3); ctx.lineTo(.36, .15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-.2, -.3); ctx.lineTo(-.08, -1.1); ctx.lineTo(.08, -1.1); ctx.lineTo(.2, -.3); ctx.moveTo(-.14, -.7); ctx.lineTo(.14, -.7); ctx.stroke();
      ctx.restore();
      if ((t + o.ph) % 2.8 < .55) lamp(Q, 0, -1.25, .8, true);
      return Q.v + 1;
    }

    function jetty(o) {
      const n = Math.max(2, Math.round((o.x2 - o.x) / 3)), pts = [];
      for (let i = 0; i <= n; i++) {
        const x = lerp(o.x, o.x2, i / n), P = proj(x, o.z, 1.3);
        if (P && P.d > dNear * .7 && P.u > -100 && P.u < W + 100) pts.push(P);
      }
      if (pts.length < 2) return hy;
      const dm = pts[pts.length >> 1].d;
      ctx.lineWidth = 1; ctx.strokeStyle = C.rim + objA(dm).toFixed(3) + ')';
      let maxV = hy;
      ctx.beginPath();
      for (const P of pts) { const wv = P.v + 1.5 * P.s; ctx.moveTo(P.u, P.v); ctx.lineTo(P.u, wv); if (wv > maxV) maxV = wv; }
      pts.forEach((P, i) => i ? ctx.lineTo(P.u, P.v) : ctx.moveTo(P.u, P.v));
      pts.forEach((P, i) => i ? ctx.lineTo(P.u, P.v - .9 * P.s) : ctx.moveTo(P.u, P.v - .9 * P.s));
      ctx.stroke();
      const E = pts[pts.length - 1];
      lamp(E, 0, -1.6, .75, true, 1, E.v + 1.5 * E.s);
      return maxV;
    }

    const DRAW = { pump, rack, tank, flare, plant, jacket, well, vessel, buoy, jetty };

    /* ---------- reflections of the sea lights on the wave lines ---------- */
    function reflections() {
      if (!seaLights.length) return;
      ctx.globalCompositeOperation = C.blend;
      ctx.strokeStyle = C.refl;
      for (const L of seaLights) {
        const c0 = Math.round(L.x / STEP);
        if (c0 < 2 || c0 > cols - 3) continue;
        const reach = Math.min(H * .32, (L.base - L.y) * 1.7 + 26);
        const span = Math.max(1, Math.round((1.5 + L.s * .9) / STEP));
        for (let i = 0; i < N; i++) {
          if (rowD[i] >= L.d) continue;
          const b = i * cols;
          if (TY[b + c0]) continue;
          const dy = YS[b + c0] - L.base;
          if (dy < 0 || dy > reach) continue;
          const q = 1 - dy / reach;
          const fl = .5 + .5 * Math.sin(t * 3.1 + i * 1.7 + L.x * .05);
          ctx.globalAlpha = Math.min(1, L.a * C.reflA * q * fl);
          ctx.lineWidth = 1.2 + q;
          const w = Math.max(1, Math.round(span * (.5 + q * .7)));
          const a0 = Math.max(0, c0 - w), a1 = Math.min(cols - 1, c0 + w);
          ctx.beginPath(); ctx.moveTo(Math.min(W, a0 * STEP), YS[b + a0]);
          for (let k = a0 + 1; k <= a1; k++) ctx.lineTo(Math.min(W, k * STEP), YS[b + k]);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- heat shimmer over the far desert ---------- */
    function shimmer(iRow) {
      if (REDUCE || !off) return;
      const b = iRow * cols;
      let cS = cols;
      for (let c = 0; c < cols; c++) if (!TY[b + c]) { cS = c; break; }
      const sx = Math.min(W, cS * STEP);
      if (sx < 24) return;
      const top = hy - 34, hgt = 46;
      const sw = Math.min(canvas.width, Math.ceil(sx * dpr)), sy = Math.max(0, Math.floor(top * dpr)), sh = Math.min(off.height, Math.ceil(hgt * dpr));
      offCtx.clearRect(0, 0, sw, sh);
      offCtx.drawImage(canvas, 0, sy, sw, sh, 0, 0, sw, sh);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const strip = Math.max(1, Math.round(2 * dpr));
      for (let y = 0; y < sh; y += strip) {
        const yy = y / dpr + top;
        const env = Math.exp(-Math.pow((yy - (hy - 6)) / 13, 2));
        const dx = (Math.sin(yy * .85 + t * 6.3) * .7 + Math.sin(yy * 2.3 - t * 9.4) * .3) * 2.4 * env * dpr;
        if (Math.abs(dx) < .2) continue;
        ctx.drawImage(off, 0, y, sw, strip, dx, sy + y, sw, strip);
      }
      ctx.restore();
    }

    /* ---------- one frame ---------- */
    const vis = [];
    function draw() {
      setCam(p);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';

      // sky, twilight glows, stars, moon (by day: haze, clouds and the sun)
      ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, hy + 1);
      const gA = azX(-.42), gB = azX(.4), G = C.glows;
      glow(gA, W * .6, H * .3, G[0][0], G[0][1]);
      glow(gB, W * .8, H * .44, G[1][0], G[1][1]);
      glow(gB, W * .3, H * .07, G[2][0], G[2][1]);
      if (C.stars) stars();
      if (C.clouds) clouds();
      const mxs = azX(-.5);
      if (mxs > -60 && mxs < W + 60) {
        const myy = hy - f * Math.tan(.2), ms = clamp(W * .018, 18, 28);
        glowAt(C.orbGlow, mxs, myy, ms * 9, ms * 9, C.orbGlowA);
        const os = ms * C.orbK;
        ctx.drawImage(C.orb, mxs - os / 2, myy - os / 2, os, os);
      }
      ctx.fillStyle = C.horizon; ctx.fillRect(0, hy - 1, W, 1.5);

      // ground
      ctx.fillStyle = groundGrad; ctx.fillRect(0, hy, W, H - hy);
      landGrad = ctx.createLinearGradient(gA - W * .75, 0, gA + W * .75, 0);
      landGrad.addColorStop(0, C.land[0]); landGrad.addColorStop(.5, C.land[1]); landGrad.addColorStop(1, C.land[0]);
      seaGrad = ctx.createLinearGradient(gB - W * .6, 0, gB + W * .6, 0);
      seaGrad.addColorStop(0, C.sea[0]); seaGrad.addColorStop(.5, C.sea[1]); seaGrad.addColorStop(1, C.sea[0]);

      // which structures are in view, far to near
      vis.length = 0;
      for (let k = 0; k < OBJ.length; k++) {
        const o = OBJ[k];
        if (o.k === 'rack' || o.k === 'jetty') {
          const P = proj((o.x + o.x2) / 2, o.z, 0);
          if (P && P.d < D_FAR) vis.push({ o, d: P.d, P: null });
          continue;
        }
        const x = o.k === 'vessel' ? o.x + Math.sin(t * .021 + o.ph) * 12 * (o.dir || 1) : o.x;
        const P = proj(x, o.z, o.sea ? -.2 : landH(x, o.z));
        if (!P || P.d < dNear * .7 || P.d > D_FAR) continue;
        const half = o.w * P.s * (o.s || 1);
        if (P.u < -half - 40 || P.u > W + half + 40) continue;
        vis.push({ o, d: P.d, P });
      }
      vis.sort((a, b) => b.d - a.d);
      seaLights.length = 0;

      let oi = 0, below = hy, farDone = false;
      const camX = cam.x, sY = cam.sY, cY = cam.cY, ch = cam.h;
      for (let i = 0; i < N; i++) {
        const d = rowD[i];
        while (oi < vis.length && vis[oi].d > d) { const V = vis[oi++], yb = DRAW[V.o.k](V.o, V); if (yb > below) below = yb; }
        if (!farDone && d < D_HAZE) {
          farDone = true;
          shimmer(Math.max(0, i - 3));
          ctx.fillStyle = hazeGrad; ctx.fillRect(0, hy - 18, W, 42);
        }
        const base = i * cols, fd = f / d;
        let maxY = -1e9;
        for (let c = 0; c < cols; c++) {
          const xc = U[c] * d, xw = camX + xc * cY + d * sY, zw = d * cY - xc * sY;
          const land = xw < coastX(zw);
          const y = hy + (ch - (land ? landH(xw, zw) : seaH(xw, zw))) * fd;
          YS[base + c] = y; TY[base + c] = land ? 1 : 0;
          if (y > maxY) maxY = y;
        }
        // occlusion: paint the ground over everything already drawn behind this line
        const floor = Math.min(H + 2, Math.max(below, maxY) + 3);
        ctx.beginPath(); ctx.moveTo(0, YS[base]);
        for (let c = 1; c < cols; c++) ctx.lineTo(Math.min(W, c * STEP), YS[base + c]);
        ctx.lineTo(W, floor); ctx.lineTo(0, floor); ctx.closePath();
        ctx.fillStyle = rowFill[i]; ctx.fill();
        if (maxY > below) below = maxY;
        if (C.tint) {   // by day the sea is tinted (seaTint): note where this line crosses the coast
          let c = 0; while (c < cols && TY[base + c]) c++;
          if (c === 0 || c === cols) { cu[i] = c ? W : 0; cv[i] = YS[base + Math.min(c, cols - 1)]; }
          else {
            const g = k => { const xc = U[k] * d; return coastX(d * cY - xc * sY) - (camX + xc * cY + d * sY); };
            const g0 = g(c - 1), m = g0 / (g0 - g(c));
            cu[i] = Math.min(W, (c - 1 + m) * STEP); cv[i] = lerp(YS[base + c - 1], YS[base + c], m);
          }
        }
        // the contour line itself: one run per land / sea stretch
        const n = i / (N - 1), major = (N - 1 - i) % 6 === 0;
        const a = (.05 + .64 * Math.pow(n, .9)) * (major ? 1.55 : 1);
        ctx.lineWidth = (.75 + .75 * n) * (major ? 1.25 : 1);
        let c0 = 0, ty = TY[base];
        for (let c = 1; c <= cols; c++) {
          if (c < cols && TY[base + c] === ty) continue;
          const end = Math.min(c, cols - 1);
          ctx.beginPath(); ctx.moveTo(Math.min(W, c0 * STEP), YS[base + c0]);
          for (let k = c0 + 1; k <= end; k++) ctx.lineTo(Math.min(W, k * STEP), YS[base + k]);
          ctx.strokeStyle = ty ? landGrad : seaGrad;
          ctx.globalAlpha = Math.min(1, ty ? a : a * 1.2);
          ctx.stroke();
          if (c < cols) { c0 = c; ty = TY[base + c]; }
        }
        ctx.globalAlpha = 1;
      }
      while (oi < vis.length) { const V = vis[oi++]; DRAW[V.o.k](V.o, V); }
      if (C.tint) seaTint();
      shoreline();
      reflections();
    }

    /* by day: a soft blue wash over the sea side of the coast. Multiplied, so the line work stays crisp;
       the structures are filled with the horizon colour, so they read as line drawings on either side of it */
    function seaTint() {
      ctx.beginPath(); ctx.moveTo(W, hy); ctx.lineTo(cu[0], hy);
      for (let i = 0; i < N; i++) ctx.lineTo(cu[i], cv[i]);
      ctx.lineTo(cu[N - 1], H); ctx.lineTo(W, H); ctx.closePath();
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tintGrad; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* the coast itself: a bright surf line running from the foreground to the horizon */
    function shoreline() {
      ctx.beginPath();
      let started = false, n = 0;
      for (let k = 0; k <= 64; k++) {
        const z = 2 + Math.pow(k / 64, 2.2) * (D_FAR - 2);
        const P = proj(coastX(z) + .6, z, -.12);
        if (!P || P.d < dNear * .55) { started = false; continue; }
        if (P.u < -400 || P.u > W + 400) { started = false; continue; }
        started ? ctx.lineTo(P.u, P.v) : ctx.moveTo(P.u, P.v); started = true; n++;
      }
      if (n < 2) return;
      ctx.globalCompositeOperation = C.blend;
      for (const [c, w] of C.shore) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- loop ---------- */
    function adapt(ms) {
      if (lvl >= 2) return;
      frames++; cost += ms;
      if (frames >= 45) {
        const avg = cost / frames; frames = 0; cost = 0;
        if (avg > 26) { lvl++; resize(); }
      }
    }
    function loop(now) {
      raf = 0;
      if (!running || !visible || document.hidden) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
      t += dt;
      p += (pT - p) * (1 - Math.exp(-dt * 7));
      if (Math.abs(pT - p) < .0003) p = pT;
      mx += (mxT - mx) * (1 - Math.exp(-dt * 2.4)); my += (myT - my) * (1 - Math.exp(-dt * 2.4));
      const c0 = performance.now();
      draw();
      adapt(performance.now() - c0);
      if (onFrame) onFrame(p);
      raf = requestAnimationFrame(loop);
    }
    function kick() { if (running && !raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } }
    /* Draw only while the canvas is on screen. Calls in the same frame (resize, refresh, jump)
       collapse into one draw, and an off-screen canvas waits until it scrolls into view. */
    let dirty = false, praf = 0;
    function paint() {
      if (!visible) { dirty = true; return; }
      if (raf || praf) return;
      praf = requestAnimationFrame(() => { praf = 0; dirty = false; draw(); });
    }
    /* after a resize the canvas is blank: redraw at once if it is on screen */
    function paintNow() { if (visible) { dirty = false; draw(); } else dirty = true; }

    resize();
    { const r = canvas.getBoundingClientRect(); visible = r.bottom > -80 && r.top < innerHeight + 80; }
    paint();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        visible = es[0].isIntersecting;
        if (visible) { kick(); if (dirty) paint(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { rootMargin: '80px 0px' }).observe(canvas);
    }
    document.addEventListener('visibilitychange', kick);
    /* the header switch changes the colour mode live: rebuild the palette's gradients and repaint (also the reduced-motion still frame) */
    document.addEventListener('saa:theme', () => { pickPalette(); colours(); paintNow(); });
    let rt = 0, lastW = W, lastH = H;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const r = canvas.getBoundingClientRect();
        if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 90) return;   // ignore mobile toolbar jitter
        lastW = r.width; lastH = r.height; resize(); paintNow();
      }, 140);
    });
    if (FINE && !REDUCE) {
      const stage = canvas.parentElement;
      stage.addEventListener('pointermove', e => {
        const r = stage.getBoundingClientRect();
        mxT = ((e.clientX - r.left) / r.width - .5) * 2; myT = ((e.clientY - r.top) / r.height - .5) * 2;
      });
      stage.addEventListener('pointerleave', () => { mxT = 0; myT = 0; });
    }

    return {
      start() { if (REDUCE) return; running = true; kick(); },
      set(v) { pT = clamp(v); if (!running) { p = pT; paint(); } },
      jump(v) { p = pT = clamp(v); paint(); },
      resize() { const r = canvas.getBoundingClientRect(); lastW = r.width; lastH = r.height; resize(); paintNow(); },
      onFrame(fn) { onFrame = fn; },
      render(v, tt) { p = pT = clamp(v); if (tt != null) t = tt; draw(); }
    };
  }

  /* =======================================================================
     2. SECTOR ACCORDION
     ======================================================================= */
  function initAccordion(onChange) {
    const items = [...document.querySelectorAll('.acc-item')];
    if (!items.length) return null;
    const btns = items.map(it => it.querySelector('.acc-btn'));
    document.querySelectorAll('.acc-art svg path, .acc-art svg circle, .acc-art svg rect, .svg-defs path, .svg-defs circle')
      .forEach(el => el.setAttribute('pathLength', '1'));

    function set(it, open) {
      const btn = it.querySelector('.acc-btn'), panel = it.querySelector('.acc-panel');
      it.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) panel.removeAttribute('inert'); else panel.setAttribute('inert', '');
    }
    items.forEach(it => set(it, it.classList.contains('is-open')));

    items.forEach((it, k) => {
      const panel = it.querySelector('.acc-panel');
      btns[k].addEventListener('click', () => {
        const open = !it.classList.contains('is-open');
        items.forEach(o => { if (o !== it && o.classList.contains('is-open')) set(o, false); });
        set(it, open);
        if (onChange) onChange(it, open);
      });
      btns[k].addEventListener('keydown', e => {
        const map = { ArrowDown: k + 1, ArrowUp: k - 1, Home: 0, End: btns.length - 1 };
        if (!(e.key in map)) return;
        e.preventDefault();
        btns[(map[e.key] + btns.length) % btns.length].focus();
      });
      panel.addEventListener('transitionend', e => {
        if (e.target === panel && e.propertyName === 'grid-template-rows' && onChange) onChange(it, it.classList.contains('is-open'), true);
      });
    });
    return items;
  }

  /* =======================================================================
     boot
     ======================================================================= */
  const fieldSec = document.querySelector('.field');
  const canvas = document.getElementById('fieldCanvas');
  let scene = null;
  try { scene = canvas ? createField(canvas) : null; } catch (err) { scene = null; }
  if (canvas && scene) canvas._scene = scene;   // handle for automated visual checks
  if (fieldSec) {
    fieldSec.querySelectorAll('.ft-end').forEach(e => e.classList.add('is-on'));
    if (scene) scene.start();
  }

  let refreshT = 0, lenisRef = null;
  const refresh = () => { clearTimeout(refreshT); refreshT = setTimeout(() => { window.ScrollTrigger && window.ScrollTrigger.refresh(); }, 60); };
  function drawArt(it) {
    const g = window.gsap;
    if (REDUCE || !g) return;
    const svg = it.querySelector('.acc-art svg');
    if (!svg) return;
    const els = svg.querySelectorAll('path, circle:not(.dot), rect, use');
    g.killTweensOf(els);
    g.fromTo(els, { strokeDasharray: 1, strokeDashoffset: 1 }, {
      strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', stagger: .022, delay: .18,
      onComplete() { g.set(els, { clearProps: 'strokeDasharray,strokeDashoffset' }); }
    });
    const dots = svg.querySelectorAll('.dot');
    if (dots.length) g.fromTo(dots, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: .8, ease: 'back.out(2)', stagger: .08, delay: .9, clearProps: 'transform' });
  }
  initAccordion((it, open, settled) => {
    if (settled) {
      refresh();
      if (open) {
        const top = it.getBoundingClientRect().top;
        if (top < 70) {
          const y = scrollY + top - 96;
          lenisRef ? lenisRef.scrollTo(y) : scrollTo({ top: y, behavior: REDUCE ? 'auto' : 'smooth' });
        }
      }
      return;
    }
    if (open) drawArt(it);
  });

  if (!window.SAA) return;
  window.SAA.ready(({ gsap, ScrollTrigger, lenis, reduce }) => {
    lenisRef = lenis;
    if (!ScrollTrigger) return;
    const mm = gsap.matchMedia();

    /* --- hero --- */
    const hero = document.querySelector('.svc-hero');
    if (hero && !reduce) {
      gsap.from(['.sh-lead', '.sh-cta', '.sh-jump a', '.sh-meta > div'], { y: 36, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .05, delay: .45, clearProps: 'opacity,transform' });
      gsap.from('.sh-horizon', { opacity: 0, y: 20, duration: 1.4, ease: 'expo.out', delay: .8, clearProps: 'opacity,transform' });
      gsap.to('.sh-wrap', { yPercent: -12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.sh-stars', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }

    /* --- signature: pinned onshore-to-offshore scene --- */
    if (fieldSec && scene && !reduce) {
      const caps = [...fieldSec.querySelectorAll('.fcap')];
      const ends = [...fieldSec.querySelectorAll('.ft-end')];
      const track = fieldSec.querySelector('.field-track');
      const hint = fieldSec.querySelector('.field-hint');
      const parts = c => c.querySelectorAll('.fcap-label, .fcap-title, .fcap-text');
      const OPEN = 'inset(-20% -4% -30% -4%)', SHUT_TOP = 'inset(-20% -4% 100% -4%)', SHUT_BOT = 'inset(100% -4% -30% -4%)';
      let cur = -1;
      function setCap(i, instant) {
        if (i === cur) return;
        const dir = i > cur ? 1 : -1, prev = caps[cur], next = caps[i];
        cur = i;
        caps.forEach((c, k) => c.classList.toggle('is-on', k === i));
        ends.forEach((e, k) => e.classList.toggle('is-on', k === i));
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
          { clipPath: OPEN, y: 0, duration: 1, delay: .2, stagger: .06, ease: 'expo.out', overwrite: true, clearProps: 'clipPath' });
      }

      mm.add('(min-height: 500px)', () => {
        fieldSec.classList.add('is-live');
        scene.resize();
        cur = -1; setCap(0, true);
        scene.onFrame(v => { track.style.setProperty('--p', v.toFixed(4)); });
        const capFor = v => (v < .5 ? 0 : 1);
        ScrollTrigger.create({
          trigger: fieldSec, start: 'top top', end: () => '+=' + Math.round(innerHeight * (innerWidth < 861 ? 2.4 : 3)),
          pin: true, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: s => { scene.set(s.progress); setCap(capFor(s.progress)); hint.style.opacity = s.progress > .03 ? '0' : '1'; },
          onRefresh: s => { scene.resize(); scene.jump(s.progress); track.style.setProperty('--p', s.progress.toFixed(4)); cur = -1; setCap(capFor(s.progress), true); }
        });
        ScrollTrigger.sort();
        return () => {
          fieldSec.classList.remove('is-live');
          scene.onFrame(null);
          caps.forEach(c => { c.classList.remove('is-on'); gsap.killTweensOf(parts(c)); gsap.set(c, { clearProps: 'opacity' }); gsap.set(parts(c), { clearProps: 'clipPath,transform' }); });
          ends.forEach(e => e.classList.add('is-on'));
          track.style.removeProperty('--p');
          scene.resize(); scene.jump(.5);
        };
      });
    }

    /* --- sectors: the open sector's art draws in when it arrives --- */
    const firstOpen = document.querySelector('.acc-item.is-open');
    if (firstOpen && !reduce) {
      ScrollTrigger.create({ trigger: firstOpen, start: 'top 94%', once: true, onEnter: () => drawArt(firstOpen) });
      gsap.from('.acc-item', { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .07, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.acc', start: 'top 85%', once: true } });
    }

    /* --- how we deliver: progress line --- */
    const sw = document.querySelector('.steps-body');
    if (sw && !reduce) {
      const wrap = sw.closest('.steps-wrap');
      wrap.classList.add('is-live');
      const steps = [...sw.querySelectorAll('.step')];
      const trackEl = sw.querySelector('.rail-track');
      let marks = steps.map((_, k) => (k + .2) / steps.length);
      const measure = () => {
        const h = trackEl.offsetHeight || 1, top0 = trackEl.offsetTop;
        marks = steps.map(s => (s.offsetTop + 20 - top0) / h);
      };
      const set = pr => {
        sw.style.setProperty('--p', pr.toFixed(4));
        steps.forEach((s, k) => s.classList.toggle('is-on', pr >= marks[k] - .004));
      };
      measure(); set(0);
      ScrollTrigger.create({ trigger: sw, start: 'top 68%', end: 'bottom 62%', onUpdate: s => set(s.progress), onRefresh: s => { measure(); set(s.progress); } });
      gsap.from('.liaison', { y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: '.liaison', start: 'top 90%', once: true } });
    }

    /* --- who we serve: the type band slides both ways --- */
    if (!reduce && document.querySelector('.serve-band')) {
      const tr = { trigger: '.serve-band', start: 'top bottom', end: 'bottom top', scrub: .6 };
      gsap.fromTo('.sb-a', { xPercent: 0 }, { xPercent: -24, ease: 'none', scrollTrigger: { ...tr } });
      gsap.fromTo('.sb-b', { xPercent: -26 }, { xPercent: 0, ease: 'none', scrollTrigger: { ...tr } });
      gsap.from('.sv-cell', { y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .1, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.serve-cells', start: 'top 88%', once: true } });
    }

    /* site.js created its reveals before this page's pin; sort so the pin refreshes first */
    ScrollTrigger.sort();
  });
})();
