/* =========================================================================
   HOME: journey (pinned line-drawing story)
   As the visitor scrolls, five scenes draw themselves in glowing lines:
   an offshore oil platform, a luxury villa under construction, a hospital,
   a school and finally a team of SAA people. The scenes live in index.html
   (<g class="jr-scene">); this file only animates them.
   Without GSAP, on short screens or with reduced motion there is no pinning:
   the five stops under the picture switch the scene instead.
   ========================================================================= */
(function () {
  'use strict';
  const sec = document.getElementById('journey');
  if (!sec) return;
  const svg = sec.querySelector('.jr-svg');
  const scenes = [...sec.querySelectorAll('.jr-scene')];
  const caps = [...sec.querySelectorAll('.jcap')];
  const stops = [...sec.querySelectorAll('.jt-stop')];
  const track = sec.querySelector('.jr-track');
  const hint = sec.querySelector('.jr-hint');
  const LAST = scenes.length - 1;
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const SPREAD = .85;         /* how staggered the lines of one scene are while drawing */
  const SLIDE = 170;          /* scenes drift in from the right as you travel */
  let moonBase = [900, 10, 26];   /* x, y, drift per stop */
  const moon = sec.querySelector('.jr-moon');   /* holds the sun too (light mode, journey.css), so both drift the same way */
  const clouds = sec.querySelector('.jr-clouds');   /* light mode only; they drift a little slower than the scenes */

  /* ---------- sky: stars over a wide area so phones (which show more sky) are covered too ---------- */
  const starG = sec.querySelector('.jr-stars');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', (-900 + rnd() * 3400).toFixed(1));
    c.setAttribute('cy', (-900 + rnd() * 1450).toFixed(1));
    c.setAttribute('r', (.7 + rnd() * 1.5).toFixed(2));
    c.setAttribute('class', 'jr-star' + (i % 4 === 0 ? ' tw' : ''));
    c.style.opacity = (.25 + rnd() * .6).toFixed(2);
    if (i % 4 === 0) c.style.animationDelay = (-rnd() * 3.2).toFixed(2) + 's';
    starG.appendChild(c);
  }

  /* ---------- ground: perspective lines that flow towards you as you travel ---------- */
  const groundG = sec.querySelector('.jr-ground');
  const GL = 16, HZ = 620;
  const gLines = [];
  for (let k = 0; k < GL; k++) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('class', 'jr-gl'); l.setAttribute('x1', '-2400'); l.setAttribute('x2', '4000');
    groundG.appendChild(l); gLines.push(l);
  }
  function ground(phase) {
    for (let k = 0; k < GL; k++) {
      const t = k + phase, y = HZ + Math.pow(t, 1.95) * 2.1;
      gLines[k].setAttribute('y1', y.toFixed(1)); gLines[k].setAttribute('y2', y.toFixed(1));
      gLines[k].style.opacity = clamp(.06 + t * .035, 0, .6).toFixed(3);
    }
  }
  ground(0);

  /* ---------- scene parts ---------- */
  const lengthOf = el => {
    try { const n = el.getTotalLength(); if (n > 0) return n; } catch (_) {}
    try { const b = el.getBBox(); return 2 * (b.width + b.height) || 1; } catch (_) { return 1; }
  };
  const data = scenes.map(g => {
    /* soft halo behind each warm light (CSS filters on SVG shapes are not supported everywhere) */
    g.querySelectorAll('.glow').forEach(c => {
      const h = c.cloneNode(); h.setAttribute('class', 'jr-halo');
      const r = parseFloat(c.getAttribute('r')) || 3; h.setAttribute('r', (r * 3.4).toFixed(1));
      c.parentNode.insertBefore(h, c);
    });
    const lines = [...g.querySelectorAll('.ln, .ln2')].map(el => ({ el, len: lengthOf(el) }));
    return { g, lines, fills: [...g.querySelectorAll('.solid')], glows: [...g.querySelectorAll('.glow, .jr-halo')], a: -1 };
  });

  function drawScene(d, a, offset) {
    d.g.setAttribute('transform', 'translate(' + offset.toFixed(1) + ' 0)');
    if (Math.abs(a - d.a) < .0005) return;
    d.a = a;
    d.g.style.visibility = a <= 0 ? 'hidden' : 'visible';
    if (a <= 0) return;
    const n = Math.max(1, d.lines.length - 1);
    d.lines.forEach((p, k) => {
      const f = clamp(a * (1 + SPREAD) - SPREAD * (k / n), 0, 1);
      p.el.style.strokeDashoffset = (p.len * (1 - f)).toFixed(1);
    });
    const fo = (a * a).toFixed(3), go = clamp(a * 2 - 1, 0, 1).toFixed(3);
    d.fills.forEach(el => { el.style.opacity = fo; });
    d.glows.forEach(el => { el.style.opacity = go; });
  }
  function dashOn() { data.forEach(d => d.lines.forEach(p => { p.el.style.strokeDasharray = p.len.toFixed(1) + ' ' + (p.len + 2).toFixed(1); })); }
  function dashOff() {
    data.forEach(d => {
      d.a = -1; d.g.removeAttribute('transform'); d.g.style.visibility = '';
      d.lines.forEach(p => { p.el.style.strokeDasharray = ''; p.el.style.strokeDashoffset = ''; });
      d.fills.concat(d.glows).forEach(el => { el.style.opacity = ''; });
    });
  }

  /* ---------- framing: wide screens fill the frame; tall phones frame the centre of each scene ---------- */
  function frame() {
    const w = svg.clientWidth || innerWidth, h = svg.clientHeight || innerHeight;
    let scale;
    if (w / h < 1) {
      svg.setAttribute('viewBox', '440 60 720 860'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      scale = Math.min(w / 720, h / 860);
    } else {
      svg.setAttribute('viewBox', '0 0 1600 900'); svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
      scale = Math.max(w / 1600, h / 900);
    }
    svg.style.setProperty('--sw', (2 / scale).toFixed(2));
    /* the moon sits in open sky: top right on wide screens, above the scene on phones */
    moonBase = w / h < 1 ? [600, -250, 8] : [900, 10, 26];
  }
  frame();
  moon.setAttribute('transform', 'translate(' + moonBase[0] + ' ' + moonBase[1] + ')');
  addEventListener('resize', frame, { passive: true });

  /* ---------- captions and stops ---------- */
  let capNow = -1;
  function setCap(i) {
    if (i === capNow) return;
    capNow = i;
    caps.forEach((c, k) => {
      const on = k === i;
      c.classList.toggle('is-on', on);
      if (c.querySelector('a')) c.inert = !on;   /* links in a hidden caption must not take focus */
    });
    stops.forEach((b, k) => { b.classList.toggle('is-on', k === i); b.classList.toggle('is-past', k < i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
  }
  setCap(0);

  /* ---------- one frame of the story for a position s from 0 (rig) to LAST (people) ---------- */
  function render(s) {
    data.forEach((d, i) => {
      const dist = Math.abs(s - i);
      const a = clamp((.62 - dist) / .34, 0, 1);
      drawScene(d, a, (i - s) * SLIDE);
    });
    ground((s * 2.4) % 1);
    moon.setAttribute('transform', 'translate(' + (moonBase[0] - s * moonBase[2]).toFixed(1) + ' ' + (moonBase[1] + s * 6).toFixed(1) + ')');
    if (clouds) clouds.setAttribute('transform', 'translate(' + (-s * 40).toFixed(1) + ' 0)');
    track.style.setProperty('--p', (s / LAST).toFixed(4));
    setCap(clamp(Math.round(s), 0, LAST));
  }

  /* static mode: the stops switch the scene, every scene fully drawn */
  function showStatic(i) {
    scenes.forEach((g, k) => { g.style.opacity = k === i ? '1' : '0'; g.style.transition = 'opacity .45s ease'; });
    track.style.setProperty('--p', (i / LAST).toFixed(4));
    setCap(i);
  }
  let mode = 'static', st = null, lenisRef = null;
  stops.forEach((b, i) => b.addEventListener('click', () => {
    if (mode === 'live' && st) {
      const y = st.start + (st.end - st.start) * (i / LAST) + 2;
      if (lenisRef) lenisRef.scrollTo(y, { duration: 1.2 }); else scrollTo({ top: y, behavior: 'smooth' });
    } else showStatic(i);
  }));
  sec.classList.add('is-ready');
  showStatic(0);

  if (!(window.SAA && typeof SAA.ready === 'function')) return;
  SAA.ready(({ gsap, ScrollTrigger, lenis, reduce }) => {
    lenisRef = lenis || null;
    if (reduce || !ScrollTrigger || !gsap) return;
    const mm = gsap.matchMedia();
    mm.add('(min-height: 500px)', () => {
      mode = 'live';
      sec.classList.add('is-live');
      scenes.forEach(g => { g.style.opacity = ''; g.style.transition = ''; });
      frame(); dashOn();
      let target = 0, cur = 0, raf = 0;
      const tick = () => {
        cur += (target - cur) * .16;
        if (Math.abs(target - cur) < .0008) cur = target;
        render(cur);
        raf = cur === target ? 0 : requestAnimationFrame(tick);
      };
      const go = v => { target = v; if (!raf) raf = requestAnimationFrame(tick); };
      render(0);
      st = ScrollTrigger.create({
        trigger: sec, start: 'top top', end: () => '+=' + Math.round(innerHeight * (innerWidth < 861 ? 3.6 : 4.4)),
        pin: true, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: s => { go(s.progress * LAST); if (hint) hint.style.opacity = s.progress > .02 ? '0' : '1'; },
        onRefresh: s => { frame(); target = cur = s.progress * LAST; render(cur); }
      });
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
      return () => {
        mode = 'static'; st = null;
        cancelAnimationFrame(raf); raf = 0;
        sec.classList.remove('is-live');
        dashOff(); showStatic(clamp(Math.round(cur), 0, LAST));
      };
    });
  });
})();
