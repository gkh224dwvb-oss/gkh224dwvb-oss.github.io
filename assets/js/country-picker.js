/* =========================================================================
   COUNTRY PICKER · a searchable country list, like the one a phone app shows
   when you pick a country for a phone number. Used by the careers form
   (nationality) and the admin panel (nationality filter and Add CV form).
   Needs assets/data/countries.js (window.SAA_COUNTRIES) and
   assets/css/country-picker.css.

     const p = SAACountryPicker.create(hostEl, {
       id, name, required, allowAll, allLabel, placeholder, searchLabel,
       emptyLabel, closeLabel, describedBy, lang, value, onChange(code) });
     p.value            -> 'AE' ('' when nothing, or "All", is chosen)
     p.setValue('IN')   -> sets it without calling onChange
     p.focus(), p.destroy(); p.el (the host), p.button, p.input

   - The host's content is replaced by a button (flag, name, chevron) and a
     hidden <input name=name> holding the ISO code, for forms. The button
     gets the id, so <label for=id> and an error span keep working; set
     aria-invalid on p.button to mark an error.
   - A choice made by the visitor calls onChange(code) and fires a bubbling
     'change' event on the hidden input. setValue() does neither.
   - Names come in the visitor's language (Intl.DisplayNames, English as the
     fallback), sorted for that language; United Arab Emirates comes first.
     allowAll puts "All nationalities" (value '') above it.
   - The search matches the local name, the English name, other English
     names (alt in countries.js), the code and the dialling code, ignoring
     accents and case.
   - Keyboard: on the button, Down/Up/Enter/Space open it and typing a letter
     opens it with that letter searched. In the list: Up/Down, Page Up/Down,
     Home/End, Enter chooses, Esc closes, Tab closes and moves on.
     ARIA: the button opens a dialog holding a combobox (the search box) that
     controls a listbox (aria-activedescendant).
   - Screens up to 640px wide get a bottom sheet with a large search box.
   - The words it shows come from the options (the defaults are English):
     pass them through SAAI18n.t() on the site. Its own markup carries
     translate="no", so assets/js/i18n.js leaves the country names alone.
   ========================================================================= */
(function () {
  'use strict';

  var PIN = 'AE';
  var SHEET_MQ = '(max-width: 640px)';
  var count = 0;
  var flagOK = null;

  var SVG = 'http://www.w3.org/2000/svg';
  var ICONS = {
    chev: 'M6 9l6 6 6-6',
    search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM20 20l-4.8-4.8',
    tick: 'M5 12.5l4.5 4.5L19 7.5',
    close: 'M6 6l12 12M18 6L6 18',
    globe: 'M12 2.8a9.2 9.2 0 1 1 0 18.4 9.2 9.2 0 0 1 0-18.4zM2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2c-2.6-2.6-3.9-5.6-3.9-9.2S9.4 5.4 12 2.8z'
  };
  function icon(name, cls) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.setAttribute('class', cls);
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', ICONS[name]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }
  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  /* ---------- countries ---------- */
  function countries() { return Array.isArray(window.SAA_COUNTRIES) ? window.SAA_COUNTRIES : []; }
  function find(code) {
    code = String(code || '').trim().toUpperCase();
    var all = countries();
    for (var i = 0; i < all.length; i++) if (all[i].code === code) return all[i];
    return null;
  }
  /* regional indicator letters: AE -> the UAE flag (systems without flag emoji show the code instead) */
  function flagText(code) {
    return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65) : '';
  }
  function canFlag() {
    if (flagOK !== null) return flagOK;
    flagOK = true;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 24;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.textBaseline = 'top';
      x.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      x.fillText(flagText(PIN), 0, 0);
      var d = x.getImageData(0, 0, 24, 24).data, colour = false;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 100 && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i + 1] - d[i + 2]) > 40)) { colour = true; break; }
      }
      flagOK = colour;   /* Windows draws the two letters in grey: show the code instead */
    } catch (e) { flagOK = true; }
    return flagOK;
  }
  function flagEl(code) {
    var f = make('span', 'cp-flag');
    f.setAttribute('aria-hidden', 'true');
    if (canFlag()) f.textContent = flagText(code);
    else { f.classList.add('cp-flag-code'); f.textContent = code; }
    return f;
  }

  var namers = {};
  function namer(lang) {
    if (/^en\b/i.test(lang)) return null;
    if (!(lang in namers)) {
      try { namers[lang] = new Intl.DisplayNames([lang], { type: 'region', fallback: 'code' }); } catch (e) { namers[lang] = null; }
    }
    return namers[lang];
  }
  function nameOf(code, lang) {
    var c = find(code);
    if (!c) return '';
    var dn = namer(lang || 'en'), n = '';
    if (dn) { try { n = dn.of(c.code); } catch (e) { n = ''; } }
    return n && n !== c.code ? n : c.name;
  }

  /* search folding: no accents, no case, Arabic letter variants joined, punctuation as spaces */
  function fold(s) {
    return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/[\u0649\u06CC]/g, '\u064A').replace(/\u06A9/g, '\u0643').replace(/[\u0629\u06C0]/g, '\u0647').replace(/\u0640/g, '')
      .replace(/[\u2019\u2018'`\u00B4.,()&\/\-\u2013]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function western(s) {
    return String(s || '').replace(/[\u0660-\u0669]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/[\u0966-\u096F]/g, function (d) { return d.charCodeAt(0) - 0x966; });
  }

  /* the list for one language: [{ code, name (English), local, dial, digits, keys }], UAE first */
  var lists = {};
  function listFor(lang) {
    if (lists[lang]) return lists[lang];
    var coll = null;
    try { coll = new Intl.Collator(lang, { sensitivity: 'base' }); } catch (e) { coll = null; }
    var rows = countries().map(function (c) {
      var local = nameOf(c.code, lang);
      var keys = [fold(local), fold(c.name)].concat(String(c.alt || '').split(',').map(fold)).filter(Boolean);
      return { code: c.code, name: c.name, local: local, dial: c.dial || '', digits: String(c.dial || '').replace(/\D/g, ''), keys: keys };
    });
    rows.sort(function (a, b) {
      if (a.code === PIN || b.code === PIN) return a.code === PIN ? -1 : 1;
      return coll ? coll.compare(a.local, b.local) : (a.local < b.local ? -1 : a.local > b.local ? 1 : 0);
    });
    lists[lang] = rows;
    return rows;
  }
  /* 0 = a name or the code is exactly it, 1 = a name starts with it, 2 = a word does, 3 = it is inside a name; -1 = no match */
  function score(row, q, qd) {
    if (qd) return row.digits.indexOf(qd) === 0 ? (row.digits === qd ? 0 : 1) : -1;
    if (q.length === 2 && row.code.toLowerCase() === q) return 0;
    var best = -1;
    for (var i = 0; i < row.keys.length; i++) {
      var k = row.keys[i], at = k.indexOf(q);
      if (at < 0) continue;
      var s = at === 0 ? (k.length === q.length ? 0 : 1) : k.charAt(at - 1) === ' ' ? 2 : 3;
      if (best < 0 || s < best) best = s;
      if (!best) break;
    }
    return best;
  }

  /* ---------- one picker ---------- */
  function create(host, opts) {
    if (!host || host.nodeType !== 1) throw new Error('country picker: no host element');
    opts = opts || {};
    var uid = opts.id || ('cp' + (++count));
    var lang = String(opts.lang || document.documentElement.getAttribute('lang') || 'en');
    var allowAll = !!opts.allowAll;
    var words = {
      placeholder: opts.placeholder || 'Choose your nationality',
      search: opts.searchLabel || 'Search countries',
      empty: opts.emptyLabel || 'No country found',
      all: opts.allLabel || 'All nationalities',
      close: opts.closeLabel || 'Close'
    };
    var value = find(opts.value) ? find(opts.value).code : '';
    var sheetMQ = window.matchMedia ? window.matchMedia(SHEET_MQ) : null;

    /* the button and the hidden input */
    var button = make('button', 'cp-btn');
    button.type = 'button';
    button.id = uid;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', uid + '-pop');
    if (opts.describedBy) button.setAttribute('aria-describedby', opts.describedBy);
    var bFlag = make('span', 'cp-flag');
    bFlag.setAttribute('aria-hidden', 'true');
    var bVal = make('span', 'cp-val');
    bVal.id = uid + '-val';
    button.append(bFlag, bVal, icon('chev', 'cp-chev'));
    var input = make('input');
    input.type = 'hidden';
    if (opts.name) input.name = opts.name;
    if (opts.required) input.setAttribute('data-required', 'true');

    /* <label for=id> names the button together with the current value; a click on it only focuses */
    var label = null;
    try { label = document.querySelector('label[for="' + uid + '"]'); } catch (e) { label = null; }
    var labelId = '';
    if (label) {
      if (!label.id) label.id = uid + '-label';
      labelId = label.id;
      button.setAttribute('aria-labelledby', labelId + ' ' + bVal.id);
    }
    var onLabel = function (e) { e.preventDefault(); button.focus(); };
    if (label) label.addEventListener('click', onLabel);

    /* the pop-up: a dialog with the search box and the list; it moves to <body> while open */
    var pop = make('div', 'cp-pop');
    pop.id = uid + '-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('translate', 'no');
    pop.setAttribute('data-i18n-skip', '');
    pop.setAttribute('data-lenis-prevent', '');
    pop.setAttribute('lang', lang);
    pop.tabIndex = -1;
    if (labelId) pop.setAttribute('aria-labelledby', labelId); else pop.setAttribute('aria-label', words.search);
    var head = make('div', 'cp-head');
    var grab = make('span', 'cp-grab'); grab.setAttribute('aria-hidden', 'true');
    var title = make('span', 'cp-title', label ? label.textContent.replace(/\s+/g, ' ').trim() : '');
    title.setAttribute('aria-hidden', 'true');
    var close = make('button', 'cp-close');
    close.type = 'button';
    close.setAttribute('aria-label', words.close);
    close.appendChild(icon('close', 'cp-close-ic'));
    var sWrap = make('div', 'cp-search');
    var sLabel = make('label', 'cp-sr', words.search);
    sLabel.htmlFor = uid + '-q';
    var q = make('input', 'cp-q');
    q.type = 'text';
    q.id = uid + '-q';
    q.placeholder = words.search;
    q.autocomplete = 'off';
    q.spellcheck = false;
    q.setAttribute('autocapitalize', 'off');
    q.setAttribute('autocorrect', 'off');
    q.setAttribute('role', 'combobox');
    q.setAttribute('aria-autocomplete', 'list');
    q.setAttribute('aria-expanded', 'true');
    q.setAttribute('aria-controls', uid + '-list');
    sWrap.append(sLabel, icon('search', 'cp-search-ic'), q);
    head.append(grab, title, close, sWrap);
    var list = make('ul', 'cp-list');
    list.id = uid + '-list';
    list.setAttribute('role', 'listbox');
    if (labelId) list.setAttribute('aria-labelledby', labelId); else list.setAttribute('aria-label', words.search);
    var empty = make('p', 'cp-empty');
    empty.setAttribute('role', 'status');
    pop.append(head, list, empty);
    var scrim = make('div', 'cp-scrim');
    scrim.setAttribute('aria-hidden', 'true');

    host.classList.add('cp');
    host.setAttribute('translate', 'no');
    host.setAttribute('data-i18n-skip', '');
    host.textContent = '';
    host.append(button, input);

    /* ---------- state ---------- */
    var opts_ = [];      /* li elements, built on first open */
    var byCode = {};
    var shown = [];      /* li elements in the order shown */
    var active = -1;
    var open = false, sheet = false, raf = 0, lastPointer = '', downInPop = false;

    function paint() {
      input.value = value;
      bFlag.className = 'cp-flag';
      bFlag.textContent = '';
      var c = value ? find(value) : null;
      if (c) {
        var f = flagEl(c.code);
        bFlag.className = f.className; bFlag.textContent = f.textContent;
        bVal.textContent = nameOf(c.code, lang);
        bVal.classList.remove('cp-ph');
      } else if (allowAll) {
        bFlag.classList.add('cp-flag-all');
        bFlag.appendChild(icon('globe', 'cp-globe'));
        bVal.textContent = words.all;
        bVal.classList.remove('cp-ph');
      } else {
        bFlag.classList.add('cp-flag-none');
        bVal.textContent = words.placeholder;
        bVal.classList.add('cp-ph');
      }
      for (var k in byCode) byCode[k].setAttribute('aria-selected', k === (value || '*') ? 'true' : 'false');
    }

    function build() {
      if (opts_.length) return;
      var rows = listFor(lang);
      var all = allowAll ? [{ code: '', local: words.all, dial: '' }].concat(rows) : rows;
      all.forEach(function (r) {
        var li = make('li', 'cp-opt');
        li.setAttribute('role', 'option');
        li.id = uid + '-o-' + (r.code || 'all');
        li.setAttribute('data-code', r.code);
        if (r.code) li.appendChild(flagEl(r.code));
        else { var g = make('span', 'cp-flag cp-flag-all'); g.setAttribute('aria-hidden', 'true'); g.appendChild(icon('globe', 'cp-globe')); li.appendChild(g); }
        li.appendChild(make('span', 'cp-oname', r.local));
        if (r.dial) {
          var d = make('span', 'cp-odial', r.dial);
          d.setAttribute('dir', 'ltr');
          li.appendChild(d);
        }
        li.appendChild(icon('tick', 'cp-tick'));
        li._row = r;
        opts_.push(li);
        byCode[r.code || '*'] = li;
      });
      paint();
    }

    function filter() {
      var raw = western(q.value).trim();
      var qd = /^[+\d\s()-]+$/.test(raw) && /\d/.test(raw) ? raw.replace(/\D/g, '') : '';
      if (qd) qd = qd.replace(/^00(?=\d)/, '');   /* 00971 is +971: no dialling code starts with 0 */
      var fq = qd ? '' : fold(raw);
      var frag = document.createDocumentFragment();
      if (!qd && !fq) shown = opts_.slice();
      else {
        var hits = [];
        opts_.forEach(function (li, i) {
          var r = li._row;
          if (!r.code) return;   /* "All" only shows with an empty search */
          var s = score(r, fq, qd);
          if (s >= 0) hits.push({ li: li, s: s, i: i });
        });
        hits.sort(function (a, b) { return a.s - b.s || a.i - b.i; });
        shown = hits.map(function (h) { return h.li; });
      }
      var pinned = !qd && !fq;
      opts_.forEach(function (li) { li.classList.remove('is-active', 'cp-pin'); });
      shown.forEach(function (li) { frag.appendChild(li); });
      if (pinned) { var p = byCode[PIN]; if (p) p.classList.add('cp-pin'); }
      list.textContent = '';
      list.appendChild(frag);
      list.scrollTop = 0;
      empty.textContent = shown.length ? '' : words.empty;
      list.hidden = !shown.length;
      setActive(shown.length ? 0 : -1, true);
      if (open && !sheet) place();
    }

    function setActive(i, quiet) {
      if (active >= 0 && shown[active]) shown[active].classList.remove('is-active');
      active = i;
      var li = shown[i];
      if (!li) { q.removeAttribute('aria-activedescendant'); return; }
      li.classList.add('is-active');
      q.setAttribute('aria-activedescendant', li.id);
      if (!quiet) reveal(li);
    }
    function reveal(li, centre) {
      var top = li.offsetTop, h = li.offsetHeight, view = list.clientHeight, st = list.scrollTop;
      if (centre) list.scrollTop = Math.max(0, top - (view - h) / 2);
      else if (top < st) list.scrollTop = top - 6;
      else if (top + h > st + view) list.scrollTop = top + h - view + 6;
    }

    /* ---------- placing ---------- */
    function copyLook() {
      var cs = getComputedStyle(host), names = ['--cp-fg', '--cp-muted', '--cp-field', '--cp-pop', '--cp-line', '--cp-accent', '--cp-hl', '--cp-focus', '--cp-ring', '--cp-shadow', '--cp-scrim'];
      names.forEach(function (n) { var v = cs.getPropertyValue(n); if (v) pop.style.setProperty(n, v.trim()); });
      pop.style.fontFamily = cs.fontFamily;
      pop.setAttribute('dir', cs.direction === 'rtl' ? 'rtl' : 'ltr');
    }
    function place() {
      if (!open || sheet) return;
      var r = button.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 6, m = 8;
      var w = Math.min(Math.max(r.width, 300), vw - 2 * m);
      var rtl = pop.getAttribute('dir') === 'rtl';
      var left = Math.max(m, Math.min(rtl ? r.right - w : r.left, vw - m - w));
      var headH = head.offsetHeight + (empty.textContent ? empty.offsetHeight : 0);
      var listH = Math.min(list.scrollHeight, 320);
      var below = vh - r.bottom - gap - m, above = r.top - gap - m;
      var up = below < Math.min(headH + listH, 260) && above > below;
      var room = Math.max(160, up ? above : below);
      list.style.maxHeight = Math.max(110, Math.min(320, room - headH - 4)) + 'px';
      pop.style.width = w + 'px';
      pop.style.left = left + 'px';
      if (up) { pop.style.top = 'auto'; pop.style.bottom = (vh - r.top + gap) + 'px'; }
      else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + gap) + 'px'; }
    }
    function fitSheet() {
      var vv = window.visualViewport;
      if (!vv || !sheet) return;
      pop.style.setProperty('--cp-vh', vv.height + 'px');
      pop.style.setProperty('--cp-kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
    }
    function onMove(e) {
      if (raf || (e && e.target === list)) return;
      raf = requestAnimationFrame(function () { raf = 0; if (sheet) fitSheet(); else place(); });
    }
    function onResize() {
      if (!open) return;
      if (sheetMQ && sheetMQ.matches !== sheet) { hide(false); return; }
      onMove();
    }

    /* ---------- open / close ---------- */
    function show(seed, how) {
      if (open) return;
      build();
      open = true;
      sheet = !!(sheetMQ && sheetMQ.matches);
      copyLook();
      pop.classList.toggle('cp-sheet', sheet);
      pop.classList.toggle('cp-drop', !sheet);
      if (sheet) { pop.setAttribute('aria-modal', 'true'); document.body.appendChild(scrim); } else pop.removeAttribute('aria-modal');
      pop.style.top = pop.style.bottom = pop.style.left = pop.style.width = '';
      list.style.maxHeight = '';
      document.body.appendChild(pop);
      pop.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      q.value = seed || '';
      filter();
      if (!seed) {
        var cur = byCode[value || (allowAll ? '*' : '')];
        var i = cur ? shown.indexOf(cur) : -1;
        if (i >= 0) { setActive(i, true); reveal(cur, true); }
      }
      if (sheet) fitSheet(); else place();
      /* a tap opens the sheet without raising the keyboard: the search box is one more tap away */
      if (how === 'touch' && sheet) pop.focus({ preventScroll: true });
      else { q.focus({ preventScroll: true }); if (seed) q.setSelectionRange(seed.length, seed.length); }
      document.addEventListener('pointerdown', onOutside, true);
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onMove, true);
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', onMove); window.visualViewport.addEventListener('scroll', onMove); }
    }
    function hide(refocus) {
      if (!open) return;
      open = false;
      pop.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (pop.parentNode) pop.parentNode.removeChild(pop);
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onMove, true);
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', onMove); window.visualViewport.removeEventListener('scroll', onMove); }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (refocus) button.focus({ preventScroll: true });
    }
    function choose(li) {
      if (!li) return;
      var code = li.getAttribute('data-code') || '';
      var changed = code !== value;
      value = code;
      paint();
      hide(true);
      if (!changed) return;
      if (typeof opts.onChange === 'function') { try { opts.onChange(value); } catch (e) { setTimeout(function () { throw e; }); } }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function onOutside(e) {
      if (pop.contains(e.target) || button.contains(e.target) || e.target === scrim) return;   /* the scrim closes on its click */
      hide(false);
    }

    /* ---------- events ---------- */
    function onBtnDown(e) { lastPointer = e.pointerType || ''; }
    function onBtnClick() {
      var how = lastPointer; lastPointer = '';
      if (open) hide(true); else show('', how);
    }
    function onBtnKey(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(''); return; }
      if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); show(e.key); }
    }
    function onKey(e) {
      if (!open) return;
      if (e.isComposing || e.keyCode === 229) return;   /* keys inside an input method (Chinese pinyin...): Enter commits the text, not a country */
      var n = shown.length;
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); if (n) setActive(Math.min(n - 1, active + 1)); return;
        case 'ArrowUp': e.preventDefault(); if (n) setActive(Math.max(0, active - 1)); return;
        case 'PageDown': e.preventDefault(); if (n) setActive(Math.min(n - 1, active + 8)); return;
        case 'PageUp': e.preventDefault(); if (n) setActive(Math.max(0, active - 8)); return;
        case 'Home': if (e.shiftKey) return; e.preventDefault(); if (n) setActive(0); return;
        case 'End': if (e.shiftKey) return; e.preventDefault(); if (n) setActive(n - 1); return;
        case 'Enter':
          e.preventDefault();
          if (e.target === close) { hide(true); return; }
          if (active >= 0) choose(shown[active]);
          return;
        case 'Escape': e.preventDefault(); e.stopPropagation(); hide(true); return;
        case 'Tab':
          if (sheet) {   /* the sheet is modal: Tab moves between the search box and the close button */
            e.preventDefault();
            (document.activeElement === q ? close : q).focus();
            return;
          }
          hide(false);
          button.focus({ preventScroll: true });   /* the browser then moves on from the button */
          return;
      }
    }
    /* a click on a country keeps the focus in the search box; after using the scrollbar it goes back there */
    function onListMouseDown(e) { if (e.target.closest && e.target.closest('.cp-opt')) e.preventDefault(); }
    function onListUp() { if (open && !sheet && !pop.contains(document.activeElement)) q.focus({ preventScroll: true }); }
    function onListClick(e) {
      var li = e.target.closest && e.target.closest('.cp-opt');
      if (li && list.contains(li)) choose(li);
    }
    function onListHover(e) {
      if (e.pointerType !== 'mouse') return;
      var li = e.target.closest && e.target.closest('.cp-opt');
      var i = li ? shown.indexOf(li) : -1;
      if (i >= 0 && i !== active) setActive(i, true);
    }
    function onFocusOut() {
      if (sheet) return;   /* closing the phone keyboard must not close the sheet */
      setTimeout(function () {
        if (!open || downInPop) { downInPop = false; return; }
        var a = document.activeElement;
        if (a && (pop.contains(a) || a === button)) return;
        hide(false);
      }, 0);
    }
    /* the page behind a sheet does not scroll */
    function stopScroll(e) { if (!(e.target.closest && e.target.closest('.cp-list'))) e.preventDefault(); }

    button.addEventListener('pointerdown', onBtnDown);
    button.addEventListener('click', onBtnClick);
    button.addEventListener('keydown', onBtnKey);
    pop.addEventListener('keydown', onKey);
    pop.addEventListener('focusout', onFocusOut);
    pop.addEventListener('pointerdown', function () { downInPop = true; setTimeout(function () { downInPop = false; }, 400); });
    pop.addEventListener('touchmove', stopScroll, { passive: false });
    pop.addEventListener('wheel', stopScroll, { passive: false });
    scrim.addEventListener('touchmove', stopScroll, { passive: false });
    scrim.addEventListener('wheel', stopScroll, { passive: false });
    scrim.addEventListener('click', function () { hide(true); });
    q.addEventListener('input', filter);
    close.addEventListener('click', function () { hide(true); });
    list.addEventListener('mousedown', onListMouseDown);
    list.addEventListener('pointerup', onListUp);
    list.addEventListener('click', onListClick);
    list.addEventListener('pointermove', onListHover);

    paint();

    return {
      el: host,
      button: button,
      input: input,
      get value() { return value; },
      setValue: function (code) {
        var c = find(code);
        value = c ? c.code : '';
        paint();
      },
      focus: function () { button.focus(); },
      destroy: function () {
        hide(false);
        if (label) label.removeEventListener('click', onLabel);
        host.textContent = '';
        host.classList.remove('cp');
        host.removeAttribute('translate');
        host.removeAttribute('data-i18n-skip');
      }
    };
  }

  window.SAACountryPicker = {
    create: create,
    /* for tables and summaries: the country, its flag and its name in a language */
    find: find,
    flag: function (code) { var c = find(code); return c ? flagText(c.code) : ''; },
    nameOf: nameOf
  };
})();
