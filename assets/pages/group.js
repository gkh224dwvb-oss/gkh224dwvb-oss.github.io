/* =========================================================================
   GROUP page
   1. Hero: a 2D orbit teaser (five lights on a tilted orbit, drifting dust)
   2. Signature: Three.js constellation. A glowing SAA core with the official
      emblem at its centre, five company nodes in orbit, filaments of light
      and drifting particles.
      - Desktop (wide and tall enough, motion allowed): the section pins and
        scrolling turns the system to bring each company forward while the
        text panel swaps. A 1–5 indicator tracks progress.
      - Otherwise: the scene sits in a sticky band (phones) or a sticky
        column (wide screens) and the company cards scroll past it.
      - No WebGL: a still SVG frame. Reduced motion: still frames only.
   3. Roster: rules draw in, sector key highlights matching companies.
   ========================================================================= */
import * as THREE from '../vendor/three.module.min.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - t, 3);
const TAU = Math.PI * 2;
const N = 5, STEP = TAU / N;
const SHORT = ['Technical', 'Contracting', 'Facilities', 'Trading', 'Real estate'];
/* fewer cores or little memory: fewer particles and a lower pixel ratio */
const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
/* colour mode (assets/js/theme.js): both scenes repaint on every 'saa:theme' change */
const isLight = () => !!window.SAATheme && window.SAATheme.get() === 'light';

/* =========================================================================
   1. HERO ORBIT TEASER (2D canvas)
   ========================================================================= */
/* night: teal light on navy. Daylight: navy line work, deep teal accents, softer glows */
const HERO_PAL = {
  dark: { dust: '94,214,204', dustK: 1, glow: ['rgba(0,161,155,.28)', 'rgba(0,161,155,.07)'], ring: '94,214,204', ringK: 1, fil: '94,214,204', filK: 1,
    coreRing: 'rgba(94,214,204,.55)', coreDot: 'rgba(242,255,253,.95)', halo: '94,214,204', haloK: 1, node: '234,241,243' },
  light: { dust: '4,110,104', dustK: .8, glow: ['rgba(0,161,155,.2)', 'rgba(0,161,155,.05)'], ring: '11,37,69', ringK: 1.1, fil: '4,110,104', filK: 1.3,
    coreRing: 'rgba(4,110,104,.75)', coreDot: 'rgba(11,37,69,.95)', halo: '0,161,155', haloK: .8, node: '11,37,69' }
};
function heroField(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const hero = canvas.closest('.gp-hero');
  let W = 1, H = 1, small = false, dust = [];
  let visible = true, raf = 0, mx = 0, my = 0, tx = 0, ty = 0;
  let P = HERO_PAL[isLight() ? 'light' : 'dark'], lastMs = 0;
  const T0 = performance.now();

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    small = W < 700;
    const dpr = Math.min(window.devicePixelRatio || 1, small || LOW ? 1.5 : 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    dust = Array.from({ length: small ? 70 : 160 }, () => ({ x: rnd(), y: rnd(), z: rnd(), s: rnd() }));
  }

  function draw(ms) {
    lastMs = ms;
    const t = ms / 1000;
    mx += (tx - mx) * .05; my += (ty - my) * .05;
    ctx.clearRect(0, 0, W, H);

    for (const p of dust) {
      const px = ((p.x + t * .004 * (.3 + p.z)) % 1) * W;
      const py = ((((p.y - t * .003 * (.2 + p.z)) % 1) + 1) % 1) * H;
      const a = (.06 + .3 * p.z) * (.6 + .4 * Math.sin(t * 1.3 + p.s * 20));
      ctx.fillStyle = 'rgba(' + P.dust + ',' + (a * P.dustK).toFixed(3) + ')';
      const sz = 1 + p.z * 1.3;
      ctx.fillRect(px, py, sz, sz);
    }

    const cx = W * (small ? .6 : .72) + mx * 22, cy = H * (small ? .27 : .36) + my * 14;
    const rx = small ? W * .44 : Math.min(W * .24, 420), ry = rx * .3;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-.16);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, P.glow[0]); g.addColorStop(.3, P.glow[1]); g.addColorStop(1, 'rgba(0,161,155,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();

    ctx.lineWidth = 1;
    [[1.34, .09, [2, 9]], [1, .3, []], [.62, .14, [1, 6]]].forEach(([k, a, dash]) => {
      ctx.setLineDash(dash); ctx.strokeStyle = 'rgba(' + P.ring + ',' + a * P.ringK + ')';
      ctx.beginPath(); ctx.ellipse(0, 0, rx * k, ry * k, 0, 0, TAU); ctx.stroke();
    });
    ctx.setLineDash([]);

    const nodes = [];
    for (let i = 0; i < N; i++) {
      const a = t * .1 + i * STEP;
      nodes.push({ x: Math.sin(a) * rx, y: Math.cos(a) * ry, d: (Math.cos(a) + 1) / 2 });
    }
    nodes.sort((p, q) => p.d - q.d);
    for (const n of nodes) {
      ctx.strokeStyle = 'rgba(' + P.fil + ',' + ((.05 + .2 * n.d) * P.filK).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(n.x * .5, n.y * .5 - ry * .9, n.x, n.y); ctx.stroke();
    }
    ctx.strokeStyle = P.coreRing;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();
    ctx.fillStyle = P.coreDot;
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
    for (const n of nodes) {
      const r = 2 + 3.6 * n.d;
      const gg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
      gg.addColorStop(0, 'rgba(' + P.halo + ',' + ((.08 + .36 * n.d) * P.haloK).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(' + P.halo + ',0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(' + P.node + ',' + (.3 + .65 * n.d).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    draw(now - T0);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !REDUCE && visible) raf = requestAnimationFrame(loop); }

  resize();
  draw(REDUCE ? 9000 : 0);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  /* repaint at once (also the reduced-motion still frame) in the new palette */
  document.addEventListener('saa:theme', () => { P = HERO_PAL[isLight() ? 'light' : 'dark']; draw(lastMs); });
  let rt = 0, lastW = W;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - H) < 80) return; // mobile toolbar jitter
      lastW = r.width; resize(); draw(performance.now() - T0);
    }, 140);
  });
  if (FINE && !REDUCE && hero) {
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5;
    });
    hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  }
  start();
}

/* =========================================================================
   2. CONSTELLATION (Three.js)
   ========================================================================= */
function glowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function circlePoints(r, seg, plane = 'xz') {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * TAU;
    pts.push(plane === 'xz' ? new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r) : new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return pts;
}

function createConstellation(stage, canvas, labels) {
  let renderer, soft = false;
  try {
    /* probe first: no WebGL means the still SVG frame; a software rasteriser gets a lighter scene */
    const probe = document.createElement('canvas');
    const pg = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!pg) return null;
    try {
      const info = pg.getExtension('WEBGL_debug_renderer_info');
      soft = /swiftshader|llvmpipe|software|basic render/i.test(String(pg.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : pg.RENDERER)));
      const lose = pg.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    } catch (_) {}
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !soft, alpha: true, powerPreference: 'high-performance' });
  } catch (_) { return null; }
  renderer.setClearColor(0x000000, 0);

  const phone = Math.min(screen.width || innerWidth, innerWidth) < 700;
  const lite = phone || soft;
  const R = 3.6;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 200);
  const sys = new THREE.Group();          // turns with scroll: nodes, filaments, belt
  scene.add(sys);
  const add = (m, parent = scene) => { parent.add(m); return m; };
  const ADD = THREE.AdditiveBlending;
  /* Colour modes. Materials are built in their night look; tm() records it next to the daylight colour (and
     texture) so paint() can switch both ways. Additive glows vanish on a light background, so daylight draws
     everything with normal blending in navy and deeper teals. The shaders read the shared uLight uniform. */
  const themed = [];
  const uLight = { value: 0 };
  const tm = (mat, night, day, dayMap) => { themed.push({ mat, night, day, blend: mat.blending, map: mat.map, dayMap }); return mat; };
  const lineMat = (color, opacity, day = 0x0B2545) => tm(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: ADD }), color, day);
  /* opacity factors applied in update(): night values are the original ones */
  const NIGHT_K = { glow: 1, edge: 1, fill: 1, tick: 1, wave: 1 };
  const DAY_K = { glow: .62, edge: .9, fill: 1.4, tick: .8, wave: .55 };
  let K = NIGHT_K;

  const glowTeal = glowTexture([[0, 'rgba(160,240,232,0.9)'], [.18, 'rgba(94,214,204,0.45)'], [.5, 'rgba(0,161,155,0.1)'], [1, 'rgba(0,161,155,0)']]);
  const haloTex = glowTexture([[0, 'rgba(94,214,204,0.5)'], [.3, 'rgba(0,161,155,0.2)'], [.62, 'rgba(0,161,155,0.05)'], [1, 'rgba(0,161,155,0)']]);
  const glowDay = glowTexture([[0, 'rgba(0,161,155,0.6)'], [.18, 'rgba(0,161,155,0.3)'], [.5, 'rgba(0,161,155,0.07)'], [1, 'rgba(0,161,155,0)']]);
  const haloDay = glowTexture([[0, 'rgba(0,161,155,0.3)'], [.3, 'rgba(0,161,155,0.13)'], [.62, 'rgba(0,161,155,0.035)'], [1, 'rgba(0,161,155,0)']]);

  /* ---------- core ---------- */
  const core = add(new THREE.Group());
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uPulse: { value: 0 }, uLight },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uPulse, uLight; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
        vec3 deep = vec3(0.016, 0.050, 0.105);
        vec3 teal = vec3(0.37, 0.84, 0.80);
        vec3 col = mix(deep, vec3(0.03, 0.16, 0.24), smoothstep(0.2, 0.9, f));
        col += teal * pow(f, 2.6) * (0.9 + 0.3 * uPulse);
        col += vec3(0.92, 1.0, 0.98) * pow(f, 7.0) * 0.6;
        if (uLight > 0.5) {
          /* daylight: a pearl sphere that deepens to a teal rim */
          col = mix(vec3(0.99, 1.0, 1.0), vec3(0.83, 0.92, 0.93), smoothstep(0.1, 0.9, f));
          col = mix(col, vec3(0.0, 0.58, 0.56), pow(f, 2.4) * (0.75 + 0.2 * uPulse));
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  add(new THREE.Mesh(new THREE.SphereGeometry(.92, 64, 48), coreMat), core);
  const halo = add(new THREE.Sprite(tm(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: ADD }), 0xFFFFFF, 0xFFFFFF, haloDay)), core);
  halo.scale.set(6.4, 6.4, 1);

  /* the official white emblem; in daylight the sprite colour tints it to the official navy */
  const logoTex = new THREE.TextureLoader().load('assets/img/logo-emblem-white.png', () => api.renderOnce());
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const emblem = add(new THREE.Sprite(tm(new THREE.SpriteMaterial({ map: logoTex, transparent: true, depthWrite: false }), 0xFFFFFF, 0x0B2545)), core);
  emblem.scale.set(1.12, 1.12 * 480 / 528, 1);      // official proportions, never distorted
  emblem.renderOrder = 5;

  /* gyroscope rings around the core */
  const gyros = [];
  [[1.3, 1.08, .5, .22], [1.5, -.86, .3, -.16]].forEach(([r, tilt, op, sp], k) => {
    const pre = add(new THREE.Group(), core);
    const tl = add(new THREE.Group(), pre); tl.rotation.x = tilt; tl.rotation.z = k ? -.5 : .35;
    const spin = add(new THREE.Group(), tl);
    add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circlePoints(r, 180)), lineMat(0x5ED6CC, op, 0x046E68)), spin);
    const bead = add(new THREE.Sprite(tm(new THREE.SpriteMaterial({ map: glowTeal, transparent: true, depthWrite: false, blending: ADD }), 0xFFFFFF, 0xFFFFFF, glowDay)), spin);
    bead.position.set(r, 0, 0); bead.scale.set(.42, .42, 1);
    gyros.push({ pre, spin, sp });
  });
  /* dial ticks in the orbit plane, close to the core */
  {
    const v = [];
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * TAU, maj = k % 6 === 0, r1 = 1.78, r2 = maj ? 1.98 : 1.88;
      v.push(Math.cos(a) * r1, 0, Math.sin(a) * r1, Math.cos(a) * r2, 0, Math.sin(a) * r2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    add(new THREE.LineSegments(g, lineMat(0x5ED6CC, .28)), sys);
  }

  /* ---------- orbit structure ---------- */
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(circlePoints(R, 256));
  const orbit = add(new THREE.LineLoop(orbitGeo, lineMat(0x5ED6CC, .34)));
  {
    const v = [];
    for (let k = 0; k < 180; k++) {
      const a0 = k / 180 * TAU, a1 = a0 + TAU / 180 * .35, r = R * 1.42;
      v.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    add(new THREE.LineSegments(g, lineMat(0x5ED6CC, .16)), sys);
  }
  add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circlePoints(R * .66, 160)), lineMat(0x5ED6CC, .08)));

  const local = i => new THREE.Vector3(Math.sin(i * STEP) * R, 0, Math.cos(i * STEP) * R);
  /* chords between neighbouring companies */
  {
    const v = [];
    for (let i = 0; i < N; i++) { const a = local(i), b = local((i + 1) % N); v.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    add(new THREE.LineSegments(g, lineMat(0x5ED6CC, .12)), sys);
  }

  /* ---------- filaments: core -> each company ---------- */
  const filVS = `varying vec2 vUv; varying float vF;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz)));
      gl_Position = projectionMatrix * mv; }`;
  const filFS = `uniform float uTime, uActive, uDraw, uGlow, uSeed, uFade, uLight; varying vec2 vUv; varying float vF;
    void main(){
      float x = vUv.x;
      if (x > uDraw) discard;
      float ends = smoothstep(0.0, 0.08, x);
      float sp = 0.16 + 0.34 * uActive;
      float p1 = fract(uTime * sp + uSeed), p2 = fract(uTime * sp + uSeed + 0.5);
      float pulse = exp(-pow((x - p1) * 16.0, 2.0)) + exp(-pow((x - p2) * 16.0, 2.0)) * 0.7;
      float tip = exp(-pow((x - uDraw) * 26.0, 2.0)) * (1.0 - step(0.999, uDraw));
      float a = (0.2 + 0.55 * uActive) + pulse * (0.3 + 1.0 * uActive) + tip * 1.4;
      a *= ends * uFade;
      if (uGlow > 0.5) a *= pow(vF, 2.0) * 0.32;
      vec3 col = mix(vec3(0.0, 0.66, 0.63), vec3(0.88, 1.0, 0.98), clamp(pulse * 0.6 + tip + uActive * 0.25, 0.0, 1.0));
      if (uLight > 0.5) {   /* daylight: teal threads whose pulses run dark */
        col = mix(vec3(0.0, 0.6, 0.58), vec3(0.02, 0.24, 0.33), clamp(pulse * 0.6 + tip + uActive * 0.25, 0.0, 1.0));
        a = min(a, 1.0) * 0.85;
      }
      gl_FragColor = vec4(col, a);
    }`;
  const filaments = [];

  /* ---------- company nodes ---------- */
  const shapes = [
    new THREE.IcosahedronGeometry(.34, 0),
    new THREE.BoxGeometry(.44, .44, .44),
    new THREE.CylinderGeometry(.28, .28, .44, 6),
    new THREE.OctahedronGeometry(.38, 0),
    new THREE.BoxGeometry(.26, .66, .26)
  ];
  const nodes = [];
  const ringPts = circlePoints(.7, 120, 'xy');
  for (let i = 0; i < N; i++) {
    const g = add(new THREE.Group(), sys);
    const shape = add(new THREE.Group(), g);
    shape.rotation.set(.35 + i * .2, i * .7, .1);
    const edgeMat = tm(new THREE.LineBasicMaterial({ color: 0xEAF1F3, transparent: true, opacity: .9, depthWrite: false }), 0xEAF1F3, 0x0B2545);
    add(new THREE.LineSegments(new THREE.EdgesGeometry(shapes[i]), edgeMat), shape);
    const fillMat = tm(new THREE.MeshBasicMaterial({ color: 0x00A19B, transparent: true, opacity: .14, depthWrite: false, blending: ADD }), 0x00A19B, 0x00A19B);
    add(new THREE.Mesh(shapes[i], fillMat), shape);
    add(new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), tm(new THREE.MeshBasicMaterial({ color: 0xF2FFFD }), 0xF2FFFD, 0x0B2545)), g);
    const glowMat = tm(new THREE.SpriteMaterial({ map: glowTeal, transparent: true, depthWrite: false, blending: ADD, opacity: .6 }), 0xFFFFFF, 0xFFFFFF, glowDay);
    const glow = add(new THREE.Sprite(glowMat), g);
    glow.scale.set(1.5, 1.5, 1);

    /* selection ring: billboarded in world space */
    const ring = add(new THREE.Group());
    const ringMat = lineMat(0x5ED6CC, 0, 0x046E68);
    add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat), ring);
    const tv = [];
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + TAU / 8; tv.push(Math.cos(a) * .82, Math.sin(a) * .82, 0, Math.cos(a) * .98, Math.sin(a) * .98, 0); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3));
    const tickMat = lineMat(0xEAF1F3, 0);
    add(new THREE.LineSegments(tg, tickMat), ring);

    /* filament */
    const end = local(i);
    const start = end.clone().setLength(.9);
    const ctrl = end.clone().multiplyScalar(.5).add(new THREE.Vector3(0, 1.0, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
    const uni = { uTime: { value: 0 }, uActive: { value: 0 }, uDraw: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: i * .37 }, uFade: { value: 1 }, uLight };
    const matA = tm(new THREE.ShaderMaterial({ uniforms: uni, vertexShader: filVS, fragmentShader: filFS, transparent: true, depthWrite: false, blending: ADD }));
    const uniG = { ...uni, uGlow: { value: 1 } };
    const matB = tm(new THREE.ShaderMaterial({ uniforms: uniG, vertexShader: filVS, fragmentShader: filFS, transparent: true, depthWrite: false, blending: ADD }));
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 90, .013, 6, false), matA), sys);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 90, .075, 8, false), matB), sys);
    filaments.push(uni);

    nodes.push({ g, shape, edgeMat, fillMat, glowMat, glow, ring, ringMat, tickMat, w: 0, phi: i * STEP });
  }

  /* ---------- particles: an orbiting belt (turns with the system) + deep field ---------- */
  const ptsVS = `uniform float uTime, uPx, uAsm; attribute vec4 aData; varying float vA;
    void main(){
      vec3 p = position;
      float ang = uTime * aData.x;
      float c = cos(ang), s = sin(ang);
      p.xz = mat2(c, -s, s, c) * p.xz;
      p.y += sin(uTime * 0.5 + aData.y * 6.2831) * 0.07;
      if (aData.w < 0.5) p.xz *= mix(0.15, 1.0, uAsm);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = aData.z * uPx * 0.016 / -mv.z;
      vA = (0.35 + 0.65 * abs(sin(uTime * (0.4 + aData.y) + aData.y * 40.0))) * (aData.w < 0.5 ? 0.9 : 0.5) * (aData.w < 0.5 ? uAsm : 1.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const ptsFS = `uniform float uLight; varying float vA;
    void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r); a *= a;
      if (uLight > 0.5) { gl_FragColor = vec4(mix(vec3(0.0, 0.55, 0.53), vec3(0.04, 0.15, 0.27), a * 0.6), a * vA * 0.8); return; }
      gl_FragColor = vec4(mix(vec3(0.37, 0.84, 0.80), vec3(0.94, 1.0, 1.0), a * 0.6), a * vA); }`;
  const ptsUni = { uTime: { value: 0 }, uPx: { value: 1 }, uAsm: { value: 0 }, uLight };
  const ptsMat = tm(new THREE.ShaderMaterial({ uniforms: ptsUni, vertexShader: ptsVS, fragmentShader: ptsFS, transparent: true, depthWrite: false, blending: ADD }));
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  function cloud(count, belt) {
    const pos = new Float32Array(count * 3), dat = new Float32Array(count * 4);
    for (let k = 0; k < count; k++) {
      if (belt) {
        const a = rnd() * TAU, r = R + gauss() * .75 + (rnd() < .25 ? gauss() * 1.6 : 0);
        pos.set([Math.cos(a) * r, gauss() * .22, Math.sin(a) * r], k * 3);
        dat.set([.02 + rnd() * .05, rnd(), .8 + rnd() * 2.2, 0], k * 4);
      } else {
        const u = rnd() * 2 - 1, th = rnd() * TAU, rr = 6 + rnd() * 12, q = Math.sqrt(1 - u * u);
        pos.set([Math.cos(th) * q * rr, u * rr * .55, Math.sin(th) * q * rr], k * 3);
        dat.set([.004 + rnd() * .01, rnd(), .7 + rnd() * 1.8, 1], k * 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(dat, 4));
    return new THREE.Points(g, ptsMat);
  }
  add(cloud(lite ? 520 : LOW ? 900 : 1300, true), sys);
  add(cloud(lite ? 260 : LOW ? 460 : 700, false));

  /* ---------- pulse wave from the core across the orbit plane ---------- */
  const waveMat = tm(new THREE.MeshBasicMaterial({ color: 0x5ED6CC, transparent: true, opacity: 0, depthWrite: false, blending: ADD, side: THREE.DoubleSide }), 0x5ED6CC, 0x00A19B);
  const wave = add(new THREE.Mesh(new THREE.RingGeometry(.985, 1, 180).rotateX(-Math.PI / 2), waveMat));

  /* ---------- colour mode: recolour, swap glow textures and blending ---------- */
  function paint() {
    const day = isLight();
    uLight.value = day ? 1 : 0;
    K = day ? DAY_K : NIGHT_K;
    for (const t of themed) {
      if (t.night != null) t.mat.color.setHex(day ? t.day : t.night);
      if (t.dayMap) t.mat.map = day ? t.dayMap : t.map;
      t.mat.blending = day ? THREE.NormalBlending : t.blend;
      t.mat.needsUpdate = true;
    }
  }
  if (isLight()) paint();

  /* ---------- state ---------- */
  let comp = { sx: 0, sy: 0, el: .46, fov: 36, alpha: .3, cs: 1, ns: 1 };
  let dist = 16, W = 1, H = 1, labW = [];
  let cur = 0, target = 0, follow = 4;
  let asm = REDUCE ? 1 : 0, asmGo = REDUCE;
  let t = REDUCE ? 14 : 0, last = performance.now();
  let raf = 0, visible = false, live = !REDUCE;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();

  function layout(pinMode) {
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
    const side = pinMode && W >= 861;
    const narrow = W < 600;
    stage.parentElement.classList.remove('is-narrow');
    labW = labels.map(l => { const tx = l.querySelector('.t'); return (tx ? tx.offsetWidth : 0) + 30; });
    stage.parentElement.classList.toggle('is-narrow', narrow);
    comp = side
      ? { sx: .15, sy: .02, el: .34, fov: 30, alpha: -.62, cs: 1, ns: 1 }
      : { sx: 0, sy: narrow ? .02 : 0, el: narrow ? .6 : .5, fov: 36, alpha: .32, cs: narrow ? 1.45 : 1.15, ns: narrow ? 1.35 : 1.1 };
    const tanH = Math.tan(comp.fov * Math.PI / 360), aspect = W / H;
    const ext = narrow ? R * 1.08 + .32 * comp.ns : R * 1.16 + .45 * comp.ns;
    const dW = ext / (.95 - 2 * comp.sx) / (tanH * aspect);
    const dH = (R * Math.sin(comp.el) + 1.9) / (.92 - 2 * Math.abs(comp.sy)) / tanH;
    dist = Math.max(dW, dH);
    camera.fov = comp.fov; camera.aspect = aspect;
    camera.setViewOffset(W, H, -comp.sx * W, comp.sy * H, W, H);
    camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, phone || LOW ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    ptsUni.uPx.value = dpr * H / (2 * tanH);
    core.scale.setScalar(comp.cs);
    stage.parentElement.style.setProperty('--cx', (50 + comp.sx * 100).toFixed(1) + '%');
    stage.parentElement.style.setProperty('--cy', (50 - comp.sy * 100 - 2).toFixed(1) + '%');
    renderOnce();
  }

  function update(dt) {
    if (asmGo && asm < 1) asm = Math.min(1, asm + dt / 2.6);
    cur += (target - cur) * (1 - Math.exp(-dt * follow));
    if (Math.abs(target - cur) < 1e-4) cur = target;

    sys.rotation.y = comp.alpha - cur * STEP + (live ? Math.sin(t * .23) * .025 : 0);
    mx += (tmx - mx) * Math.min(1, dt * 2.5); my += (tmy - my) * Math.min(1, dt * 2.5);
    const el = comp.el + my * .06, az = mx * .1;
    camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    sys.updateMatrixWorld();

    camDir.copy(camera.position).normalize();
    emblem.position.copy(camDir).multiplyScalar(.95);
    const breathe = live ? 1 + Math.sin(t * 1.4) * .012 : 1;
    halo.scale.setScalar(6.4 * breathe);
    gyros.forEach(g => { g.pre.rotation.y = t * g.sp; g.spin.rotation.y = t * g.sp * 4; });

    /* wave */
    let waveR = 0, waveK = 0;
    if (live && asm >= 1) {
      const wt = (t % 4.2) / 3;
      if (wt < 1) { waveR = lerp(1.1 * comp.cs, R * 1.55, easeOut(wt)); waveK = Math.pow(1 - wt, 1.6); }
    }
    wave.scale.set(Math.max(.001, waveR), 1, Math.max(.001, waveR));
    waveMat.opacity = .5 * waveK * K.wave;
    orbit.material.opacity = .34 * asm;

    v3.set(0, 0, 0).project(camera);
    const coreX = (v3.x * .5 + .5) * W, coreY = (-v3.y * .5 + .5) * H;
    const coreR = .92 * comp.cs * H / (2 * dist * Math.tan(comp.fov * Math.PI / 360));
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const a = easeOut(clamp(asm * 1.8 - i * .16));
      const wT = clamp(1 - Math.abs(cur - i) * 1.3);
      n.w += (wT - n.w) * Math.min(1, dt * 8);
      const w = n.w;
      const rr = R * lerp(.24, 1, a);
      n.g.position.set(Math.sin(n.phi) * rr, 0, Math.cos(n.phi) * rr);
      n.g.scale.setScalar(Math.max(.001, a) * comp.ns * (1 + .55 * w));
      if (live) { n.shape.rotation.y += dt * (.25 + .6 * w); n.shape.rotation.x += dt * .08; }
      n.g.getWorldPosition(v3);
      const front = clamp((v3.z / R + 1) / 2);
      const flash = waveK > 0 ? Math.exp(-Math.pow((waveR - R) / .45, 2)) * waveK : 0;
      n.glowMat.opacity = a * (.32 + .3 * front + .55 * w + .7 * flash) * K.glow;
      n.glow.scale.setScalar(1.3 + 1.1 * w + .5 * flash);
      n.edgeMat.opacity = a * (.45 + .25 * front + .3 * w) * K.edge;
      n.fillMat.opacity = a * (.08 + .14 * w) * K.fill;
      n.ring.position.copy(v3);
      n.ring.quaternion.copy(camera.quaternion);
      if (live) n.ring.rotateZ(t * .4 + i);
      n.ring.scale.setScalar(comp.ns * (1.05 + .12 * Math.sin(t * 2 + i)) * lerp(.7, 1, w));
      n.ringMat.opacity = .75 * w * a;
      n.tickMat.opacity = .9 * w * a * K.tick;
      const f = filaments[i];
      f.uTime.value = t; f.uActive.value = w; f.uDraw.value = a; f.uFade.value = .55 + .45 * front;

      const lab = labels[i];
      if (lab) {
        const behind = v3.dot(camDir) < 0;
        v3.project(camera);
        const x = (v3.x * .5 + .5) * W, y = (-v3.y * .5 + .5) * H;
        const hid = behind ? sstep(coreR * .9, coreR * 1.5, Math.hypot(x - coreX, y - coreY)) : 1;
        const off = 16 + 14 * comp.ns * (1 + .55 * w);
        const lw = comp.cs > 1.3 && w <= .5 ? 30 : (labW[i] || 120);
        const flip = x + off + lw > W - 10;
        lab.style.transform = 'translate3d(' + (flip ? x - off : x + off).toFixed(1) + 'px,' + (y - 10).toFixed(1) + 'px,0)' + (flip ? ' translateX(-100%)' : '');
        lab.style.opacity = (a * a * hid * (.4 + .35 * front + .4 * w)).toFixed(3);
        lab.classList.toggle('flip', flip);
        lab.classList.toggle('is-on', w > .5);
      }
    }
    coreMat.uniforms.uPulse.value = waveK;
    ptsUni.uTime.value = t; ptsUni.uAsm.value = asm;
  }

  function renderOnce() {
    update(REDUCE ? 10 : 0);
    renderer.render(scene, camera);
  }
  function tick(now) {
    raf = 0;
    if (!visible || document.hidden || !live) return;
    const dt = Math.min(.5, (now - last) / 1000); last = now; t += dt;
    update(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  function run() { if (!raf && live && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) { asmGo = true; run(); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { rootMargin: '60px 0px' }).observe(stage);
  } else { visible = true; asmGo = true; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); live = false; stage.parentElement.classList.remove('gl-on'); });
  /* the header switch: repaint at once, also when paused or showing the reduced-motion still frame */
  document.addEventListener('saa:theme', () => { paint(); renderOnce(); });

  if (FINE && !REDUCE) {
    stage.parentElement.addEventListener('pointermove', e => {
      tmx = (e.clientX / innerWidth - .5) * 2; tmy = (e.clientY / innerHeight - .5) * 2;
    });
    stage.parentElement.addEventListener('pointerleave', () => { tmx = 0; tmy = 0; });
  }

  const api = {
    layout,
    renderOnce,
    setTarget(f, snap) {
      target = f;
      if (snap || REDUCE) { cur = f; nodes.forEach((n, i) => { n.w = clamp(1 - Math.abs(f - i) * 1.3); }); }
      if (REDUCE) renderOnce();
    },
    setFollow(k) { follow = k; }
  };
  return api;
}

/* =========================================================================
   3. WIRING
   ========================================================================= */
const heroCanvas = document.getElementById('gpField');
if (heroCanvas) heroField(heroCanvas);

const sec = document.getElementById('constellation');
const stage = sec && sec.querySelector('.cn-stage');
const items = sec ? [...sec.querySelectorAll('.cn-item')] : [];
const btns = sec ? [...sec.querySelectorAll('.cn-prog button')] : [];
const bars = btns.map(b => b.querySelector('b'));
const progName = sec && sec.querySelector('.cn-progname');
const fbNodes = sec ? [...sec.querySelectorAll('.fb-n')] : [];
const labels = sec ? [...sec.querySelectorAll('.cn-lab')] : [];

/* The WebGL constellation is built after the first paint: when the section comes near the
   viewport or the main thread is idle after load, whichever is first. The still SVG frame
   (.cn-fallback) shows until then. */
let scene = null, sceneTried = false, lastF = 0, onScene = null;
function bootScene() {
  if (sceneTried || !sec || !stage) return;
  sceneTried = true;
  try { scene = createConstellation(stage, sec.querySelector('.cn-canvas'), labels); } catch (err) { console.warn('Constellation fallback:', err && err.message); scene = null; }
  if (!scene) return;
  sec.classList.add('gl-on');
  scene.setFollow(mode === 'pin' ? 9 : 4);
  scene.layout(mode === 'pin');
  scene.setTarget(lastF, true);
  if (document.fonts) document.fonts.ready.then(() => scene.layout(mode === 'pin'));
  if (onScene) onScene();
}
if (sec && stage) {
  const whenIdle = fn => ('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 200);
  const afterPaint = () => requestAnimationFrame(() => setTimeout(() => whenIdle(bootScene), 0));
  if (document.readyState === 'complete') afterPaint(); else addEventListener('load', afterPaint, { once: true });
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(es => { if (es[0].isIntersecting) { near.disconnect(); bootScene(); } }, { rootMargin: '0px 0px 100% 0px' });
    near.observe(sec);
  }
}

let mode = 'flow';
let active = -1;
let G = null;                 // gsap, once SAA is ready
let pinST = null;

const cardParts = it => it.querySelectorAll('.cn-meta, .cn-name, .cn-desc, .cn-foot');
const OPEN = 'inset(-20% -4% -30% -4%)', SHUT_TOP = 'inset(-20% -4% 100% -4%)', SHUT_BOT = 'inset(100% -4% -30% -4%)';

function setActive(i, instant) {
  if (i === active) return;
  const prev = active, dir = i > prev ? 1 : -1;
  active = i;
  btns.forEach((b, k) => { b.classList.toggle('is-on', k === i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
  if (progName) progName.textContent = (i + 1) + ' · ' + SHORT[i];
  fbNodes.forEach((n, k) => n.classList.toggle('on', k === i));
  items.forEach((it, k) => it.classList.toggle('is-on', k === i));
  if (mode !== 'pin') return;
  items.forEach((it, k) => it.querySelectorAll('a').forEach(a => { a.tabIndex = k === i ? 0 : -1; }));
  if (!G || instant || REDUCE) {
    items.forEach((it, k) => { if (G) { G.set(it, { opacity: k === i ? 1 : 0 }); G.set(cardParts(it), { clearProps: 'clipPath,transform' }); } });
    return;
  }
  const old = items[prev], next = items[i];
  if (old) {
    G.to(cardParts(old), {
      clipPath: dir > 0 ? SHUT_TOP : SHUT_BOT, y: -24 * dir, duration: .4, ease: 'power2.in', stagger: .03, overwrite: true,
      onComplete() { if (items[active] !== old) { G.set(old, { opacity: 0 }); G.set(cardParts(old), { clearProps: 'clipPath,transform' }); } }
    });
  }
  G.set(next, { opacity: 1 });
  G.fromTo(cardParts(next), { clipPath: dir > 0 ? SHUT_BOT : SHUT_TOP, y: 40 * dir },
    { clipPath: OPEN, y: 0, duration: .95, delay: .2, stagger: .06, ease: 'expo.out', overwrite: true, clearProps: 'clipPath' });
}

/* ---- flow mode: the card nearest the reading line is the active company ---- */
function pickFlow() {
  if (mode !== 'flow' || !sec) return;
  const r = sec.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  const narrow = innerWidth < 861;
  const sb = narrow ? Math.max(0, stage.getBoundingClientRect().bottom) : 0;
  const focus = narrow ? sb + (innerHeight - sb) * .5 : innerHeight * .5;
  let best = 0, bd = Infinity;
  items.forEach((it, k) => {
    const c = it.querySelector('.cn-card').getBoundingClientRect();
    const d = Math.abs((c.top + c.bottom) / 2 - focus);
    if (d < bd) { bd = d; best = k; }
  });
  if (best === active) return;
  setActive(best);
  lastF = best;
  if (scene) scene.setTarget(best);
}
let pickRaf = 0;
addEventListener('scroll', () => { if (!pickRaf) pickRaf = requestAnimationFrame(() => { pickRaf = 0; pickFlow(); }); }, { passive: true });
setActive(0, true);
pickFlow();

/* re-layout the scene when its stage changes size */
onScene = () => { if (!('ResizeObserver' in window)) return;
  let lw = 0, lh = 0, rz = 0;
  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect;
    if (Math.abs(width - lw) < 1 && Math.abs(height - lh) < 1) return;
    lw = width; lh = height;
    clearTimeout(rz); rz = setTimeout(() => scene.layout(mode === 'pin'), 60);
  }).observe(stage);
};
if (scene) onScene();

/* ---- sector key: highlight the companies in a sector ---- */
const rosterList = document.querySelector('.roster-list');
const rows = [...document.querySelectorAll('.co')];
const chips = [...document.querySelectorAll('.co .chip')];
document.querySelectorAll('.skey-item').forEach(key => {
  const s = key.dataset.sector;
  const on = () => {
    key.classList.add('is-hot');
    rosterList.classList.add('is-filter');
    rows.forEach(r => r.classList.toggle('is-match', r.dataset.sectors.split(' ').includes(s)));
    chips.forEach(c => c.classList.toggle('is-hot', c.dataset.sector === s));
  };
  const off = () => {
    key.classList.remove('is-hot');
    rosterList.classList.remove('is-filter');
    rows.forEach(r => r.classList.remove('is-match'));
    chips.forEach(c => c.classList.remove('is-hot'));
  };
  if (FINE) { key.addEventListener('pointerenter', on); key.addEventListener('pointerleave', off); }
});

/* "Company details" lands on the row and lights its icon for a moment */
document.querySelectorAll('.cn-link').forEach(a => a.addEventListener('click', () => {
  const row = document.querySelector(a.getAttribute('href'));
  if (!row) return;
  row.classList.add('is-match');
  setTimeout(() => row.classList.remove('is-match'), 2600);
}));

/* =========================================================================
   4. MOTION (after the shared preloader, Lenis and GSAP are ready)
   ========================================================================= */
if (window.SAA) window.SAA.ready(({ gsap, ScrollTrigger, lenis, reduce }) => {
  G = gsap;
  if (!ScrollTrigger) return;
  const mm = gsap.matchMedia();

  /* --- hero entrance + depth --- */
  if (!reduce) {
    gsap.from(['.gp-lead', '.gp-cta', '.gp-meta > div', '.gp-cue'], { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .08, delay: .45, clearProps: 'opacity' });
    gsap.to('#gpField', { yPercent: 24, ease: 'none', scrollTrigger: { trigger: '.gp-hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.gp-wrap', { yPercent: -12, ease: 'none', scrollTrigger: { trigger: '.gp-hero', start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* --- signature: pinned constellation --- */
  if (sec && !reduce) {
    const HOLD0 = .35, SPAN = 4.7;
    const rawOf = P => clamp(P * SPAN - HOLD0, 0, 4);
    const apply = P => {
      const raw = rawOf(P);
      const i = Math.min(3, Math.floor(raw)), f = raw >= 4 ? 4 : i + sstep(.28, .72, raw - i);
      lastF = f;
      if (scene) scene.setTarget(f);
      setActive(Math.round(f));
      bars.forEach((b, k) => { b.style.transform = 'scaleX(' + clamp(P * 5 - k).toFixed(3) + ')'; });
    };

    mm.add('(min-width: 861px) and (min-height: 600px)', () => {
      mode = 'pin';
      sec.classList.add('is-pin');
      if (scene) { scene.setFollow(9); scene.layout(true); }
      active = -1;
      items.forEach(it => gsap.set(it, { opacity: 0 }));
      const proxy = { p: 0 };
      setActive(0, true); apply(0);
      if (scene) scene.setTarget(0, true);
      const tw = gsap.to(proxy, {
        p: 1, ease: 'none', onUpdate: () => apply(proxy.p),
        scrollTrigger: {
          trigger: sec, start: 'top top', end: () => '+=' + Math.round(innerHeight * 4.4),
          pin: true, scrub: .5, anticipatePin: 1, invalidateOnRefresh: true,
          onRefresh: () => { if (scene) scene.layout(true); apply(proxy.p); }
        }
      });
      pinST = tw.scrollTrigger;
      ScrollTrigger.sort();
      return () => {
        pinST = null;
        mode = 'flow';
        sec.classList.remove('is-pin');
        items.forEach(it => {
          gsap.killTweensOf(cardParts(it));
          gsap.set(it, { clearProps: 'opacity,transform' });
          gsap.set(cardParts(it), { clearProps: 'clipPath,transform' });
          it.querySelectorAll('a').forEach(a => a.removeAttribute('tabindex'));
        });
        bars.forEach(b => { b.style.transform = ''; });
        if (scene) { scene.setFollow(4); scene.layout(false); }
        active = -1;
        pickFlow();
      };
    });

    btns.forEach((b, k) => b.addEventListener('click', () => {
      if (!pinST) return;
      const P = (k + HOLD0 + .02) / SPAN;
      const y = pinST.start + P * (pinST.end - pinST.start);
      lenis ? lenis.scrollTo(y, { duration: 1.4 }) : window.scrollTo({ top: y, behavior: 'smooth' });
    }));
  }

  /* --- flow mode: cards rise in (the pinned layout swaps them instead) --- */
  if (!reduce) {
    mm.add('(max-width: 860px), (max-height: 599px)', () => {
      items.forEach(it => {
        gsap.from(it.querySelector('.cn-card'), {
          y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity,transform',
          scrollTrigger: { trigger: it, start: 'top 94%', once: true }
        });
      });
    });
  }

  /* --- roster: rules draw across, icons turn in --- */
  if (!reduce) {
    gsap.from('.skey-item', { y: 24, opacity: 0, duration: .9, ease: 'expo.out', stagger: .06, clearProps: 'opacity,transform', scrollTrigger: { trigger: '.skey', start: 'top 90%', once: true } });
    rows.forEach(row => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 88%', once: true } });
      tl.from(row.querySelector('.co-line'), { scaleX: 0, duration: 1.3, ease: 'expo.inOut' })
        .from(row.querySelector('.co-ic'), { scale: 0, rotate: -90, duration: .9, ease: 'back.out(1.6)' }, .25)
        .from(row.querySelectorAll('.co-id, .co-body, .co-sec'), { y: 40, opacity: 0, duration: 1, ease: 'expo.out', stagger: .07, clearProps: 'opacity,transform' }, .3);
    });
  }

  /* The shared reveals were created before this pin; sort so the pin refreshes first. */
  ScrollTrigger.sort();
});
