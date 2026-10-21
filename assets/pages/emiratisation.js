/* =========================================================================
   EMIRATISATION page
   1. Signature hero: silk ribbons in the colours of the UAE flag sweep in
      from off-screen, twisting, and lay themselves down into a waving flag
      behind the headline: red at the hoist, then green, white and black.
      Three.js; the ribbon geometry is computed on the CPU each frame from one
      flag model, so the same model also draws the SVG still when WebGL 2 is
      missing. Scrolling away lets the ribbons stream off the fly end;
      scrolling back rebuilds the flag. Phones get fewer ribbons, fewer
      segments and fewer motes; reduced motion gets one still frame.
   2. Figures: the flag-colour rules draw in (numbers count up via site.js)
   3. How to register: the rail fills on scroll and each icon draws itself
   4. Sectors: pointer spotlight on the tiles
   5. Closing call to action: four ribbons draw in behind the headline
   Light mode: daylight ribbon colours with normal blending on a pale sky;
   everything repaints on the 'saa:theme' event.
   ========================================================================= */
import * as THREE from '../vendor/three.module.min.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const isLight = () => !!window.SAATheme && window.SAATheme.get() === 'light';
const isRTL = () => document.documentElement.dir === 'rtl';
/* phones and portrait tablets stack the hero: flag above, type below (same query as emiratisation.css) */
const STACK = matchMedia('(max-width: 760px), (max-width: 1100px) and (orientation: portrait)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const flyEase = t => 1 - Math.pow(1 - t, 3.2);          // fast entry, soft landing
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/* three r163+ runs on WebGL 2 only: probe once (and let the probe context go) */
const HAS_GL2 = (() => {
  try {
    const g = document.createElement('canvas').getContext('webgl2');
    const x = g && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
    return !!g;
  } catch (_) { return false; }
})();
/* small seeded random, so the composition is the same on every visit */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* ---------------------------------------------------------------------
   Flag model. Local space: x runs from the hoist (0) to the fly end (FW),
   y from the top edge (0) down to -FH, z towards the viewer.
   --------------------------------------------------------------------- */
const RED = 0, GREEN = 1, WHITE = 2, BLACK = 3;
const STILL_T = 1.4;                         // the moment drawn for the still frames

function makeModel(small) {
  const FW = 1, FH = .5;                       // unit flag (1:2, as the UAE flag); scaled by the group
  const R = rng(1971);
  const ribbons = [];
  const m = small ? 4 : 6, n = small ? 4 : 6;
  /* the red band at the hoist: vertical ribbons dropping in from above */
  for (let k = 0; k < m; k++) {
    const fx = (k + .5) / m * .25;
    ribbons.push({ kind: 'v', col: RED, fx, f0: -.03, f1: 1.03, w: .25 * FW / m * .86,
      delay: .05 + k * .05, dur: 1.5 + R() * .3, twist: (2 + R() * 2.5) * (R() < .5 ? -1 : 1), ext: 0, r: R });
  }
  /* green, white and black: horizontal ribbons flying in from the lower left */
  [GREEN, WHITE, BLACK].forEach((col, j) => {
    for (let k = 0; k < n; k++) {
      const fy = (j + (k + .5) / n) / 3;
      ribbons.push({ kind: 'h', col, fy, f0: .254, f1: 1 + R() * .05, w: FH / 3 / n * .84,
        delay: .32 + j * .2 + k * .06 + R() * .05, dur: 2 + R() * .45, twist: (3 + R() * 4) * (R() < .5 ? -1 : 1), r: R });
    }
  });
  /* approach curves (cubic Béziers ending tangent to the ribbon's place on the flag) */
  ribbons.forEach((rb, i) => {
    const R2 = rng(77 + i * 13);
    let P0, P1, P2, P3;
    if (rb.kind === 'h') {
      P3 = new THREE.Vector3(rb.f0 * FW, -rb.fy * FH, 0);
      P0 = new THREE.Vector3(-FW * (.75 + R2() * .55), -FH * (1.6 + R2() * 1.4), 2.4 + R2() * 2.2);
      P1 = new THREE.Vector3(P0.x + FW * (.35 + R2() * .4), P3.y + FH * (1 + R2() * 1.6) * (R2() < .3 ? -1 : 1), 1.8 + R2() * 1.4);
      P2 = new THREE.Vector3(P3.x - FW * (.35 + R2() * .25), P3.y, .25);
      rb.L = (rb.f1 - rb.f0) * FW;
    } else {
      P3 = new THREE.Vector3(rb.fx * FW, -rb.f0 * FH, 0);
      P0 = new THREE.Vector3(rb.fx * FW + FW * (.15 + R2() * .3), FH * (1.9 + R2() * .8), 1.6 + R2() * 1.2);
      P1 = new THREE.Vector3(P0.x - FW * (.3 + R2() * .2), FH * (1.2 + R2() * .4), 1.2);
      P2 = new THREE.Vector3(P3.x, P3.y + FH * (.45 + R2() * .2), .2);
      rb.L = (rb.f1 - rb.f0) * FH;
    }
    rb.bez = new THREE.CubicBezierCurve3(P0, P1, P2, P3);
    rb.Lapp = rb.bez.getLength();
    rb.dir0 = rb.bez.getTangentAt(0);
    rb.exitStagger = (rb.kind === 'v' ? .55 : .1) + R2() * .25 + (rb.kind === 'h' ? rb.fy * .2 : 0);
  });
  return { FW, FH, ribbons };
}

/* the waving cloth: amplitude grows from the hoist to the fly end */
function flagPoint(model, fx, fy, t, wind, out) {
  const { FW, FH } = model;
  const a = FH * .46 * (.1 + .9 * Math.pow(Math.max(fx, 0), 1.05)) * wind;
  const ph = 5.6 * fx - 1.7 * t + 1.1 * fy;
  const z = a * (.6 * Math.sin(ph) + .2 * Math.sin(11.4 * fx - 2.9 * t + .5 * fy + 1.3) + .08 * Math.sin(19 * fx - 4.2 * t + 2.1 * fy));
  const dy = a * .2 * Math.sin(4.1 * fx - 1.5 * t + .7) - FH * .06 * fx * fx;
  return out.set(fx * FW - a * .1 * Math.cos(ph), -fy * FH + dy, z);
}

/* one ribbon's centre line, side vector and width for this moment */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
const _j = new THREE.Vector3();
function ribbonFrame(model, rb, S, head, t, wind, pos, side) {
  const { FW, FH } = model;
  /* where the ribbon meets the waving flag right now: the approach curve bends to meet it */
  if (rb.kind === 'h') flagPoint(model, rb.f0, rb.fy, t, wind, _j); else flagPoint(model, rb.fx, rb.f0, t, wind, _j);
  _j.sub(rb.bez.v3);
  for (let i = 0; i <= S; i++) {
    const along = i / S, s = head - rb.L * (1 - along);
    const p = pos[i];
    if (s < -1e-6) {
      const d = -s;
      if (d <= rb.Lapp) { const q = 1 - d / rb.Lapp; p.copy(rb.bez.getPointAt(q)).addScaledVector(_j, q * q); }
      else p.copy(rb.bez.v0).addScaledVector(rb.dir0, -(d - rb.Lapp));
    } else if (s <= rb.L) {
      const f = Math.max(0, s) / rb.L;
      if (rb.kind === 'h') flagPoint(model, rb.f0 + f * (rb.f1 - rb.f0), rb.fy, t, wind, p);
      else flagPoint(model, rb.fx, rb.f0 + f * (rb.f1 - rb.f0), t, wind, p);
    } else {
      /* streaming off the end: on past the fly end, curling up and towards the viewer */
      const e = s - rb.L;
      if (rb.kind === 'h') flagPoint(model, rb.f1, rb.fy, t, wind, p).add(_a.set(e * .9, e * e * .22 + e * .1, e * .55));
      else flagPoint(model, rb.fx, rb.f1, t, wind, p).add(_a.set(e * .45, -e * .8, e * .5));
    }
  }
  /* side vectors: across the cloth where the ribbon lies on the flag, twisted while it flies */
  for (let i = 0; i <= S; i++) {
    const along = i / S, s = head - rb.L * (1 - along);
    const T = _b.copy(pos[Math.min(S, i + 1)]).sub(pos[Math.max(0, i - 1)]).normalize();
    const B = side[i];
    if (rb.kind === 'h') B.set(0, -1, 0); else B.set(1, 0, 0);
    if (s >= -1e-6 && s <= rb.L) {
      const f = Math.max(0, s) / rb.L;
      if (rb.kind === 'h') { const fx = rb.f0 + f * (rb.f1 - rb.f0); flagPoint(model, fx, rb.fy + .02, t, wind, _c).sub(flagPoint(model, fx, rb.fy, t, wind, _a)); }
      else { const fy = rb.f0 + f * (rb.f1 - rb.f0); flagPoint(model, rb.fx + .02, fy, t, wind, _c).sub(flagPoint(model, rb.fx, fy, t, wind, _a)); }
      B.copy(_c);
    }
    B.addScaledVector(T, -B.dot(T)).normalize();
    const off = s < 0 ? Math.min(1, -s / rb.Lapp) : s > rb.L ? Math.min(1, (s - rb.L) / (FW * .6)) : 0;
    if (off > 0) { _q.setFromAxisAngle(T, rb.twist * Math.PI * off * off); B.applyQuaternion(_q); }
    B.multiplyScalar(rb.w * .5 * (.35 + .65 * sstep(1, .965, along)) * (.6 + .4 * sstep(0, .03, along)));
  }
}

/* ---------------------------------------------------------------------
   Palettes: dark (glowing silk on navy) and daylight (printed silk on a pale sky)
   --------------------------------------------------------------------- */
const PAL = {
  dark: [
    { base: [.86, .15, .14], shade: [.26, .02, .04], spec: [.45, .26, .24], rim: [.22, .04, .05], alpha: .98 },
    { base: [0, .56, .27], shade: [0, .1, .07], spec: [.2, .36, .28], rim: [0, .16, .1], alpha: .98 },
    { base: [.94, .96, .97], shade: [.24, .32, .44], spec: [.36, .36, .36], rim: [.12, .18, .26], alpha: .97 },
    { base: [.025, .03, .045], shade: [.005, .008, .014], spec: [.3, .38, .46], rim: [.14, .24, .32], alpha: .98 }
  ],
  light: [
    { base: [.8, .12, .11], shade: [.42, .04, .05], spec: [.12, .08, .08], rim: [0, 0, 0], alpha: 1 },
    { base: [0, .5, .24], shade: [0, .22, .12], spec: [.1, .16, .13], rim: [0, 0, 0], alpha: 1 },
    { base: [1, 1, 1], shade: [.56, .63, .72], spec: [.1, .1, .1], rim: [0, 0, 0], alpha: 1 },
    { base: [.08, .1, .14], shade: [.02, .03, .05], spec: [.22, .28, .36], rim: [.05, .07, .1], alpha: 1 }
  ]
};
const SVG_FILL = {
  dark: ['#D3322C', '#00843D', 'rgba(240,244,246,.9)', '#05080C'],
  light: ['#D9302A', '#00843D', '#FFFFFF', '#141C28']
};

const RIBBON_VS = `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;
const RIBBON_FS = `
uniform vec3 uBase; uniform vec3 uShade; uniform vec3 uSpec; uniform vec3 uRim; uniform float uAlpha; uniform float uEdgeDark;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(vV);
  if (dot(N, V) < 0.0) N = -N;                      // silk is two-sided
  vec3 L = normalize(vec3(-0.75, 0.4, 0.52));
  float diff = clamp(dot(N, L) * 1.25 - 0.1, 0.0, 1.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 28.0);
  float across = vUv.y;
  vec3 col = mix(uShade, uBase, 0.18 + 0.82 * diff * diff * (3.0 - 2.0 * diff));
  col += uSpec * spec * 1.15;
  col += uRim * pow(1.0 - ndv, 2.0);
  col *= 1.0 - uEdgeDark * pow(1.0 - ndv, 1.4);
  float edge = smoothstep(0.0, 0.03, across) * smoothstep(1.0, 0.97, across);
  gl_FragColor = vec4(col, uAlpha * edge);
}`;
const MOTE_VS = `
attribute float aSeed; uniform float uTime; uniform float uSize;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.11 + aSeed * 40.0) * 0.35;
  p.y += mod(uTime * (0.04 + aSeed * 0.05) + aSeed * 9.0, 4.0) - 2.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = 0.35 + 0.65 * fract(aSeed * 7.13);
  gl_PointSize = uSize * (0.5 + fract(aSeed * 3.7)) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FS = `
uniform vec3 uColor; uniform float uAlpha; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * a * uAlpha * vA);
}`;

/* ---------------------------------------------------------------------
   1. Hero scene
   --------------------------------------------------------------------- */
function flagScene(hero, canvas, still) {
  let small = STACK.matches;
  let model = makeModel(small);
  let S = small ? 72 : 120;
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 0, 12);
  const group = new THREE.Group();           // the flag: scaled, turned and placed per layout
  const state = { t0: null, scroll: 0, px: 0, py: 0, tx: 0, ty: 0, wind: 1 };
  let W = 1, H = 1, layout = null, rt = 0;

  function computeLayout() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), visW = visH * camera.aspect;
    /* the hero may be taller than the screen: place the flag against the first screenful */
    const vh = Math.min(H, innerHeight), visS = visH * vh / H, yc = visH * (.5 - vh / H / 2);   // world height and centre of the first screenful
    if (STACK.matches) {
      /* phones and portrait tablets: the flag waves across the top, clear of the eyebrow and the headline */
      const fw = Math.min(visW * 1.04, visS * .46);
      layout = { scale: fw, x: -visW * .44, y: visH * .5 - visS * .105, yaw: -.32, pitch: .1, roll: -.02 };
    } else if (isRTL()) {
      /* right to left: the copy is on the right, so the flag (never mirrored: hoist on the left) waves in the left half */
      const fw = Math.min(visW * .5, visS * 1.3);
      layout = { scale: fw, x: -visW * .47, y: yc + fw * .5 * .64, yaw: -.42, pitch: .06, roll: -.03 };
    } else {
      const fw = Math.min(visW * .7, visS * 1.6);
      layout = { scale: fw, x: -visW * (W < 1100 ? -.02 : .03), y: yc + fw * .5 * .64, yaw: -.5, pitch: .06, roll: -.03 };
    }
    group.scale.setScalar(layout.scale);
  }
  function place() {
    const sp = state.scroll;
    group.position.set(layout.x + state.px * .12, layout.y + state.py * .08 + sp * .8, -sp * 1.2);
    group.rotation.set(layout.pitch + state.py * .04 + sp * .12, layout.yaw + state.px * .07 - sp * .1, layout.roll);
  }

  /* moment of each ribbon: how far its head has travelled along approach + flag + exit */
  function headOf(rb, t) {
    let k = 1;
    if (state.t0 !== null && !REDUCE) k = flyEase(clamp((t - state.t0 - rb.delay) / rb.dur));
    else if (state.t0 === null && !REDUCE) k = 0;
    let head = -rb.Lapp + (rb.Lapp + rb.L) * k;
    const ex = easeIO(clamp((state.scroll - rb.exitStagger * .55) / .45));
    return head + ex * (rb.L + model.FW * 1.4);
  }

  /* --- WebGL --- */
  let renderer = null;
  if (!HAS_GL2) return svgStill();
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) { renderer = null; }
  if (!renderer) return svgStill();

  const scene = new THREE.Scene();
  scene.add(group);
  let meshes = [];
  function build() {
    meshes.forEach(o => { group.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); });
    meshes = model.ribbons.map(rb => {
      const vcount = (S + 1) * 2;
      const geo = new THREE.BufferGeometry();
      const P = new Float32Array(vcount * 3), N = new Float32Array(vcount * 3), U = new Float32Array(vcount * 2);
      for (let i = 0; i <= S; i++) { U[i * 4] = i / S; U[i * 4 + 1] = 0; U[i * 4 + 2] = i / S; U[i * 4 + 3] = 1; }
      const idx = [];
      for (let i = 0; i < S; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      const mat = new THREE.ShaderMaterial({
        vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, side: THREE.DoubleSide, transparent: true,
        uniforms: { uBase: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uSpec: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uAlpha: { value: 1 }, uEdgeDark: { value: 0 } }
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      /* white over black over green: a calm, stable stacking where ribbons cross in flight */
      mesh.renderOrder = rb.col === RED ? 3 : rb.col === WHITE ? 2 : 1;
      group.add(mesh);
      return { rb, mesh, pos: Array.from({ length: S + 1 }, () => new THREE.Vector3()), side: Array.from({ length: S + 1 }, () => new THREE.Vector3()) };
    });
    paint();
  }

  /* motes of light drifting through the scene (few on phones) */
  const MOTES = small ? 90 : 320;
  const mg = new THREE.BufferGeometry();
  { const R = rng(5), P = new Float32Array(MOTES * 3), Sd = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) { P[i * 3] = (R() - .5) * 16; P[i * 3 + 1] = (R() - .5) * 8; P[i * 3 + 2] = (R() - .5) * 6; Sd[i] = R(); }
    mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(Sd, 1)); }
  const mm = new THREE.ShaderMaterial({ vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSize: { value: 60 }, uColor: { value: new THREE.Color() }, uAlpha: { value: .6 } } });
  const motes = new THREE.Points(mg, mm); motes.frustumCulled = false; motes.renderOrder = 5;
  scene.add(motes);

  function paint() {
    const day = isLight(), pal = day ? PAL.light : PAL.dark;
    meshes.forEach(({ rb, mesh }) => {
      const p = pal[rb.col], u = mesh.material.uniforms;
      u.uBase.value.setRGB(...p.base); u.uShade.value.setRGB(...p.shade); u.uSpec.value.setRGB(...p.spec); u.uRim.value.setRGB(...p.rim);
      u.uAlpha.value = p.alpha; u.uEdgeDark.value = day ? (rb.col === WHITE ? .3 : .12) : 0;
    });
    mm.blending = day ? THREE.NormalBlending : THREE.AdditiveBlending;
    mm.uniforms.uColor.value.set(day ? '#2A4A72' : '#CFE8F3');
    mm.uniforms.uAlpha.value = day ? .32 : .55;
    mm.needsUpdate = true;
  }

  function size() {
    computeLayout();
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    mm.uniforms.uSize.value = (small ? 70 : 90) * dpr;
  }

  let lost = false;
  function frame(t) {
    if (lost) return;
    state.px += (state.tx - state.px) * .04; state.py += (state.ty - state.py) * .04;
    place();
    meshes.forEach(o => {
      const head = headOf(o.rb, t);
      ribbonFrame(model, o.rb, S, head, t, state.wind, o.pos, o.side);
      const P = o.mesh.geometry.attributes.position.array, N = o.mesh.geometry.attributes.normal.array;
      for (let i = 0; i <= S; i++) {
        const p = o.pos[i], b = o.side[i], j = i * 6;
        P[j] = p.x + b.x; P[j + 1] = p.y + b.y; P[j + 2] = p.z + b.z;
        P[j + 3] = p.x - b.x; P[j + 4] = p.y - b.y; P[j + 5] = p.z - b.z;
        _b.copy(o.pos[Math.min(S, i + 1)]).sub(o.pos[Math.max(0, i - 1)]);
        _c.copy(_b).cross(b).normalize();
        N[j] = N[j + 3] = _c.x; N[j + 1] = N[j + 4] = _c.y; N[j + 2] = N[j + 5] = _c.z;
      }
      o.mesh.geometry.attributes.position.needsUpdate = true;
      o.mesh.geometry.attributes.normal.needsUpdate = true;
    });
    mm.uniforms.uTime.value = t;
    motes.position.y = state.scroll * .6;
    renderer.render(scene, camera);
  }

  /* render loop: only while the hero is on screen and the tab is visible */
  const T0 = performance.now();
  const now = () => (performance.now() - T0) / 1000;
  let visible = true, raf = 0;
  /* a lost context (phones drop it under memory pressure): stop the loop and show the SVG still */
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; visible = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } svgStill(); });
  function tick() { raf = 0; if (!visible || document.hidden) return; frame(now()); raf = requestAnimationFrame(tick); }
  const run = () => { if (REDUCE) { frame(STILL_T); return; } if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = !lost && es[es.length - 1].isIntersecting; if (visible) run(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }, { rootMargin: '60px 0px' }).observe(hero);
  }
  document.addEventListener('visibilitychange', run);
  document.addEventListener('saa:theme', () => { paint(); frame(REDUCE ? STILL_T : now()); });

  let lw = innerWidth, lh = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (Math.abs(innerWidth - lw) < 1 && Math.abs(innerHeight - lh) < 120) return;   // ignore phone toolbar jitter
      lw = innerWidth; lh = innerHeight;
      const s2 = STACK.matches;
      if (s2 !== small) { small = s2; model = makeModel(small); S = small ? 72 : 120; build(); }
      size(); frame(REDUCE ? STILL_T : now());
    }, 150);
  });
  if (FINE && !REDUCE) {
    hero.addEventListener('pointermove', e => { state.tx = e.clientX / innerWidth * 2 - 1; state.ty = e.clientY / innerHeight * 2 - 1; });
    hero.addEventListener('pointerleave', () => { state.tx = state.ty = 0; });
  }

  /* the hero's height follows its copy (fonts, translations, the heading fit): keep the renderer and camera in step */
  if ('ResizeObserver' in window) {
    let ro = 0, rw = 0, rh = 0;
    new ResizeObserver(es => {
      const b = es[es.length - 1].contentRect;
      if (Math.abs(b.width - rw) < 1 && Math.abs(b.height - rh) < 1) return;
      rw = b.width; rh = b.height;
      clearTimeout(ro); ro = setTimeout(() => { if (!lost) { size(); frame(REDUCE ? STILL_T : now()); } }, 100);
    }).observe(hero);
  }

  size(); build(); run();
  return {
    play() { if (state.t0 === null) { state.t0 = now(); run(); } },
    scroll(p) { state.scroll = p; if (REDUCE) frame(STILL_T); },
    settled: () => state.t0 !== null
  };

  /* --- No WebGL: the same model, projected once into an SVG still --- */
  function svgStill() {
    hero.classList.add('no-gl');
    function draw() {
      computeLayout(); place(); group.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const fills = isLight() ? SVG_FILL.light : SVG_FILL.dark;
      const SS = 48, pos = Array.from({ length: SS + 1 }, () => new THREE.Vector3()), side = Array.from({ length: SS + 1 }, () => new THREE.Vector3());
      const v = new THREE.Vector3();
      const scr = p => { v.copy(p).applyMatrix4(group.matrixWorld).project(camera); return ((v.x + 1) / 2 * W).toFixed(1) + ',' + ((1 - v.y) / 2 * H).toFixed(1); };
      const order = [GREEN, BLACK, WHITE, RED];
      let out = '';
      order.forEach(col => model.ribbons.filter(rb => rb.col === col).forEach(rb => {
        ribbonFrame(model, rb, SS, rb.L, STILL_T, 1, pos, side);
        const a = [], b = [];
        for (let i = 0; i <= SS; i++) { a.push(scr(_a.copy(pos[i]).add(side[i]))); b.unshift(scr(_a.copy(pos[i]).sub(side[i]))); }
        const stroke = col === BLACK ? (isLight() ? '' : ' stroke="rgba(98,184,218,.35)" stroke-width="1"') : col === WHITE && isLight() ? ' stroke="rgba(25,46,73,.22)" stroke-width="1"' : '';
        out += '<path d="M' + a.join('L') + 'L' + b.join('L') + 'Z" fill="' + fills[col] + '"' + stroke + '/>';
      }));
      still.innerHTML = '<svg viewBox="0 0 ' + Math.round(W) + ' ' + Math.round(H) + '" preserveAspectRatio="none" focusable="false">' + out + '</svg>';
    }
    draw();
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 200); });
    document.addEventListener('saa:theme', draw);
    return { play() {}, scroll() {}, settled: () => true };
  }
}

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
const hero = document.querySelector('.emh');
const flagCanvas = document.getElementById('emhFlag');
let flag = null;
try { flag = hero && flagCanvas ? flagScene(hero, flagCanvas, document.getElementById('emhStill')) : null; }
catch (err) { console.error(err); if (hero) hero.classList.add('no-gl'); }

/* the ribbons fly in when the page is revealed (after the preloader); a timer covers a missing GSAP */
const playTimer = setTimeout(() => flag && flag.play(), 2600);

const founder = document.getElementById('founder');

/* pointer spotlight on the sector tiles (no GSAP needed) */
if (FINE) {
  document.querySelectorAll('.ems-tile').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
}

window.SAA && window.SAA.ready(({ gsap, ScrollTrigger, reduce, split }) => {
  clearTimeout(playTimer);
  if (flag) flag.play();

  const figs = document.querySelectorAll('.emf-item:not([hidden])');
  const steps = document.querySelector('.emr-steps');
  const stepItems = steps ? [...steps.querySelectorAll('.emr-step')] : [];
  const ctaPaths = document.querySelectorAll('.emc-r');

  if (reduce || !ScrollTrigger) {
    if (steps) steps.style.setProperty('--p', 1);
    stepItems.forEach(s => s.classList.add('on'));
    return;
  }

  /* flag-colour rules draw across as their section arrives */
  document.querySelectorAll('.em-flagrule').forEach(r => {
    gsap.fromTo(r, { '--k': 0 }, { '--k': 1, duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: r.parentElement, start: 'top 88%', once: true } });
  });

  /* Founder: the Arabic original writes itself in from the right, then the English and the attribution */
  if (founder) {
    const tl = gsap.timeline({ scrollTrigger: { trigger: founder, start: 'top 62%', once: true } });
    tl.from(founder.querySelector('.emz-eyebrow'), { y: 20, opacity: 0, duration: .8, ease: 'expo.out' })
      .fromTo(founder.querySelector('.emz-ar'), { clipPath: 'inset(-20% 0% -20% 100%)' }, { clipPath: 'inset(-20% 0% -20% 0%)', duration: 1.8, ease: 'power3.inOut', clearProps: 'clipPath' }, .1)
      .from(founder.querySelectorAll('.emz-en, .emz-cite'), { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .12 }, .9);
    gsap.from(founder.querySelectorAll('.emz-card, .emz-bridge'), { y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .1, scrollTrigger: { trigger: founder.querySelector('.emz-cards'), start: 'top 85%', once: true } });
  }

  /* Work hard: the tiles rise, their colour bars run across and the icons draw */
  const wtiles = document.querySelectorAll('.emw-tile');
  if (wtiles.length) {
    const wshapes = [...document.querySelectorAll('.emw-ico path')];
    wshapes.forEach(el => el.setAttribute('pathLength', '1'));
    gsap.set(wshapes, { strokeDasharray: 1, strokeDashoffset: 1 });
    const wt = gsap.timeline({ scrollTrigger: { trigger: '.emw-grid', start: 'top 82%', once: true } });
    wt.from(wtiles, { y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .12 })
      .fromTo(document.querySelectorAll('.emw-bar'), { '--k': 0 }, { '--k': 1, duration: 1.1, ease: 'expo.inOut', stagger: .12 }, .15)
      .to(wshapes, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut', stagger: .06 }, .3);
  }

  /* hero: the copy arrives after the ribbons start, and drifts up as the page scrolls */
  const heroCopy = hero.querySelectorAll('.emh-crumbs, .emh-eyebrow, .emh-lead, .emh-actions, .emh-foot');
  gsap.from(heroCopy, { y: 30, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .08, delay: .9 });
  if (flag) {
    ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', scrub: true, onUpdate: st => flag.scroll(st.progress) });
  }
  gsap.to(hero.querySelector('.emh-inner'), { yPercent: -10, opacity: .2, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

  /* figures: each flag-colour rule draws in as its row arrives */
  gsap.fromTo(figs, { '--k': 0 }, { '--k': 1, duration: 1.2, ease: 'expo.out', stagger: .12, scrollTrigger: { trigger: '.emf-grid', start: 'top 85%', once: true } });
  gsap.from(figs, { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .1, scrollTrigger: { trigger: '.emf-grid', start: 'top 85%', once: true } });

  /* steps: the rail fills with scroll and lights each step; icons draw themselves */
  if (steps) {
    const shapes = stepItems.map(s => [...s.querySelectorAll('.emr-ico path, .emr-ico rect, .emr-ico circle')]);
    shapes.flat().forEach(el => el.setAttribute('pathLength', '1'));
    gsap.set(shapes.flat(), { strokeDasharray: 1, strokeDashoffset: 1 });
    const drawn = new Set();
    let top = 0;       // the rail only ever fills forwards, so the section ends complete
    const light = p => stepItems.forEach((s, i) => {
      const on = p >= i / Math.max(1, stepItems.length - 1) - .02;
      s.classList.toggle('on', on);
      if (on && !drawn.has(i)) { drawn.add(i); gsap.to(shapes[i], { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: .12 }); }
    });
    ScrollTrigger.create({
      trigger: steps, start: 'top 72%', end: 'bottom 62%', scrub: .6,
      onUpdate: st => { top = Math.max(top, st.progress); steps.style.setProperty('--p', top.toFixed(3)); light(top); },
      onRefresh: st => { top = Math.max(top, st.progress); steps.style.setProperty('--p', top.toFixed(3)); light(top); }
    });
    gsap.from(stepItems, { y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .12, scrollTrigger: { trigger: steps, start: 'top 85%', once: true } });
  }

  /* sectors: tiles rise in */
  gsap.from('.ems-tile', { y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: '.ems-grid', start: 'top 85%', once: true } });

  /* Chairman's quote: the words light up with the scroll, and stay lit */
  const hl = document.querySelector('.emq-hl');
  if (hl && split) {
    hl.dataset.split = 'words';
    const words = [...split(hl)];
    gsap.set(words, { opacity: .16 });
    let lit = 0;
    ScrollTrigger.create({
      trigger: hl, start: 'top 82%', end: 'bottom 50%',
      onUpdate: st => litTo(st.progress), onRefresh: st => litTo(st.progress)
    });
    function litTo(p) {
      const n = Math.round(p * words.length);
      if (n <= lit) return;
      gsap.to(words.slice(lit, n), { opacity: 1, duration: .5, ease: 'power2.out', stagger: .03 });
      lit = n;
    }
  }

  /* closing call to action: the four ribbons draw in, then drift with the scroll */
  if (ctaPaths.length) {
    ctaPaths.forEach(p => p.setAttribute('pathLength', '1'));
    gsap.fromTo(ctaPaths, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2, ease: 'power3.inOut', stagger: .12, scrollTrigger: { trigger: '.emc', start: 'top 75%', once: true } });
    gsap.fromTo('.emc-ribbons', { yPercent: 8 }, { yPercent: -8, ease: 'none', scrollTrigger: { trigger: '.emc', start: 'top bottom', end: 'bottom top', scrub: true } });
  }
});
