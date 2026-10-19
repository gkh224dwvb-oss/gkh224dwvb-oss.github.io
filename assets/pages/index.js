/* =========================================================================
   HOME — page script
   Signature set piece: a night-time offshore platform over a living ocean,
   rendered with plain WebGL (classic script, so it also runs from file://,
   where ES module imports are blocked). Pinned hero: the camera dollies in
   as you scroll and the headline lifts away.
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  /* fewer cores or little memory: a lighter ocean, fewer particles and a lower pixel ratio */
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  /* yield to the browser between the heavy setup steps, so no single task blocks input for long */
  const yieldTask = () => new Promise(r => setTimeout(r, 0));

  /* =======================================================================
     1. HERO SCENE
     ======================================================================= */
  async function initHero() {
    const hero = document.querySelector('.hero');
    const canvas = document.getElementById('heroGL');
    if (!hero || !canvas) return;
    const stage = canvas.parentElement;

    const opts = { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' };
    let gl = null;
    try { gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts); } catch (_) { gl = null; }
    if (!gl) { hero.classList.add('gl-off'); return; }
    await yieldTask();

    /* ---------- GLSL ----------
       Every shader is compiled in two variants: night (dark mode, the original scene) and, with DAY defined,
       a morning version for light mode (pale sky and sea, navy steel, alpha-blended lights instead of additive glows). */
    const FP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
    const SKY_FN = `
uniform vec3 uGlowDir;
#ifdef DAY
/* morning: pale haze on the horizon, soft blue overhead, warm light toward the glow and the sun above the frame */
uniform vec3 uSun;
vec3 skyCol(vec3 d) {
  float hp = max(d.y, 0.0);
  vec3 top = vec3(0.47, 0.69, 0.84);
  vec3 mid = vec3(0.74, 0.86, 0.92);
  vec3 hor = vec3(0.92, 0.95, 0.95);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.12, hp));
  c = mix(c, top, smoothstep(0.08, 0.5, hp));
  vec2 az2 = normalize(d.xz + vec2(1e-5));
  float focus = pow(max(dot(az2, normalize(uGlowDir.xz)), 0.0), 7.0);
  c = mix(c, vec3(1.0, 0.96, 0.89), exp(-hp * 6.0) * (0.12 + 0.5 * focus));
  float s = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.95, 0.84) * (pow(s, 6.0) * 0.16 + pow(s, 60.0) * 0.3);
  return min(c, vec3(1.0));
}
#else
vec3 skyCol(vec3 d) {
  float hp = max(d.y, 0.0);
  vec3 top = vec3(0.006, 0.020, 0.046);
  vec3 mid = vec3(0.014, 0.050, 0.100);
  vec3 hor = vec3(0.036, 0.118, 0.190);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, hp));
  c = mix(c, top, smoothstep(0.12, 0.62, hp));
  vec2 az2 = normalize(d.xz + vec2(1e-5));
  float focus = pow(max(dot(az2, normalize(uGlowDir.xz)), 0.0), 7.0);
  c += vec3(0.0, 0.30, 0.29) * exp(-hp * 9.0) * (0.12 + 0.42 * focus);
  c += vec3(0.10, 0.52, 0.50) * exp(-hp * 46.0) * focus * 0.22;
  return c;
}
#endif
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;
    const NOISE = `
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;
    const SKY_VS = `attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
    const SKY_FS = FP + SKY_FN + NOISE + `
uniform vec3 uRight, uUp, uFwd; uniform vec2 uTan, uShift; uniform float uTime, uPx;
varying vec2 vNdc;
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
void main(){
  vec3 d = normalize(uFwd + uRight * (vNdc.x - uShift.x) * uTan.x + uUp * (vNdc.y - uShift.y) * uTan.y);
  vec3 c = skyCol(d);
  float cl = 0.0;
  if (d.y > -0.01 && d.y < 0.4) {
    vec2 q = vec2(atan(d.x, -d.z) * 2.4 + uTime * 0.0035, d.y * 22.0);
    float n = fbm(q * vec2(1.0, 0.9));
    float band = smoothstep(0.012, 0.06, d.y) * (1.0 - smoothstep(0.14, 0.36, d.y));
    cl = smoothstep(0.5, 0.78, n) * band;
#ifdef DAY
    vec3 cc = mix(vec3(0.80, 0.86, 0.91), vec3(1.0, 0.99, 0.97), smoothstep(0.55, 0.9, n));
    c = mix(c, cc, cl * 0.7);
#else
    vec3 lit = skyCol(normalize(vec3(d.x, 0.0, d.z)));
    vec3 cc = mix(vec3(0.010, 0.030, 0.058), lit, 0.45 * (1.0 - smoothstep(0.0, 0.2, d.y)));
    c = mix(c, cc, cl * 0.75);
#endif
  }
#ifndef DAY
  if (d.y > 0.015) {
    vec3 p = d * 240.0; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
    float h = hash13(id);
    if (h > 0.955) {
      vec3 o = (hash33(id) - 0.5) * 0.6;
      float b = (h - 0.955) / 0.045;
      float tw = 0.65 + 0.35 * sin(uTime * (0.8 + b * 2.5) + h * 91.0);
      float s = smoothstep(uPx * 1.5, 0.0, length(f - o));
      c += vec3(0.72, 0.86, 0.94) * s * (0.12 + b * b * 0.9) * tw * smoothstep(0.015, 0.22, d.y) * (1.0 - cl);
    }
  }
#endif
  c += (hash12(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

    const WAVES = `
float waveH(vec2 p, float t) {
  float h = 0.0;
  h += 0.50 * sin(dot(p, vec2(0.090, 0.040)) + t * 0.80);
  h += 0.32 * sin(dot(p, vec2(-0.050, 0.115)) + t * 0.95 + 1.3);
  h += 0.20 * sin(dot(p, vec2(0.160, -0.090)) + t * 1.30 + 2.1);
  h += 0.12 * sin(dot(p, vec2(-0.230, -0.170)) + t * 1.70 + 0.4);
  return h;
}`;
    const OCEAN_VS = WAVES + `
attribute vec2 aXZ; uniform mat4 uVP; uniform float uTime; uniform vec3 uCam;
varying vec3 vW;
void main(){
  vec3 w = vec3(aXZ.x, 0.0, aXZ.y);
  float fade = 1.0 - smoothstep(140.0, 420.0, length(w.xz - uCam.xz));
  w.y = waveH(w.xz, uTime) * fade;
  vW = w;
  gl_Position = uVP * vec4(w, 1.0);
}`;
    const OCEAN_FS = FP + SKY_FN + `
uniform vec3 uCam, uFlame, uL0, uL1, uL2; uniform float uTime, uFlick, uFogK, uOct;
varying vec3 vW;
vec2 grad(vec2 p, float t, float dist) {
  vec2 g = vec2(0.0); vec2 k;
  k = vec2(0.090, 0.040);  g += 0.50 * k * cos(dot(p, k) + t * 0.80);
  k = vec2(-0.050, 0.115); g += 0.32 * k * cos(dot(p, k) + t * 0.95 + 1.3);
  k = vec2(0.160, -0.090); g += 0.20 * k * cos(dot(p, k) + t * 1.30 + 2.1);
  k = vec2(-0.230, -0.170);g += 0.12 * k * cos(dot(p, k) + t * 1.70 + 0.4);
  float fade = 1.0 - smoothstep(140.0, 420.0, dist);
  g *= fade;
  float a = 0.085, f = 0.40, ang = 0.6;
  for (int i = 0; i < 9; i++) {
    if (float(i) >= uOct) break;
    vec2 dir = vec2(cos(ang), sin(ang));
    float w = sqrt(9.8 * f) * 0.55;
    float att = exp(-dist * f * 0.010);
    g += a * f * dir * cos(dot(p, dir) * f + t * w + float(i) * 1.7) * att;
    a *= 0.72; f *= 1.47; ang += 2.39996;
  }
  return g;
}
float boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z), tf = min(min(tmax.x, tmax.y), tmax.z);
  return (tf > max(tn, 0.0)) ? 1.0 : 0.0;
}
#ifdef DAY
/* soft boxHit for the pale morning sea: 1 where the ray passes through the box, easing to 0 as it misses by up to
   k along the ray. A hard 0/1 mask breaks up into stair-edged grey stains on light water. */
float boxSoft(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, float k) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z), tf = min(min(tmax.x, tmax.y), tmax.z);
  return tf > 0.0 ? 1.0 - smoothstep(-0.25 * k, k, tn - tf) : 0.0;
}
#endif
float streak(vec3 R, vec3 L, vec3 w, float azK, float elK) {
  vec3 l = normalize(L - w);
  float ca = max(dot(normalize(R.xz + vec2(1e-5)), normalize(l.xz + vec2(1e-5))), 0.0);
  float de = R.y - l.y;
  return pow(ca, azK) * exp(-de * de * elK);
}
float lobe(vec3 R, vec3 L, vec3 w, float e) { return pow(max(dot(R, normalize(L - w)), 0.0), e); }
void main(){
  float dist = length(vW.xz - uCam.xz);
  vec2 g = grad(vW.xz, uTime, dist);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(uCam - vW);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
  vec3 refl = skyCol(R);
#ifdef DAY
  /* morning sea: teal water under a sky reflection, a soft navy reflection of the platform, sun glitter toward the glow */
  float occ = max(boxSoft(vW, R, vec3(-12.5, 11.0, -8.5), vec3(12.5, 16.6, 8.5), 10.0), boxSoft(vW, R, vec3(-11.5, 16.6, -7.5), vec3(11.8, 24.0, 3.0), 10.0));
  refl = mix(refl * vec3(0.66, 0.80, 0.87), vec3(0.13, 0.25, 0.34), occ * 0.35);
  vec3 col = mix(vec3(0.02, 0.26, 0.34), refl, fres * 0.9);
  vec3 Lg = normalize(vec3(uGlowDir.x, 0.05, uGlowDir.z));
  float cg = max(dot(R, Lg), 0.0);
  col += vec3(1.0, 0.97, 0.90) * (pow(cg, 900.0) * 4.0 + pow(cg, 60.0) * 0.1) * (1.0 - occ);
  col += vec3(1.0, 0.95, 0.86) * streak(R, vW + Lg * 1000.0, vW, 260.0, 900.0) * 0.14 * (1.0 - occ);
  col += vec3(1.0, 0.50, 0.18) * streak(R, uFlame, vW, 1500.0, 3.2) * 0.16 * uFlick;
#else
  float occ = max(boxHit(vW, R, vec3(-12.5, 11.0, -8.5), vec3(12.5, 16.6, 8.5)), boxHit(vW, R, vec3(-11.5, 16.6, -7.5), vec3(11.8, 24.0, 3.0)));
  refl = mix(refl, vec3(0.012, 0.03, 0.055), occ);
  vec3 water = vec3(0.004, 0.017, 0.036);
  vec3 col = mix(water, refl, fres);
  vec3 Lg = normalize(vec3(uGlowDir.x, 0.035, uGlowDir.z));
  float cg = max(dot(R, Lg), 0.0);
  col += vec3(0.42, 0.86, 0.82) * (pow(cg, 900.0) * 7.0 + pow(cg, 70.0) * 0.10) * (1.0 - occ);
  col += vec3(0.30, 0.80, 0.76) * streak(R, vW + Lg * 1000.0, vW, 260.0, 900.0) * 0.16 * (1.0 - occ);
  float fs = streak(R, uFlame, vW, 1500.0, 3.2) * 1.3 + lobe(R, uFlame, vW, 12.0) * 0.05;
  col += vec3(1.0, 0.58, 0.24) * fs * uFlick;
  float dl = streak(R, uL0, vW, 3000.0, 6.0) + streak(R, uL1, vW, 3000.0, 6.0) + streak(R, uL2, vW, 3000.0, 6.0);
  col += vec3(1.0, 0.72, 0.42) * dl * 0.45;
  float pool = exp(-dot(vW.xz - vec2(-2.0, 4.0), vW.xz - vec2(-2.0, 4.0)) / 900.0);
  col += vec3(0.30, 0.17, 0.07) * pool * 0.07 * (0.8 + 0.2 * uFlick);
#endif
  vec3 vd = normalize(vW - uCam);
  float fog = 1.0 - exp(-pow(dist * uFogK, 2.0));
  col = mix(col, skyCol(normalize(vec3(vd.x, 0.0, vd.z))), fog);
  col += (hash12(gl_FragCoord.xy + uTime * 7.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

    const SOLID_VS = `
attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uVP;
varying vec3 vW; varying vec3 vN;
void main(){ vW = aPos; vN = aNor; gl_Position = uVP * vec4(aPos, 1.0); }`;
    const SOLID_FS = FP + SKY_FN + `
uniform vec3 uCam, uFlame, uL0, uL1, uL2, uL3; uniform float uFlick, uFogK;
#ifdef DAY
uniform vec3 uKey;
#endif
varying vec3 vW; varying vec3 vN;
vec3 pt(vec3 n, vec3 L, float k, float wrap) {
  vec3 l = L - vW; float d2 = dot(l, l); l *= inversesqrt(d2);
  return vec3((max(dot(n, l), 0.0) * (1.0 - wrap) + wrap) * k / (d2 + 14.0));
}
void main(){
  vec3 n = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(n, V) < 0.0) n = -n;
#ifdef DAY
  /* navy painted steel: sky light from above, sea bounce from below, morning sun, teal edge light */
  float vert = 1.0 - abs(n.y);
  float coord = abs(n.x) > abs(n.z) ? vW.z : vW.x;
  float rib = smoothstep(0.40, 0.5, abs(fract(coord * 1.7) - 0.5));
  float band = smoothstep(0.44, 0.5, abs(fract(vW.y * 0.45 + 0.1) - 0.5));
  vec3 amb = mix(vec3(0.34, 0.47, 0.52), vec3(0.80, 0.88, 0.94), n.y * 0.5 + 0.5);
  vec3 col = vec3(0.13, 0.23, 0.35) * (amb + vec3(1.0, 0.93, 0.82) * max(dot(n, uKey), 0.0) * 1.3);
  col *= 1.0 - 0.3 * max(rib, band) * vert;
  col += vec3(1.0, 0.55, 0.22) * pt(n, uFlame, 34.0, 0.0) * uFlick * 0.12;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col += vec3(0.0, 0.63, 0.61) * rim * 0.16;
#else
  vec3 col = vec3(0.012, 0.030, 0.058);
  vec3 lit = vec3(1.0, 0.55, 0.22) * pt(n, uFlame, 34.0, 0.0) * uFlick;
  vec3 warm = vec3(1.0, 0.70, 0.40);
  lit += warm * (pt(n, uL0, 3.4, 0.12) + pt(n, uL1, 3.4, 0.12) + pt(n, uL2, 3.0, 0.12) + pt(n, uL3, 2.6, 0.12));
  float vert = 1.0 - abs(n.y);
  float coord = abs(n.x) > abs(n.z) ? vW.z : vW.x;
  float rib = smoothstep(0.40, 0.5, abs(fract(coord * 1.7) - 0.5));
  float band = smoothstep(0.44, 0.5, abs(fract(vW.y * 0.45 + 0.1) - 0.5));
  col += lit * (1.0 - 0.45 * max(rib, band) * vert) + lit * 0.25 * pow(1.0 - abs(dot(n, V)), 2.0);
  col += vec3(0.02, 0.07, 0.09) * max(n.y, 0.0) * 0.5;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col += vec3(0.04, 0.28, 0.28) * rim * 0.22;
#endif
  float dist = length(vW - uCam);
  float fog = 1.0 - exp(-pow(dist * uFogK, 2.0));
  vec3 vd = normalize(vW - uCam);
  col = mix(col, skyCol(normalize(vec3(vd.x, max(vd.y, 0.0), vd.z))), fog);
  gl_FragColor = vec4(col, 1.0);
}`;

    const SPRITE_VS = `
attribute vec3 aCenter; attribute vec2 aCorner; attribute vec4 aColor; attribute vec3 aParams;
uniform mat4 uView, uProj; uniform float uTime, uFlick, uMinPx, uResY;
varying vec2 vC; varying vec3 vCol; varying float vKind;
#ifdef DAY
varying float vA;
#endif
void main(){
  vec4 mv = uView * vec4(aCenter, 1.0);
  float size = aParams.x, ph = aParams.y, kind = aParams.z;
  float depth = max(-mv.z, 0.1);
  float px = size * uProj[1][1] * uResY * 0.5 / depth;
  float s = max(1.0, uMinPx / px);
  float tw = 1.0;
  if (kind < 0.5) tw = 0.84 + 0.16 * sin(uTime * (1.2 + fract(ph * 7.0) * 2.4) + ph * 6.283);
  else if (kind < 1.5) tw = uFlick;
  else if (kind < 2.5) tw = 0.08 + 0.92 * smoothstep(0.32, 0.0, abs(fract(uTime * 0.55 + ph) - 0.2));
  mv.xy += aCorner * size * s;
  gl_Position = uProj * mv;
  vC = aCorner; vKind = kind;
#ifdef DAY
  vCol = aColor.rgb; vA = aColor.a * tw / s;
#else
  vCol = aColor.rgb * aColor.a * tw / s;
#endif
}`;
    const SPRITE_FS = FP + `
varying vec2 vC; varying vec3 vCol; varying float vKind;
#ifdef DAY
varying float vA;
#endif
void main(){
  float r2 = dot(vC, vC);
  if (r2 > 1.0) discard;
  float a = (vKind > 0.5 && vKind < 1.5) || vKind > 2.5 ? exp(-r2 * 4.5) * (1.0 - r2) : exp(-r2 * 16.0) + exp(-r2 * 3.5) * 0.16 * (1.0 - r2);
#ifdef DAY
  gl_FragColor = vec4(vCol, 1.0) * min(a * vA, 1.0);
#else
  gl_FragColor = vec4(vCol * a, 1.0);
#endif
}`;

    const FLAME_VS = `
attribute vec2 aCorner; attribute vec3 aSeed;
uniform mat4 uView, uProj; uniform float uTime, uFlick; uniform vec3 uOrigin, uDir, uWind;
varying vec2 vC; varying vec3 vCol;
#ifdef DAY
varying float vA;
#endif
void main(){
  float life = fract(uTime * (0.8 + aSeed.x * 0.75) + aSeed.y);
  vec3 j = vec3(fract(aSeed.z * 13.7), fract(aSeed.x * 7.3 + aSeed.y), fract(aSeed.y * 3.1 + aSeed.z)) - 0.5;
  float h = (5.0 + aSeed.z * 4.0) * (0.8 + 0.2 * uFlick);
  float tb = life * life;
  vec3 sway = vec3(sin(uTime * 7.0 + aSeed.x * 40.0 + life * 6.0), 0.4 * sin(uTime * 5.0 + aSeed.z * 30.0), cos(uTime * 6.0 + aSeed.y * 40.0 + life * 5.0));
  vec3 c = uOrigin + j * vec3(1.3, 0.5, 1.3) * (0.22 + life * 1.15)
         + uDir * life * h + uWind * tb * 4.2 + sway * 0.6 * tb;
  float size = (0.5 + aSeed.z * 0.7) * (0.35 + 1.6 * sin(3.14159 * min(life * 1.1, 1.0)));
  vec4 mv = uView * vec4(c, 1.0);
  mv.xy += aCorner * size;
  gl_Position = uProj * mv;
  vC = aCorner;
  vec3 col = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.62, 0.22), smoothstep(0.0, 0.14, life));
  col = mix(col, vec3(0.92, 0.30, 0.06), smoothstep(0.16, 0.55, life));
  col = mix(col, vec3(0.42, 0.08, 0.02), smoothstep(0.55, 1.0, life));
  float edge = 0.6 + 0.4 * fract(aSeed.z * 31.7);
#ifdef DAY
  vCol = col; vA = smoothstep(0.0, 0.05, life) * (1.0 - smoothstep(0.45, 1.0, life)) * 0.2 * edge;
#else
  vCol = col * smoothstep(0.0, 0.05, life) * (1.0 - smoothstep(0.45, 1.0, life)) * 0.16 * edge;
#endif
}`;
    const FLAME_FS = FP + `
varying vec2 vC; varying vec3 vCol;
#ifdef DAY
varying float vA;
void main(){ float r2 = dot(vC, vC); if (r2 > 1.0) discard; float a = 1.0 - r2; gl_FragColor = vec4(vCol, 1.0) * a * a * vA; }
#else
void main(){ float r2 = dot(vC, vC); if (r2 > 1.0) discard; float a = 1.0 - r2; gl_FragColor = vec4(vCol * a * a, 1.0); }
#endif
`;

    const SMOKE_VS = `
attribute vec2 aCorner; attribute vec3 aSeed;
uniform mat4 uView, uProj; uniform float uTime; uniform vec3 uOrigin, uWind;
varying vec2 vC; varying float vA; varying float vWarm;
void main(){
  float life = fract(uTime * (0.045 + aSeed.x * 0.035) + aSeed.y);
  vec3 j = vec3(fract(aSeed.z * 13.7) - 0.5, 0.0, fract(aSeed.x * 7.3 + aSeed.y) - 0.5);
  vec3 c = uOrigin + vec3(0.0, 6.0 + life * 24.0, 0.0) + uWind * life * 20.0 + j * (1.5 + life * 9.0);
  float size = 2.0 + life * 8.5 + aSeed.z * 2.0;
  vec4 mv = uView * vec4(c, 1.0);
  mv.xy += aCorner * size;
  gl_Position = uProj * mv;
  vC = aCorner;
  vA = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.35, 1.0, life)) * 0.42;
  vWarm = 1.0 - smoothstep(0.0, 0.25, life);
}`;
    const SMOKE_FS = FP + `
varying vec2 vC; varying float vA; varying float vWarm;
void main(){
  float r2 = dot(vC, vC); if (r2 > 1.0) discard;
  float a = 1.0 - r2; a *= a * vA;
#ifdef DAY
  gl_FragColor = vec4(mix(vec3(0.78, 0.82, 0.86), vec3(1.0, 0.76, 0.56), vWarm), a * 0.34);
#else
  gl_FragColor = vec4(mix(vec3(0.05, 0.075, 0.10), vec3(0.36, 0.17, 0.07), vWarm), a);
#endif
}`;

    /* ---------- GL helpers ---------- */
    function program(vs, fs) {
      const mk = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
      const u = {}, a = {};
      for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
      }
      for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i < n; i++) {
        const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name);
      }
      return { p, u, a };
    }
    function buffer(data, target = gl.ARRAY_BUFFER) {
      const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
    }
    let enabled = [];
    function attribs(prog, buf, stride, layout) {
      enabled.forEach(l => gl.disableVertexAttribArray(l)); enabled = [];
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      layout.forEach(([name, size, off]) => {
        const loc = prog.a[name]; if (loc === undefined || loc < 0) return;
        gl.enableVertexAttribArray(loc); enabled.push(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
      });
    }

    /* ---------- Geometry: platform built from primitives ---------- */
    const V = [];   // x,y,z,nx,ny,nz
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const nrm = a => scl(a, 1 / (len(a) || 1));
    const pv = (p, n) => V.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    function quad(a, b, c, d, n) { pv(a, n); pv(b, n); pv(c, n); pv(a, n); pv(c, n); pv(d, n); }
    function box(x0, y0, z0, x1, y1, z1) {
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    }
    function strut(a, b, r, seg = 4, caps = false) {
      const w = nrm(sub(b, a));
      const t = Math.abs(w[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
      const u = nrm(cross(w, t)), v = cross(w, u);
      const ring = [];
      for (let i = 0; i <= seg; i++) { const q = i / seg * Math.PI * 2; ring.push(add(scl(u, Math.cos(q)), scl(v, Math.sin(q)))); }
      for (let i = 0; i < seg; i++) {
        const n0 = ring[i], n1 = ring[i + 1];
        const a0 = add(a, scl(n0, r)), a1 = add(a, scl(n1, r)), b0 = add(b, scl(n0, r)), b1 = add(b, scl(n1, r));
        pv(a0, n0); pv(a1, n1); pv(b1, n1); pv(a0, n0); pv(b1, n1); pv(b0, n0);
        if (caps) {
          const nb = w, na = scl(w, -1);
          pv(b, nb); pv(b0, nb); pv(b1, nb);
          pv(a, na); pv(a1, na); pv(a0, na);
        }
      }
    }
    function tower(cx, cz, y0, y1, h0, h1, levels, r) {
      const corners = (y, hw) => [[cx - hw, y, cz - hw], [cx + hw, y, cz - hw], [cx + hw, y, cz + hw], [cx - hw, y, cz + hw]];
      let prev = corners(y0, h0);
      for (let l = 1; l <= levels; l++) {
        const t = l / levels, cur = corners(lerp(y0, y1, t), lerp(h0, h1, t));
        for (let k = 0; k < 4; k++) {
          const k1 = (k + 1) % 4;
          strut(prev[k], cur[k], r * 1.5, 4);
          strut(cur[k], cur[k1], r, 3);
          strut(prev[k], cur[k1], r * .8, 3);
          strut(prev[k1], cur[k], r * .8, 3);
        }
        prev = cur;
      }
    }
    function truss(a, b, w0, w1, bays, r, sides) {
      const w = nrm(sub(b, a)), u = nrm(cross(w, [0, 1, 0])), v = cross(u, w);
      let prev = null;
      for (let i = 0; i <= bays; i++) {
        const t = i / bays, c = mix3(a, b, t), wd = lerp(w0, w1, t);
        const pts = [];
        for (let k = 0; k < sides; k++) { const q = k / sides * Math.PI * 2 + Math.PI / 2; pts.push(add(c, add(scl(u, Math.cos(q) * wd), scl(v, Math.sin(q) * wd)))); }
        for (let k = 0; k < sides; k++) {
          strut(pts[k], pts[(k + 1) % sides], r * .8, 3);
          if (prev) { strut(prev[k], pts[k], r * 1.4, 4); strut(prev[k], pts[(k + 1) % sides], r * .7, 3); }
        }
        prev = pts;
      }
    }

    /* jacket: battered legs, horizontal rings, X-bracing, conductors */
    const legTop = [[-8, 11, -5.5], [8, 11, -5.5], [8, 11, 5.5], [-8, 11, 5.5]];
    const legBot = [[-10.6, -6, -7.6], [10.6, -6, -7.6], [10.6, -6, 7.6], [-10.6, -6, 7.6]];
    const legAt = (k, y) => mix3(legBot[k], legTop[k], (y + 6) / 17);
    for (let k = 0; k < 4; k++) strut(legBot[k], legTop[k], .5, 12);
    const lv = [-3, 1.6, 6.2, 10.6];
    lv.forEach((y, i) => {
      for (let k = 0; k < 4; k++) strut(legAt(k, y), legAt((k + 1) % 4, y), .2, 6);
      if (i) for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) % 4, y0 = lv[i - 1];
        strut(legAt(k, y0), legAt(k1, y), .15, 5); strut(legAt(k1, y0), legAt(k, y), .15, 5);
      }
    });
    [-2.4, -.8, .8, 2.4].forEach(x => [-1, 1].forEach(z => strut([x, -6, z], [x, 15.6, z], .2, 6)));
    /* columns between decks */
    for (let k = 0; k < 4; k++) strut(legTop[k], [legTop[k][0], 15.6, legTop[k][2]], .55, 12);
    strut([0, 11.8, 5.5], [0, 15.6, 5.5], .35, 8); strut([0, 11.8, -5.5], [0, 15.6, -5.5], .35, 8);
    strut([-8, 11.8, 5.5], [0, 15.4, 5.5], .16, 5); strut([8, 11.8, 5.5], [0, 15.4, 5.5], .16, 5);
    /* cellar deck + equipment */
    box(-11, 11, -7.6, 11, 11.8, 7.6);
    strut([-7, 13.1, 1.5], [-1, 13.1, 1.5], 1.2, 14, true);
    strut([1.5, 13.3, -2], [7.5, 13.3, -2], 1.4, 14, true);
    box(2, 11.8, 2.5, 4.6, 13.6, 5); box(-9.6, 11.8, -6, -6.4, 14.4, -2.4);
    [[-4, -4], [-3.2, -4], [5.5, 4], [9, -3]].forEach(([x, z]) => strut([x, 11.8, z], [x, 15.6, z], .14, 5));
    /* main deck */
    box(-12.5, 15.6, -8.5, 12.5, 16.6, 8.5);
    for (let x = -12.4; x <= 12.5; x += 2.48) strut([x, 16.6, 8.4], [x, 17.7, 8.4], .05, 3);
    for (let z = -8.4; z <= 8.5; z += 2.8) strut([12.4, 16.6, z], [12.4, 17.7, z], .05, 3);
    strut([-12.4, 17.7, 8.4], [12.4, 17.7, 8.4], .055, 3); strut([-12.4, 17.15, 8.4], [12.4, 17.15, 8.4], .04, 3);
    strut([12.4, 17.7, -8.4], [12.4, 17.7, 8.4], .055, 3);
    /* modules */
    box(-11.5, 16.6, -7.5, -2.5, 21, 3);
    box(-2, 16.6, -7, 3.2, 19.6, 1.5);
    box(4, 16.6, -7.5, 11.8, 24, 1.2);
    box(3.7, 19, -7.8, 12.1, 19.25, 1.5); box(3.7, 21.5, -7.8, 12.1, 21.75, 1.5);
    box(5, 24, -6.6, 8.4, 25.2, -3.4);
    /* helideck: octagon cantilevered off the quarters, with struts */
    strut([12.4, 24.5, -2.6], [12.4, 25.0, -2.6], 6.6, 8, true);
    strut([11.8, 20.5, 1.2], [16.2, 24.5, 1.6], .14, 5); strut([11.8, 20.5, -6.4], [16.8, 24.5, -6.8], .14, 5);
    strut([11.8, 21.6, -2.6], [18.4, 24.5, -2.6], .14, 5);
    /* derrick */
    box(-10.6, 21, -5.6, -3.4, 22.6, 1.2);
    tower(-7, -2.2, 22.6, 41, 2.8, .75, 9, .09);
    box(-7.9, 41, -3.1, -6.1, 42.2, -1.3);
    /* exhaust stacks */
    strut([1.8, 19.6, -5], [1.8, 28.6, -5], .5, 10, true);
    strut([.2, 19.6, -5.7], [.2, 26.4, -5.7], .36, 8, true);
    /* pedestal crane with lattice boom */
    strut([-1.2, 16.6, 5.4], [-1.2, 23.4, 5.4], .95, 12, true);
    box(-2.5, 23.4, 4.2, .3, 25, 6.7);
    truss([-.6, 24.2, 6.4], [12.6, 32.4, 13.4], .8, .22, 9, .07, 4);
    strut([12.6, 32.4, 13.4], [12.6, 24.2, 13.4], .03, 3);
    /* flare boom: triangular truss reaching out and up */
    const flareBase = [-12.2, 17.2, -4.6], flareTip = [-30.6, 31.6, -8.6];
    truss(flareBase, flareTip, 1.5, .55, 11, .085, 3);
    strut(flareTip, [-30.75, 33.0, -8.65], .45, 8, true);
    const FLAME = [-30.8, 33.2, -8.7];

    const solidData = new Float32Array(V);
    const solidCount = V.length / 6;

    /* ---------- Lights (billboard sprites) ---------- */
    const S = [];
    const WARM = [1, .72, .42], WIN = [1, .86, .62], NAV = [.62, 1, .95], AMBER = [1, .6, .22], FL = [1, .62, .28];
    const light = (p, size, col, inten, kind = 0, ph = Math.random()) => S.push({ p, size, col, inten, kind, ph });
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = -12; x <= 12.1; x += 2) light([x, 16.95, 8.75], .2, WARM, 1.5);
    for (let z = -7.5; z <= 7.6; z += 2.5) light([12.75, 16.95, z], .2, WARM, 1.4);
    for (let x = -10; x <= 10.1; x += 2.5) light([x, 11.55, 7.85], .18, WARM, 1.2);
    for (let r = 0; r < 3; r++) for (let x = 4.7; x < 11.4; x += .95) if (rnd() > .28) light([x, 17.9 + r * 2.4, 1.32], .15, WIN, .85 + rnd() * .4);
    for (let r = 0; r < 3; r++) for (let z = -7; z < 1; z += .95) if (rnd() > .35) light([11.92, 17.9 + r * 2.4, z], .15, WIN, .8 + rnd() * .4);
    [[-11.3, 21.3, 3.2], [-2.7, 21.3, 3.2], [-2.2, 19.9, 1.7], [3, 19.9, 1.7]].forEach(p => light(p, .24, WARM, 1.6));
    [26, 31, 36].forEach(y => { light([-7 - (2.8 - (y - 22.6) / 18.4 * 2.05), y, -2.2 + (2.8 - (y - 22.6) / 18.4 * 2.05)], .16, WARM, 1.1); });
    light([-7, 42.7, -2.2], .3, AMBER, 2.2, 2, .1);
    light([1.8, 28.9, -5], .22, AMBER, 1.8, 2, .55);
    light([12.6, 32.7, 13.4], .22, AMBER, 1.8, 2, .8);
    for (let i = 0; i < 16; i++) { const q = i / 16 * Math.PI * 2 + Math.PI / 8; light([12.4 + Math.cos(q) * 6.5, 25.2, -2.6 + Math.sin(q) * 6.5], .15, NAV, 1.3); }
    [[-11, 11.6, 7.7], [11, 11.6, 7.7], [-11, 11.6, -7.7], [11, 11.6, -7.7]].forEach(p => light(p, .2, NAV, 1.5));
    /* floodlight haze */
    light([-5, 13.8, 8], 8, WARM, .07, 3); light([5, 13.8, 8], 8, WARM, .07, 3);
    light([8, 20, 3], 7, WARM, .06, 3); light([-7, 23.5, 2], 6, WARM, .06, 3);
    /* flame glow + sky bloom */
    light(add(FLAME, [-.4, 2.4, 0]), 6.5, FL, .85, 1);
    light(add(FLAME, [-.4, 3, 0]), 20, FL, .2, 1);
    light(add(FLAME, [0, 4, 0]), 56, [1, .55, .25], .06, 1);
    /* distant platforms and a ship on the horizon */
    const far = (cx, cz, s) => {
      for (let i = 0; i < 9; i++) light([cx + (rnd() - .5) * 16 * s, (8 + rnd() * 9) * s, cz + (rnd() - .5) * 6], .45 * s, rnd() > .7 ? NAV : WARM, 1.2);
      light([cx - 18 * s, 30 * s, cz], 4 * s, FL, .55, 1); light([cx - 18 * s, 30 * s, cz], 13 * s, FL, .12, 1);
    };
    far(-170, -340, 1.1); far(250, -470, 1.2);
    [[96, 2.6, -230], [98.5, 4.2, -230], [101, 2.6, -230]].forEach(p => light(p, .5, WIN, 1));

    const SPR_STRIDE = 12;
    const spr = new Float32Array(S.length * 4 * SPR_STRIDE);
    const sprIdx = new Uint16Array(S.length * 6);
    const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    S.forEach((s, i) => {
      CORN.forEach((c, k) => {
        const o = (i * 4 + k) * SPR_STRIDE;
        spr.set([s.p[0], s.p[1], s.p[2], c[0], c[1], s.col[0], s.col[1], s.col[2], s.inten, s.size, s.ph, s.kind], o);
      });
      sprIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    /* daylight: deck lamps, windows and haze are lost in the sun; the teal helideck and corner lights,
       the blinking aviation lights and the flares stay, drawn as small alpha-blended dots and soft halos */
    const TEAL_D = [0, .6, .58], AMBER_D = [.92, .42, .1], FL_D = [1, .52, .18];
    const dayLight = s => s.col === NAV ? (Math.abs(s.p[2]) < 60 ? [TEAL_D, 1, 1.7] : null)
      : s.col === AMBER ? [AMBER_D, 1.2, 1.5] : s.kind === 1 ? [FL_D, s.inten * .45, 1] : null;
    const sprDay = new Float32Array(S.length * 4 * SPR_STRIDE), dayIdx = [];
    S.forEach((s, i) => {
      const d = dayLight(s); if (!d) return;
      CORN.forEach((c, k) => sprDay.set([s.p[0], s.p[1], s.p[2], c[0], c[1], d[0][0], d[0][1], d[0][2], d[1], s.size * d[2], s.ph, s.kind], (i * 4 + k) * SPR_STRIDE));
      dayIdx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const sprIdxDay = new Uint16Array(dayIdx);

    /* ---------- Flame particles ---------- */
    const phoneInit = stage.clientWidth < 760;
    const NF = phoneInit ? 200 : LOW ? 300 : 420;
    const fl = new Float32Array(NF * 4 * 5), flIdx = new Uint16Array(NF * 6);
    for (let i = 0; i < NF; i++) {
      const sd = [rnd(), rnd(), rnd()];
      CORN.forEach((c, k) => fl.set([c[0], c[1], sd[0], sd[1], sd[2]], (i * 4 + k) * 5));
      flIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }

    const NS = phoneInit ? 30 : LOW ? 42 : 56;
    const sm = new Float32Array(NS * 4 * 5), smIdx = new Uint16Array(NS * 6);
    for (let i = 0; i < NS; i++) {
      const sd = [rnd(), (i + rnd() * .5) / NS, rnd()];
      CORN.forEach((c, k) => sm.set([c[0], c[1], sd[0], sd[1], sd[2]], (i * 4 + k) * 5));
      smIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }

    /* ---------- Ocean grid (denser near the camera) ---------- */
    const N = phoneInit ? (LOW ? 120 : 150) : LOW ? 180 : 210, HALF = 470, OCX = 6, OCZ = 40;
    const oc = new Float32Array((N + 1) * (N + 1) * 2);
    const warp = u => Math.sign(u) * Math.pow(Math.abs(u), 1.8) * HALF;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const o = (j * (N + 1) + i) * 2; oc[o] = warp(i / N * 2 - 1) + OCX; oc[o + 1] = warp(j / N * 2 - 1) + OCZ;
    }
    const ocIdx = new Uint16Array(N * N * 6);
    for (let j = 0, q = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      ocIdx.set([a, c, b, b, c, d], q); q += 6;
    }

    /* ---------- Programs & buffers ---------- */
    await yieldTask();
    /* one set of programs per mode (night = dark mode, day = light mode), compiled the first time it is shown */
    const SRC = {
      sky: [SKY_VS, SKY_FS], ocean: [OCEAN_VS, OCEAN_FS], solid: [SOLID_VS, SOLID_FS],
      sprite: [SPRITE_VS, SPRITE_FS], flame: [FLAME_VS, FLAME_FS], smoke: [SMOKE_VS, SMOKE_FS]
    };
    const progs = {};
    function programs(isDay) {
      const mode = isDay ? 'day' : 'night';
      if (!progs[mode]) {
        const def = isDay ? '#define DAY\n' : '', out = {};
        for (const k in SRC) out[k] = program(def + SRC[k][0], def + SRC[k][1]);
        progs[mode] = out;
      }
      return progs[mode];
    }
    let day = !!(window.SAATheme && SAATheme.get() === 'light');
    let P;
    try { P = programs(day); } catch (err) { hero.classList.add('gl-off'); return; }
    const B = {
      tri: buffer(new Float32Array([-1, -1, 3, -1, -1, 3])),
      ocean: buffer(oc), oceanIdx: buffer(ocIdx, gl.ELEMENT_ARRAY_BUFFER),
      solid: buffer(solidData),
      spr: buffer(spr), sprIdx: buffer(sprIdx, gl.ELEMENT_ARRAY_BUFFER),
      sprDay: buffer(sprDay), sprIdxDay: buffer(sprIdxDay, gl.ELEMENT_ARRAY_BUFFER),
      fl: buffer(fl), flIdx: buffer(flIdx, gl.ELEMENT_ARRAY_BUFFER),
      sm: buffer(sm), smIdx: buffer(smIdx, gl.ELEMENT_ARRAY_BUFFER)
    };

    await yieldTask();
    /* ---------- Camera ---------- */
    const proj = new Float32Array(16), view = new Float32Array(16), vp = new Float32Array(16);
    function perspective(fovy, aspect, near, far, sx, sy) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      proj.fill(0);
      proj[0] = f / aspect; proj[5] = f; proj[8] = -sx; proj[9] = -sy;
      proj[10] = (far + near) * nf; proj[11] = -1; proj[14] = 2 * far * near * nf;
    }
    function lookAt(e, c, up) {
      let z = nrm(sub(e, c)); const x = nrm(cross(up, z)); const y = cross(z, x);
      view.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
      return { right: x, up: y, fwd: scl(z, -1) };
    }
    function mul(out, a, b) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    /* framing keyframes: [eye, target, fov, shiftX, shiftY] at scroll 0 and 1 */
    const WIDE = { e0: [30, 7.8, 94], t0: [-7, 17.5, 0], f0: 34, s0: [.36, -.05], e1: [8, 12.6, 46], t1: [-10, 21, 0], f1: 40, s1: [.14, .02] };
    const TALL = { e0: [7, 9, 122], t0: [-9, 20, 0], f0: 50, s0: [0, .34], e1: [1, 12, 78], t1: [-11, 23, 0], f1: 54, s1: [0, .30] };
    const GLOW = nrm([-.22, 0, -1]);
    /* daylight: the sun sits just above the frame toward the glow; the key light on the steel comes from the right */
    const SUN = nrm([-.3, .55, -1]), KEY = nrm([.75, .6, -.2]);

    /* ---------- State ---------- */
    let W = 1, H = 1, aspect = 1, pxScale = 1;
    let sp = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
    let running = false, raf = 0, visible = true, first = true, lastT = 0;
    const t0 = performance.now();

    function resize() {
      const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
      const phone = w < 760;
      let dpr = Math.min(devicePixelRatio || 1, phone || LOW ? 1.5 : 1.75);
      if (w * h * dpr * dpr > 2.9e6) dpr = Math.sqrt(2.9e6 / (w * h));
      pxScale = dpr;
      W = Math.max(1, Math.round(w * dpr)); H = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      aspect = w / h;
      if (REDUCE || !running) render(REDUCE ? 9 : (performance.now() - t0) / 1000);
    }

    function flick(t) { return .84 + .08 * Math.sin(t * 11.3) + .06 * Math.sin(t * 23.7 + 1.2) + .05 * Math.sin(t * 5.1 + .3) + .03 * Math.sin(t * 37.9); }

    function scrollProgress() {
      const r = hero.getBoundingClientRect();
      const range = r.height - stage.clientHeight;
      return range > 0 ? clamp(-r.top / range, 0, 1) : 0;
    }

    function render(t) {
      const p = REDUCE ? 0 : scrollProgress();
      const dt = clamp(t - lastT, 0, .1); lastT = t;
      sp += (p - sp) * (first ? 1 : 1 - Math.exp(-dt * 5));
      const km = 1 - Math.exp(-dt * 2.4);
      mx += (tmx - mx) * km; my += (tmy - my) * km;
      const k = ease(sp);
      const wt = clamp((aspect - .75) / .6, 0, 1);
      const L = (key) => {
        const a = TALL[key], b = WIDE[key];
        return Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], wt)) : lerp(a, b, wt);
      };
      const eye = mix3(L('e0'), L('e1'), k), tgt = mix3(L('t0'), L('t1'), k);
      const s0 = L('s0'), s1 = L('s1');
      const fov = lerp(L('f0'), L('f1'), k) * Math.PI / 180;
      const drift = REDUCE ? 0 : 1;
      eye[0] += (Math.sin(t * .11) * 1.6 + mx * 4.5) * drift;
      eye[1] += (Math.sin(t * .19) * .35 - my * 1.8) * drift;
      tgt[0] += mx * 1.2 * drift; tgt[1] -= my * .5 * drift;
      const roll = REDUCE ? 0 : Math.sin(t * .27) * .0045;
      const cam = lookAt(eye, tgt, [roll, 1, 0]);
      const sx = lerp(s0[0], s1[0], k), sy = lerp(s0[1], s1[1], k);
      perspective(fov, aspect, .5, 2400, sx, sy);
      mul(vp, proj, view);
      const fk = REDUCE ? .9 : flick(t);
      const tanY = Math.tan(fov / 2);

      gl.viewport(0, 0, W, H);
      if (day) gl.clearColor(.9, .94, .95, 1); else gl.clearColor(.008, .03, .06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      /* sky */
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
      let pr = P.sky; gl.useProgram(pr.p);
      attribs(pr, B.tri, 2, [['aPos', 2, 0]]);
      gl.uniform3fv(pr.u.uRight, cam.right); gl.uniform3fv(pr.u.uUp, cam.up); gl.uniform3fv(pr.u.uFwd, cam.fwd);
      gl.uniform2f(pr.u.uTan, tanY * aspect, tanY); gl.uniform2f(pr.u.uShift, sx, sy);
      gl.uniform1f(pr.u.uTime, t); gl.uniform1f(pr.u.uPx, 240 * 2 * tanY / H);
      gl.uniform3fv(pr.u.uGlowDir, GLOW);
      if (day) gl.uniform3fv(pr.u.uSun, SUN);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* ocean */
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
      pr = P.ocean; gl.useProgram(pr.p);
      attribs(pr, B.ocean, 2, [['aXZ', 2, 0]]);
      gl.uniformMatrix4fv(pr.u.uVP, false, vp);
      gl.uniform1f(pr.u.uTime, t); gl.uniform3fv(pr.u.uCam, eye);
      gl.uniform3fv(pr.u.uFlame, add(FLAME, [-.4, 2.2, 0])); gl.uniform1f(pr.u.uFlick, fk);
      gl.uniform3f(pr.u.uL0, -6, 13.5, 8.6); gl.uniform3f(pr.u.uL1, 4, 13.5, 8.6); gl.uniform3f(pr.u.uL2, 10, 18, 3);
      gl.uniform1f(pr.u.uFogK, .0046); gl.uniform3fv(pr.u.uGlowDir, GLOW); gl.uniform1f(pr.u.uOct, W < 900 ? 6 : 9);
      if (day) gl.uniform3fv(pr.u.uSun, SUN);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.oceanIdx);
      gl.drawElements(gl.TRIANGLES, ocIdx.length, gl.UNSIGNED_SHORT, 0);

      /* platform */
      pr = P.solid; gl.useProgram(pr.p);
      attribs(pr, B.solid, 6, [['aPos', 3, 0], ['aNor', 3, 3]]);
      gl.uniformMatrix4fv(pr.u.uVP, false, vp); gl.uniform3fv(pr.u.uCam, eye);
      gl.uniform3fv(pr.u.uFlame, add(FLAME, [-.4, 2.2, 0])); gl.uniform1f(pr.u.uFlick, fk);
      gl.uniform3f(pr.u.uL0, -6, 13.6, 9); gl.uniform3f(pr.u.uL1, 5, 13.6, 9); gl.uniform3f(pr.u.uL2, 8, 19.5, 4); gl.uniform3f(pr.u.uL3, -7, 23.5, 3);
      gl.uniform1f(pr.u.uFogK, .0046); gl.uniform3fv(pr.u.uGlowDir, GLOW);
      if (day) { gl.uniform3fv(pr.u.uSun, SUN); gl.uniform3fv(pr.u.uKey, KEY); }
      gl.drawArrays(gl.TRIANGLES, 0, solidCount);

      /* smoke plume (alpha) */
      gl.enable(gl.BLEND); gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      pr = P.smoke; gl.useProgram(pr.p);
      attribs(pr, B.sm, 5, [['aCorner', 2, 0], ['aSeed', 3, 2]]);
      gl.uniformMatrix4fv(pr.u.uView, false, view); gl.uniformMatrix4fv(pr.u.uProj, false, proj);
      gl.uniform1f(pr.u.uTime, t); gl.uniform3fv(pr.u.uOrigin, FLAME); gl.uniform3f(pr.u.uWind, -1.0, .1, .3);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.smIdx);
      gl.drawElements(gl.TRIANGLES, smIdx.length, gl.UNSIGNED_SHORT, 0);

      /* lights + flame (additive at night; premultiplied alpha by day, since glows added to a pale sky vanish) */
      gl.blendFunc(gl.ONE, day ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
      pr = P.sprite; gl.useProgram(pr.p);
      attribs(pr, day ? B.sprDay : B.spr, SPR_STRIDE, [['aCenter', 3, 0], ['aCorner', 2, 3], ['aColor', 4, 5], ['aParams', 3, 9]]);
      gl.uniformMatrix4fv(pr.u.uView, false, view); gl.uniformMatrix4fv(pr.u.uProj, false, proj);
      gl.uniform1f(pr.u.uTime, t); gl.uniform1f(pr.u.uFlick, fk); gl.uniform1f(pr.u.uMinPx, 2.2 * pxScale); gl.uniform1f(pr.u.uResY, H);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, day ? B.sprIdxDay : B.sprIdx);
      gl.drawElements(gl.TRIANGLES, day ? sprIdxDay.length : sprIdx.length, gl.UNSIGNED_SHORT, 0);

      pr = P.flame; gl.useProgram(pr.p);
      attribs(pr, B.fl, 5, [['aCorner', 2, 0], ['aSeed', 3, 2]]);
      gl.uniformMatrix4fv(pr.u.uView, false, view); gl.uniformMatrix4fv(pr.u.uProj, false, proj);
      gl.uniform1f(pr.u.uTime, t); gl.uniform1f(pr.u.uFlick, fk);
      gl.uniform3fv(pr.u.uOrigin, FLAME); gl.uniform3fv(pr.u.uDir, nrm([-.3, 1, .06])); gl.uniform3f(pr.u.uWind, -1.25, .2, .3);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.flIdx);
      gl.drawElements(gl.TRIANGLES, flIdx.length, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);

      if (first) {
        first = false;
        if (!gl.isContextLost()) requestAnimationFrame(() => hero.classList.add('gl-on'));
      }
    }

    function loop(now) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      render((now - t0) / 1000);
    }
    function setRunning(on) {
      on = on && !REDUCE && !document.hidden && visible;
      if (on && !running) { running = true; raf = requestAnimationFrame(loop); }
      else if (!on && running) { running = false; cancelAnimationFrame(raf); }
    }

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(true); }, { rootMargin: '80px 0px' }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => setRunning(true));
    if (FINE && !REDUCE) addEventListener('pointermove', e => { tmx = e.clientX / innerWidth * 2 - 1; tmy = e.clientY / innerHeight * 2 - 1; }, { passive: true });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); setRunning(false); hero.classList.remove('gl-on'); hero.classList.add('gl-off'); });
    /* the header switch changes the mode live: swap to that mode's programs and repaint straight away
       (also the reduced-motion still frame, and a paused scene that is off screen) */
    function setMode(next) {
      if (next === day || gl.isContextLost()) return;
      try { P = programs(next); } catch (err) { setRunning(false); hero.classList.remove('gl-on'); hero.classList.add('gl-off'); return; }
      day = next;
      render(REDUCE ? 9 : (performance.now() - t0) / 1000);
    }
    document.addEventListener('saa:theme', e => setMode(e.detail.theme === 'light'));
    if (window.SAATheme) setMode(SAATheme.get() === 'light');   /* catch a switch made while the scene was being set up */
    if (REDUCE) render(9); else setRunning(true);
  }

  /* =======================================================================
     2. ADIPEC COUNTDOWN (2 Nov 2026, 10:00 GST = 06:00 UTC)
     ======================================================================= */
  function initCountdown() {
    const root = document.querySelector('.at-clock');
    if (!root) return;
    const OPEN = Date.UTC(2026, 10, 2, 6, 0, 0), CLOSE = Date.UTC(2026, 10, 5, 20, 0, 0);
    const g = root.querySelector('.at-ticks');
    const NS = 'http://www.w3.org/2000/svg';
    const ticks = [];
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2 - Math.PI / 2, big = i % 5 === 0;
      const r1 = 170, r2 = big ? 186 : 180;
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', (200 + Math.cos(a) * r1).toFixed(2)); l.setAttribute('y1', (200 + Math.sin(a) * r1).toFixed(2));
      l.setAttribute('x2', (200 + Math.cos(a) * r2).toFixed(2)); l.setAttribute('y2', (200 + Math.sin(a) * r2).toFixed(2));
      if (big) l.setAttribute('class', 'big');
      g.appendChild(l); ticks.push(l);
    }
    const els = {}; root.querySelectorAll('[data-u]').forEach(el => { els[el.dataset.u] = el; });
    const arc = root.querySelector('.at-arc'), status = root.querySelector('.at-status');
    const last = {};
    const put = (k, v) => {
      const s = String(v).padStart(2, '0');
      if (last[k] === s || !els[k]) return;
      const firstPaint = last[k] === undefined;
      last[k] = s; els[k].textContent = s;
      if (!REDUCE && !firstPaint) { els[k].classList.remove('tick'); void els[k].offsetWidth; els[k].classList.add('tick'); }
    };
    let lit = -1;
    function update() {
      const now = Date.now();
      let diff = Math.max(0, OPEN - now);
      if (diff === 0) status.textContent = now < CLOSE ? 'ADIPEC 2026 is open · ADNEC Centre' : 'ADIPEC 2026 has closed · Thank you';
      const s = Math.floor(diff / 1000);
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
      put('d', d); put('h', h); put('m', m); put('s', sec);
      if (sec !== lit) { lit = sec; ticks.forEach((t, i) => t.classList.toggle('on', i < sec)); }
      arc.style.strokeDasharray = `${((h * 60 + m) / 1440 * 100).toFixed(2)} 100`;
    }
    update();
    let iv = 0;
    const start = () => { if (!iv) iv = setInterval(update, 1000); };
    const stop = () => { clearInterval(iv); iv = 0; };
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { e.isIntersecting ? (update(), start()) : stop(); }).observe(root);
    else start();
  }

  /* =======================================================================
     3. QUALITY ACCORDION (desktop expands on hover/focus)
     ======================================================================= */
  function initQuality() {
    const cols = [...document.querySelectorAll('.qa-col')];
    const wide = matchMedia('(min-width: 1081px)');
    const set = c => cols.forEach(k => k.classList.toggle('is-active', k === c));
    cols.forEach(c => {
      c.addEventListener('pointerenter', e => { if (wide.matches && e.pointerType === 'mouse') set(c); });
      c.addEventListener('focus', () => set(c));
      c.addEventListener('click', () => set(c));
    });
  }

  /* =======================================================================
     4. SCROLL CHOREOGRAPHY (needs GSAP via SAA.ready)
     ======================================================================= */
  function heroScroll({ gsap, ScrollTrigger, reduce }) {
    if (reduce || !ScrollTrigger) return;
    const hero = document.querySelector('.hero');
    gsap.set('.beat-line', { yPercent: 110, y: 0 });
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: .7 } });
    tl.to('.hero-content', { yPercent: -26, opacity: 0, ease: 'power2.in', duration: .42 }, 0)
      .to('.hero-foot', { opacity: 0, y: 24, duration: .18 }, 0)
      .to('.hero-frame', { opacity: 0, scale: 1.05, duration: .35 }, .05)
      .to('.beat-cap', { opacity: 1, duration: .12 }, .48)
      .to('.beat-line', { yPercent: 0, stagger: .09, duration: .26, ease: 'power3.out' }, .5)
      .to('.hero-dim', { opacity: .35, duration: .16 }, .84)
      /* light mode only (index.css): the last frame fades into the journey's sky; nothing reads it in dark mode */
      .fromTo('.hero-stage', { '--hero-end': 0 }, { '--hero-end': 1, duration: .18 }, .8);
  }

  function tapes({ gsap, lenis, reduce }) {
    if (reduce) return;
    const sec = document.querySelector('.tape');
    if (!sec) return;
    const rows = [...sec.querySelectorAll('.marquee-track')].map((el, i) => ({ el, x: 0, dir: i ? 1 : -1, w: 1 }));
    const measure = () => rows.forEach(r => { r.w = r.el.scrollWidth / 2 || 1; });
    measure(); addEventListener('resize', measure);
    document.fonts && document.fonts.ready.then(measure);
    let vel = 0, boost = 0, sign = 1, on = true;
    if (lenis) lenis.on('scroll', e => { vel = e.velocity || 0; });
    else { let ly = scrollY; addEventListener('scroll', () => { vel = scrollY - ly; ly = scrollY; }, { passive: true }); }
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(sec);
    gsap.ticker.add((time, dt) => {
      if (Math.abs(vel) > .3) sign = vel > 0 ? 1 : -1;
      boost += (Math.min(Math.abs(vel), 80) * .16 - boost) * .08;
      if (!lenis) vel *= .85;
      if (!on) return;
      const step = (1.05 + boost) * Math.min(dt, 50) / 16.67;
      rows.forEach(r => {
        r.x += step * r.dir * sign;
        if (r.x <= -r.w) r.x += r.w; else if (r.x > 0) r.x -= r.w;
        r.el.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0)`;
      });
    });
  }

  function statLines({ gsap, ScrollTrigger, reduce }) {
    if (reduce || !ScrollTrigger) return;
    const stats = document.querySelectorAll('.stat');
    if (!stats.length) return;
    gsap.fromTo(stats, { '--line-p': 0 }, { '--line-p': 1, duration: 1.4, ease: 'expo.inOut', stagger: .12, scrollTrigger: { trigger: '.stat-grid', start: 'top 88%', once: true } });
  }

  function groupExtras({ gsap, ScrollTrigger, reduce }) {
    if (reduce || !ScrollTrigger) return;
    const sec = document.querySelector('.group-h');
    if (!sec) return;
    const bar = sec.querySelector('.gh-progress i');
    const mm = gsap.matchMedia();
    mm.add('(min-width: 861px)', () => {
      const st = ScrollTrigger.getAll().find(s => s.trigger === sec && s.pin);
      if (!st || !st.animation) return;
      const ca = st.animation;
      ScrollTrigger.create({ trigger: sec, start: () => st.start, end: () => st.end, onUpdate: s => { bar.style.transform = `scaleX(${s.progress.toFixed(4)})`; } });
      sec.querySelectorAll('.gh-card').forEach(card => {
        const art = card.querySelector('.gh-art'), word = card.querySelector('.gh-word');
        const trig = { trigger: card, containerAnimation: ca, start: 'left right', end: 'right left', scrub: true };
        gsap.set(art, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
        gsap.fromTo(art, { x: 46, rotation: -4 }, { x: -46, rotation: 4, ease: 'none', scrollTrigger: { ...trig } });
        gsap.fromTo(word, { x: 140 }, { x: -140, ease: 'none', scrollTrigger: { ...trig } });
      });
    });
  }

  function sectorsFloat({ gsap, reduce, finePointer }) {
    if (!finePointer) return;
    const list = document.querySelector('.sector-list'), float = document.querySelector('.sector-float');
    if (!list || !float) return;
    const card = float.querySelector('.sf-card'), arts = [...float.querySelectorAll('.sf-art')];
    float.classList.add('ready');
    const dur = reduce ? .01 : .75;
    const xTo = gsap.quickTo(float, 'x', { duration: dur, ease: 'power3' }), yTo = gsap.quickTo(float, 'y', { duration: dur, ease: 'power3' });
    const rTo = gsap.quickTo(card, 'rotation', { duration: .9, ease: 'power3' });
    let lastX = 0, cur = -1;
    const show = i => {
      if (i === cur) return;
      arts.forEach((a, k) => { a.classList.toggle('on', k === i); a.classList.toggle('off', k === cur); });
      cur = i;
    };
    list.querySelectorAll('.sector-row').forEach(r => r.addEventListener('pointerenter', () => show(+r.dataset.i)));
    list.addEventListener('pointerenter', e => {
      gsap.set(float, { x: e.clientX, y: e.clientY }); lastX = e.clientX;
      gsap.to(card, { scale: 1, opacity: 1, duration: reduce ? .01 : .55, ease: 'expo.out', overwrite: 'auto' });
    });
    list.addEventListener('pointermove', e => {
      xTo(e.clientX); yTo(e.clientY);
      if (!reduce) rTo(gsap.utils.clamp(-6, 6, (e.clientX - lastX) * .35));
      lastX = e.clientX;
    });
    list.addEventListener('pointerleave', () => {
      gsap.to(card, { scale: 0, opacity: 0, duration: reduce ? .01 : .4, ease: 'power3.in', overwrite: 'auto' });
      rTo(0);
    });
    addEventListener('scroll', () => { if (cur !== -1 && !list.matches(':hover')) gsap.to(card, { scale: 0, opacity: 0, duration: .3, overwrite: 'auto' }); }, { passive: true });
  }

  function emiFill({ gsap, ScrollTrigger, reduce }) {
    if (reduce || !ScrollTrigger) return;
    const title = document.querySelector('.emi-title');
    if (!title) return;
    const words = [...title.querySelectorAll('.emi-fill')];
    const tl = gsap.timeline({ scrollTrigger: { trigger: title, start: 'top 82%', end: 'bottom 42%', scrub: .6 } });
    words.forEach(w => tl.fromTo(w, { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', ease: 'none', duration: w.textContent.length }));
  }

  /* ---------- boot ---------- */
  /* The WebGL scene starts after the first paint, once the main thread is idle. Until then the
     still frame (.hero-fallback) is on screen, so the headline never waits for shader compiles. */
  const heroOff = () => { const h = document.querySelector('.hero'); h && h.classList.add('gl-off'); };
  const bootHero = () => { try { initHero().catch(heroOff); } catch (err) { heroOff(); } };
  const whenIdle = fn => ('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 120);
  const afterPaint = () => requestAnimationFrame(() => setTimeout(() => whenIdle(bootHero), 0));
  if (document.readyState === 'complete') afterPaint(); else addEventListener('load', afterPaint, { once: true });
  initCountdown();
  initQuality();
  if (window.SAA && typeof SAA.ready === 'function') {
    SAA.ready(ctx => {
      [heroScroll, tapes, statLines, groupExtras, sectorsFloat, emiFill].forEach(fn => {
        try { fn(ctx); } catch (err) { /* keep the page usable if one effect fails */ }
      });
    });
  }
})();
