/* =========================================================================
   SAA GROUP: client logos (shared renderer)
   Draws the list in assets/data/clients.js (window.SAA_CLIENTS) into every
   element with a data-clients attribute:
     <div data-clients="marquee"></div>  slow, endless logo band (Home)
     <div data-clients="grid"></div>     calm grid of logo tiles (Services)
   The closest [data-clients-section] around it stays hidden while the list is
   empty. An optional [data-clients-controls] inside that section receives the
   marquee's pause button; otherwise the button goes after the band.
   Load order: assets/data/clients.js, then this file (both defer).
   ========================================================================= */
(function () {
  'use strict';
  const hosts = [...document.querySelectorAll('[data-clients]')];
  if (!hosts.length) return;

  const raw = Array.isArray(window.SAA_CLIENTS) ? window.SAA_CLIENTS : [];
  const list = raw.filter(c => c && typeof c.name === 'string' && c.name.trim()).map(c => ({
    name: c.name.trim(),
    formerly: typeof c.formerly === 'string' ? c.formerly.trim() : '',
    logo: typeof c.logo === 'string' ? c.logo.trim() : '',
    url: typeof c.url === 'string' && /^https?:\/\//i.test(c.url.trim()) ? c.url.trim() : '',
    invert: c.invert !== false,
    scale: Number(c.scale) > 0 ? Math.min(2, Math.max(.5, Number(c.scale))) : 1
  }));
  const sectionOf = host => host.closest('[data-clients-section]') || host;

  if (!list.length) { hosts.forEach(h => { sectionOf(h).hidden = true; }); return; }

  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICON = {
    pause: 'M8 5.5v13M16 5.5v13',
    play: 'M8 5.2v13.6L19 12z'
  };

  /* ---------- One client: logo image, or the name set as a wordmark if there is no file or it fails ---------- */
  function wordmark(c) {
    const w = document.createElement('span');
    w.className = 'cl-word';
    w.textContent = c.name;
    return w;
  }

  /* Optical sizing: wide logos are drawn a little shorter, compact ones a little taller,
     so every logo carries about the same visual weight at the same base height. */
  function opticalScale(img, c) {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    img.width = w; img.height = h;
    const k = Math.min(1.45, Math.max(.7, Math.pow((w / h) / 2.8, -.4))) * c.scale;
    img.style.setProperty('--k', k.toFixed(3));
  }

  function logo(c, decorative, onChange) {
    if (!c.logo) return wordmark(c);
    const img = document.createElement('img');
    img.className = 'cl-logo';
    img.alt = decorative ? '' : c.name;
    img.width = 160; img.height = 48; /* replaced by the file's real size once it loads */
    img.loading = 'lazy';
    img.decoding = 'async';
    if (c.scale !== 1) img.style.setProperty('--k', c.scale);
    /* the chip stays transparent until the file has loaded, so a missing file never flashes a broken image */
    const chipOf = () => img.closest('.cl-chip');
    img.addEventListener('load', () => { opticalScale(img, c); const ch = chipOf(); if (ch) ch.classList.remove('is-wait'); onChange(); });
    img.addEventListener('error', () => {
      const ch = chipOf(); if (ch) { ch.classList.remove('is-wait'); ch.classList.add('is-word'); }
      img.replaceWith(wordmark(c)); onChange();
    }, { once: true });
    img.src = c.logo;
    return img;
  }

  function item(c, tag, cls, decorative, onChange, withFormer) {
    const el = document.createElement(tag);
    el.className = cls + (c.invert ? '' : ' is-keep');
    let chip;
    if (c.url) {
      chip = document.createElement('a');
      chip.href = c.url; chip.target = '_blank'; chip.rel = 'noopener';
      if (decorative) chip.tabIndex = -1;
      else chip.addEventListener('focus', () => { const i = chip.querySelector('img'); if (i) i.loading = 'eager'; });
    } else {
      chip = document.createElement('span');
    }
    chip.className = c.logo ? 'cl-chip is-wait' : 'cl-chip is-word';
    chip.append(logo(c, decorative, onChange));
    if (c.url && !decorative) {
      const sr = document.createElement('span');
      sr.className = 'sr-only'; sr.textContent = ' (opens in a new tab)';
      chip.append(sr);
    }
    el.append(chip);
    if (withFormer && c.formerly) {
      const f = document.createElement('span');
      f.className = 'cl-former';
      f.textContent = 'Formerly ' + c.formerly;
      el.append(f);
    }
    return el;
  }

  function buildSet(decorative, onChange) {
    const ul = document.createElement('ul');
    ul.className = 'cl-set';
    ul.setAttribute('role', 'list');
    if (decorative) ul.setAttribute('aria-hidden', 'true');
    list.forEach(c => ul.append(item(c, 'li', 'cl-item', decorative, onChange)));
    return ul;
  }

  /* ---------- Grid ---------- */
  /* Columns that leave the fewest empty cells in the last row (ties go to more columns). */
  function bestCols(n, options) {
    if (n <= options[0]) return Math.max(2, n);
    let best = options[0], gap = Infinity;
    options.forEach(c => { const g = (c - (n % c)) % c; if (g < gap) { gap = g; best = c; } });
    return best;
  }

  function renderGrid(host) {
    const n = list.length;
    const ul = document.createElement('ul');
    ul.className = 'cl-grid';
    ul.setAttribute('role', 'list');
    ul.style.setProperty('--cl-cols-lg', bestCols(n, [6, 5, 4]));
    ul.style.setProperty('--cl-cols-md', bestCols(n, [4, 3]));
    list.forEach(c => ul.append(item(c, 'li', 'cl-tile', false, () => {}, true)));
    host.classList.add('cl', 'cl--grid');
    host.replaceChildren(ul);
  }

  /* ---------- Marquee ---------- */
  function renderMarquee(host) {
    const section = sectionOf(host);
    const slot = section.querySelector('[data-clients-controls]');
    let raf = 0, lastW = 0, paused = false, btn = null, io = null;

    host.classList.add('cl', 'cl--marquee');
    const viewport = document.createElement('div');
    viewport.className = 'cl-viewport';
    const track = document.createElement('div');
    track.className = 'cl-track';
    viewport.append(track);

    const measureSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fill(); }); };

    /* Repeat the set until half the track is wider than the band, then double it,
       so a -50% slide loops with no visible seam. Only the first set is read out. */
    function fill() {
      if (reduceMQ.matches) return;
      const first = track.firstElementChild;
      const setW = first ? first.getBoundingClientRect().width : 0;
      const vw = viewport.clientWidth;
      if (!setW || !vw) return;
      const reps = Math.max(1, Math.ceil(vw / setW));
      const need = reps * 2;
      while (track.children.length < need) track.append(buildSet(true, measureSoon));
      while (track.children.length > need) track.lastElementChild.remove();
      const speed = innerWidth < 560 ? 30 : 42; /* px per second */
      const dur = (setW * reps) / speed;
      const cur = parseFloat(track.style.getPropertyValue('--cl-dur')) || 0;
      if (Math.abs(cur - dur) / dur > .04) track.style.setProperty('--cl-dur', dur.toFixed(1) + 's');
    }

    function setPaused(p) {
      paused = p;
      host.classList.toggle('is-paused', p);
      if (!btn) return;
      btn.querySelector('path').setAttribute('d', p ? ICON.play : ICON.pause);
      btn.querySelector('.cl-toggle-t').textContent = p ? 'Play' : 'Pause';
    }

    function makeButton() {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cl-toggle';
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', ICON.pause);
      svg.append(path);
      const t = document.createElement('span'); t.className = 'cl-toggle-t'; t.textContent = 'Pause';
      const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = ' client logos';
      b.append(svg, t, sr);
      b.addEventListener('click', () => setPaused(!paused));
      return b;
    }

    function build() {
      track.replaceChildren(buildSet(false, measureSoon));
      track.style.removeProperty('--cl-dur');
      const still = reduceMQ.matches;
      host.classList.toggle('is-static', still);
      if (btn) { btn.remove(); btn = null; }
      if (!still) {
        btn = makeButton();
        (slot || host).append(btn);
        setPaused(paused);
        fill();
      }
    }

    host.replaceChildren(viewport);
    build();

    addEventListener('resize', () => {
      if (innerWidth === lastW) return;
      lastW = innerWidth; measureSoon();
    }, { passive: true });
    lastW = innerWidth;
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', build);

    /* A focused logo link inside the clipped band can scroll it sideways; put it back. */
    viewport.addEventListener('focusout', () => { viewport.scrollLeft = 0; });

    /* Stop the animation while the band is off screen. */
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => host.classList.toggle('is-off', !e.isIntersecting), { rootMargin: '120px 0px' });
      io.observe(host);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureSoon);
  }

  hosts.forEach(host => {
    const kind = host.getAttribute('data-clients');
    sectionOf(host).hidden = false;
    if (kind === 'grid') renderGrid(host); else renderMarquee(host);
  });
})();
