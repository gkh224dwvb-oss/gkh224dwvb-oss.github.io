/* =========================================================================
   SAA GROUP — languages: English, Arabic, Chinese, Urdu, Hindi, Russian
   theme.js (in <head>) picks the language before the first paint: ?lang=xx, else the
   visitor's saved choice (localStorage 'saa-lang'), else English. For any other language it
   sets <html lang dir data-lang>, hides the page (class i18n-wait, i18n.css reveals it after
   1.5 s whatever happens) and loads assets/i18n/<lang>.js (window.SAA_I18N) parser-blocking,
   so the dictionary is ready before this file runs.
   This file is the first deferred script on every page. It swaps the English text for the
   dictionary's before site.js and the page scripts run, then keeps translating what scripts
   add later (MutationObserver). In English it only provides the language switch.
   Keys: an element whose content is only text and inline elements is one segment, keyed by
   its whitespace-collapsed innerHTML; text next to block elements is keyed by itself; plus the
   attributes in ATTRS and the page title. A key the dictionary lacks stays English.
   tools/i18n-extract.mjs collects the keys by running this file in collect mode
   (localStorage 'saa-i18n-collect' = '1'), so the keys always match what runs here.
   API: SAAI18n.lang, .dir, .t(str) or .t(pattern, { n: 3 }) for strings scripts build, .translate(root), .ui('head'|'menu'),
   .words(text) and .splitMode(mode) for site.js's split text.
   ========================================================================= */
(function () {
  'use strict';
  var LANGS = [['en', 'English'], ['ar', 'العربية'], ['zh', '中文'], ['ur', 'اردو'], ['hi', 'हिन्दी'], ['ru', 'Русский']];
  var HTML_LANG = { en: 'en-GB', ar: 'ar', zh: 'zh-Hans', ur: 'ur', hi: 'hi', ru: 'ru' };   /* same table as theme.js */
  var RTL = { ar: 1, ur: 1 };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var root = document.documentElement;
  var lang = root.getAttribute('data-lang') || 'en';
  if (!HTML_LANG.hasOwnProperty(lang)) lang = 'en';
  var collect = false;
  try { collect = localStorage.getItem('saa-i18n-collect') === '1'; } catch (e) {}
  var D = lang !== 'en' && window.SAA_I18N && window.SAA_I18N.lang === lang ? window.SAA_I18N : {};
  if (lang !== 'en' && !D.s) {   /* the dictionary did not load: show the page as it is, in English and left to right */
    lang = 'en'; root.lang = HTML_LANG.en; root.removeAttribute('dir'); root.removeAttribute('data-lang'); root.classList.remove('i18n-wait');
  }
  var S = D.s || {}, P = [], active = lang !== 'en' || collect;
  var has = Object.prototype.hasOwnProperty;

  /* patterns (strings.json "patterns"): strings scripts build around a number or a name, such as
     "{n, plural, one {# day} other {# days}} to go · 2–5 Nov". {n}, {n2}... stand for a number, any other
     {name} for text, which is itself translated when the dictionary has it. A plural block (ICU style:
     {n, plural, =0 {...} one {...} few {...} other {...}}, # is the number) picks its form by the
     language's plural rules (Intl.PluralRules), in the English that is matched and in the translation. */
  var NUM = '(\\d[\\d,.]*)', PR = null;
  try { PR = new Intl.PluralRules(HTML_LANG[lang]); } catch (e) {}
  function icu(s) {   /* -> tokens: 'text', { v: name }, { hash: 1 }, { v: name, cases: { one: tokens, ... } } */
    var i = 0;
    function seq(inCase) {
      var toks = [], buf = '', m, c;
      while (i < s.length) {
        c = s.charAt(i);
        if (c === '}' && inCase) break;
        if (c === '#' && inCase) { if (buf) toks.push(buf); buf = ''; toks.push({ hash: 1 }); i++; continue; }
        m = c === '{' && /^\{(\w+)(\}|\s*,\s*plural\s*,)/.exec(s.slice(i));
        if (!m) { buf += c; i++; continue; }
        if (buf) toks.push(buf); buf = '';
        i += m[0].length;
        if (m[2] === '}') { toks.push({ v: m[1] }); continue; }
        var cases = {}, cm;
        while ((cm = /^\s*(=?\w+)\s*\{/.exec(s.slice(i)))) { i += cm[0].length; cases[cm[1]] = seq(true); i++; }
        if ((cm = /^\s*\}/.exec(s.slice(i)))) i += cm[0].length;
        toks.push({ v: m[1], cases: cases });
      }
      if (buf) toks.push(buf);
      return toks;
    }
    return seq(false);
  }
  function rx(toks, groups, hashVar) {
    return toks.map(function (t) {
      if (typeof t === 'string') return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (t.hash) { groups.push(hashVar); return NUM; }
      if (!t.cases) { groups.push(t.v); return /^n\d*$/.test(t.v) ? NUM : '(.+?)'; }
      return '(?:' + Object.keys(t.cases).map(function (k) { return rx(t.cases[k], groups, t.v); }).join('|') + ')';
    }).join('');
  }
  function literal(toks) {
    return toks.map(function (t) { return typeof t === 'string' ? t : t.cases ? Object.keys(t.cases).map(function (k) { return literal(t.cases[k]); }).join('') : ''; }).join('');
  }
  function render(toks, vals, depth, hashVar) {
    return toks.map(function (t) {
      if (typeof t === 'string') return t;
      if (t.hash) return vals[hashVar];
      var x = vals[t.v];
      if (!t.cases) {
        if (x == null) return '{' + t.v + '}';
        var tx = !/^n\d*$/.test(t.v) && depth < 2 ? lookIn(norm(x), depth + 1) : null;
        return tx == null ? x : tx;
      }
      var n = parseFloat(String(x).replace(/,/g, '')), c = t.cases['=' + n] || (PR && !isNaN(n) && t.cases[PR.select(n)]) || t.cases.other;
      return render(c || [], vals, depth, t.v);
    }).join('');
  }
  Object.keys(D.p || {}).forEach(function (k) {
    var toks = icu(k), groups = [];
    if (literal(toks).trim()) P.push({ re: new RegExp('^' + rx(toks, groups) + '$'), groups: groups, v: icu(D.p[k]) });
  });
  function fill(p, m, depth) {
    var vals = {};
    p.groups.forEach(function (n, j) { if (m[j + 1] !== undefined && !has.call(vals, n)) vals[n] = m[j + 1]; });
    return render(p.v, vals, depth);
  }

  /* ---------- keys ---------- */
  var INLINE = {}, SKIP = {};
  'a abbr b bdi br code em i mark q s small span strong sub sup time u wbr tspan textPath'.split(' ').forEach(function (t) { INLINE[t] = 1; });
  'script style noscript template textarea iframe canvas video audio object'.split(' ').forEach(function (t) { SKIP[t] = 1; });
  /* attributes that end up on screen or in a screen reader (data-cursor: the cursor label, data-label: table
     cell captions, data-w: Quality's typed words, data-copy-*: Contact's copy messages) */
  var ATTRS = ['alt', 'aria-label', 'title', 'placeholder', 'aria-description', 'aria-roledescription',
    'data-cursor', 'data-label', 'data-w', 'data-copy-done', 'data-copy-sel'];
  var BLOCKED = '[translate="no"],[data-i18n-skip],script,style,noscript,template,textarea,.split-word,.split-char,.split-sr';
  var LETTER = /\p{L}/u, WS = /[ \t\n\r\f]+/g;
  var NOT_TEXT = /^(?:[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/\S+|www\.\S+)$/i;   /* an email or web address on its own */
  var norm = function (s) { return String(s).replace(/<!--[\s\S]*?-->/g, '').replace(WS, ' ').trim(); };
  var plain = function (k) { return k.replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ').replace(WS, ' ').trim(); };
  /* aria-current moves with the page (the menu marks the page you are on), so keys leave it out, and so
     the dir="ltr" that right-to-left pages put on Latin strings (ltrRun below) */
  var segKey = function (el) { return norm(el.innerHTML).replace(/ aria-current="[^"]*"| dir="ltr"/g, ''); };
  var mine = new WeakMap();   /* element -> the content this file put there, so its own changes are left alone */

  var notes = collect ? new Map() : null;
  function describe(el) {
    var out = [];
    for (var n = el, i = 0; n && n.nodeType === 1 && i < 4 && n !== document.body; n = n.parentNode, i++) {
      var c = n.getAttribute('class'), id = n.getAttribute('id');
      out.push(n.localName + (id ? '#' + id : '') + (c ? '.' + c.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    }
    return out.join(' < ');
  }
  function note(key, kind, el, hint) {
    var e = notes.get(key);
    if (!e) notes.set(key, e = { key: key, kind: kind, hint: hint || (el ? describe(el) : '') });
    else if (!e.hint && (hint || el)) e.hint = hint || describe(el);
  }

  function lookIn(key, depth) {
    if (has.call(S, key)) return S[key];
    for (var i = 0; i < P.length; i++) { var m = P[i].re.exec(key); if (m) return fill(P[i], m, depth); }
    return null;
  }
  function look(key, kind, el, hint) {
    if (!key) return null;
    var txt = plain(key);
    /* no words to translate; a right-to-left page still isolates a bare number such as the fax +971 2 626 8577 */
    if (!LETTER.test(txt) || NOT_TEXT.test(txt)) return RTL[lang] && /\d[ \u00a0]+\d/.test(txt) ? iso(key) : null;
    var v = lookIn(key, 0);
    if (v == null && notes) note(key, kind, el, hint);
    return v != null && RTL[lang] ? iso(v) : v;
  }
  /* right to left: phone numbers, figures such as 2,500+, coordinates (24°29′28.6″ N), emails and web addresses inside a translation keep their own order
     (wrapped in invisible left-to-right isolates; only the text between tags is touched) */
  var RUN = /(\+?\d[\d\u00a0 ()-]{5,}\d|\d[\d,.\u00a0]*\+(?!\d)|\d+°\d+′[\d.]+″(?:(?:&nbsp;|[ \u00a0])[NSEW](?![A-Za-z]))?|\d[\d.,]*°(?:(?:&nbsp;|[ \u00a0])[NSEW](?![A-Za-z]))?|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
  function iso(v) {
    return v.replace(/(^|>)([^<]+)/g, function (m, a, tx) { return a + tx.replace(RUN, function (r) { return '\u2066' + r + '\u2069'; }); });
  }

  function skipEl(el) {
    if (SKIP[el.localName] || el.getAttribute('translate') === 'no' || el.hasAttribute('data-i18n-skip')) return true;
    var c = el.classList;
    return !!c && (c.contains('split-word') || c.contains('split-char') || c.contains('split-sr'));
  }
  function inlineOnly(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && (!INLINE[n.localName] || skipEl(n) || !inlineOnly(n))) return false;
    }
    return true;
  }
  function hasLetters(el) { return LETTER.test(el.textContent); }

  /* ---------- writing a translation ---------- */
  function sig(el) {
    var s = el.localName, a = [].slice.call(el.attributes).filter(function (x) { return ATTRS.indexOf(x.name) < 0 && x.name !== 'style' && x.name !== 'aria-current' && x.name !== 'dir'; });
    a.sort(function (x, y) { return x.name < y.name ? -1 : 1; });
    a.forEach(function (x) { s += ' ' + x.name + '="' + x.value + '"'; });
    return s;
  }
  /* Replace el's content with the translated HTML but keep the original inline elements (matched by tag
     and attributes), so listeners and references that scripts hold on them survive, in any word order. */
  function morph(el, html) {
    var svg = el.namespaceURI === SVGNS, tpl = document.createElement('template');
    tpl.innerHTML = svg ? '<svg xmlns="' + SVGNS + '">' + html + '</svg>' : html;
    var src = svg ? tpl.content.firstChild : tpl.content;
    if (!src) return;
    var pool = [].slice.call(el.querySelectorAll('*')), sigs = pool.map(sig), used = [];
    el.textContent = '';
    pool.forEach(function (p) { p.textContent = ''; });
    (function build(from, into) {
      for (var n = from.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) into.appendChild(document.createTextNode(n.nodeValue));
        else if (n.nodeType === 1) {
          var s = sig(n), m = null;
          for (var i = 0; i < pool.length; i++) if (!used[i] && sigs[i] === s) { used[i] = 1; m = pool[i]; break; }
          if (!m) m = n.cloneNode(false);
          into.appendChild(m);
          build(n, m);
        }
      }
    })(src, el);
  }
  function put(el, v) {
    if (/[<&]/.test(v)) morph(el, v); else el.textContent = v;
    mine.set(el, segKey(el));
  }

  function seg(el) {
    var key = segKey(el);
    if (mine.get(el) === key) return;
    var v = look(key, /[<&]/.test(key) ? 'html' : 'text', el);
    /* an <option> without a value submits its text: keep that English, the forms email it to SAA */
    if (v != null && v !== key && el.localName === 'option' && !el.hasAttribute('value')) el.setAttribute('value', el.textContent);
    if (v != null && v !== key) put(el, v);
    if (RTL[lang]) { ltrRun(el); for (var c = el.firstElementChild; c; c = c.nextElementSibling) ltrRun(c); }
  }
  /* right to left pages: an inline string still all in Latin script and in several parts (coordinates such
     as 24.4913° N · 54.3609° E, a name and a date) keeps its own left-to-right order. Checked on the segment
     and on its child elements, for a segment that is a block of inline pieces. */
  var RTL_CH = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/, INLINE_TAG = /^(a|abbr|b|bdi|code|em|i|mark|q|s|small|span|strong|sub|sup|time|u)$/;
  function ltrRun(el) {
    if (el.hasAttribute('dir') || el.namespaceURI === SVGNS || !INLINE_TAG.test(el.localName)) return;
    var tx = el.textContent.trim();
    if (!RTL_CH.test(tx) && /[A-Za-z0-9][^A-Za-z0-9]+[A-Za-z0-9]/.test(tx)) el.setAttribute('dir', 'ltr');
  }
  function loose(n) {
    var raw = n.nodeValue, key = norm(raw);
    if (!key || mine.get(n) === raw) return;
    var v = look(key, 'text', n.parentNode);
    if (v == null || v === key) return;
    n.nodeValue = /^[ \t\n\r\f]*/.exec(raw)[0] + v + /[ \t\n\r\f]*$/.exec(raw)[0];
    mine.set(n, n.nodeValue);
  }
  function attr(el, a) {
    var raw = el.getAttribute(a);
    if (raw == null) return;
    var v = look(norm(raw), 'attr', el, a + ' on ' + describe(el));
    if (v != null && v !== raw) el.setAttribute(a, v);
  }
  function attrs(el) {
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) attr(el, ATTRS[i]);
    if (el.localName === 'input' && /^(submit|button|reset)$/i.test(el.type)) attr(el, 'value');
  }
  function attrsDeep(el) {
    attrs(el);
    var all = el.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) attrs(all[i]);
  }
  function walk(el) {
    if (el.nodeType !== 1 || skipEl(el)) return;
    if (el.firstChild && inlineOnly(el) && hasLetters(el)) { seg(el); attrsDeep(el); return; }
    for (var n = el.firstChild, next; n; n = next) {
      next = n.nextSibling;
      if (n.nodeType === 3) loose(n); else if (n.nodeType === 1) walk(n);
    }
    attrs(el);
  }
  function blocked(el) { return !el || el.nodeType !== 1 || !!(el.closest && el.closest(BLOCKED)); }

  /* text a script dropped into an element: translate the element if it is a segment, else the text */
  function textAdded(t, n) {
    if (inlineOnly(t)) { if (hasLetters(t)) seg(t); }
    else loose(n);
  }

  /* ---------- strings that scripts build ---------- */
  /* t(str) translates a string a script built; t(pattern, { n: 3 }) fills a pattern, such as
     t('{n, plural, one {# day} other {# days}} to go', { n: 3 }), with its translation when there is one */
  function t(s, hint) {
    if (s == null) return s;
    if (hint && typeof hint === 'object') {
      var vals = {}, pk = norm(s), tr = active && D.p && has.call(D.p, pk) ? D.p[pk] : null;
      Object.keys(hint).forEach(function (k) { vals[k] = String(hint[k]); });
      if (tr == null && notes) note(pk, 'pattern', null, 'script pattern');
      var out = render(icu(tr == null ? s : tr), vals, 0);
      return tr != null && RTL[lang] ? iso(out) : out;
    }
    if (!active) return s;
    var k = norm(s), v = look(k, /[<&]/.test(k) ? 'html' : 'text', null, hint || 'script');
    return v == null ? s : v;
  }
  function translate(el) {
    var p = el && el.parentNode;
    if (active && el && !(p && p.nodeType === 1 && blocked(p))) walk(el);
  }

  /* site.js split text: Arabic, Urdu and Hindi letters must stay joined, so they animate by word;
     Chinese has no spaces, so each character becomes its own word and lines can still wrap */
  function splitMode(mode) { if (active) queueFit(); return RTL[lang] || lang === 'hi' ? 'words' : mode; }
  var CJK = /[⺀-鿿豈-﫿＀-￯][　-〿，：；！？）》」』]*/g;
  function words(text) {
    var parts = text.split(/(\s+)/);
    if (lang !== 'zh') return parts;
    var out = [];
    parts.forEach(function (w) {
      if (!w || /^\s+$/.test(w)) { out.push(w); return; }
      var last = 0, m;
      CJK.lastIndex = 0;
      while ((m = CJK.exec(w))) {
        if (m.index > last) out.push(w.slice(last, m.index));
        out.push(m[0]); last = m.index + m[0].length;
      }
      if (last < w.length) out.push(w.slice(last));
    });
    return out;
  }

  /* ---------- the language switch ---------- */
  var GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2c-2.6-2.6-3.9-5.6-3.9-9.2S9.4 5.4 12 2.8z"/></g></svg>';
  var nameOf = function (c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === c) return LANGS[i][1]; return c; };
  var uiCount = 0;
  function options() {
    return LANGS.map(function (l) {
      /* the name carries its own lang and dir; the button follows the page, so every name lines up on the same side */
      return '<li><button type="button" class="lang-opt" data-set-lang="' + l[0] + '"' + (l[0] === lang ? ' aria-current="true"' : '') + '>' +
        '<span lang="' + HTML_LANG[l[0]] + '" dir="' + (RTL[l[0]] ? 'rtl' : 'ltr') + '">' + l[1] + '</span></button></li>';
    }).join('');
  }
  function ui(where) {
    var label = t('Language', 'language switch label');
    if (where === 'menu') return '<div class="menu-langs" translate="no" role="group" aria-label="' + label + '"><ul>' + options() + '</ul></div>';
    var id = 'langMenu' + (uiCount++ || '');
    return '<div class="lang-switch" translate="no"><button type="button" class="lang-toggle" aria-expanded="false" aria-controls="' + id + '" aria-label="' +
      label + ': ' + nameOf(lang) + '">' + GLOBE + '</button>' +
      '<ul class="lang-menu" id="' + id + '" hidden>' + options() + '</ul></div>';
  }
  function choose(code) {
    if (!HTML_LANG.hasOwnProperty(code)) return;
    var saved = false;
    try { localStorage.setItem('saa-lang', code); saved = localStorage.getItem('saa-lang') === code; } catch (e) {}
    var u = new URL(location.href);
    if (!saved || u.searchParams.has('lang')) { u.searchParams.set('lang', code); location.href = u.href; }
    else location.reload();
  }
  function openMenu(btn, open, focusFirst) {
    var menu = document.getElementById(btn.getAttribute('aria-controls'));
    if (!menu) return;
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    btn.parentNode.classList.toggle('open', open);
    if (open && focusFirst) (menu.querySelector('[aria-current]') || menu.querySelector('button')).focus();
  }
  function closeAll(except) {
    [].forEach.call(document.querySelectorAll('.lang-toggle[aria-expanded="true"]'), function (b) { if (b !== except) openMenu(b, false); });
  }
  document.addEventListener('click', function (e) {
    var tg = e.target.closest && e.target.closest('.lang-toggle');
    if (tg) { var o = tg.getAttribute('aria-expanded') !== 'true'; closeAll(tg); openMenu(tg, o, o && e.detail === 0); return; }
    var opt = e.target.closest && e.target.closest('[data-set-lang]');
    if (opt) { e.preventDefault(); if (opt.getAttribute('data-set-lang') === lang) closeAll(); else choose(opt.getAttribute('data-set-lang')); return; }
    if (!(e.target.closest && e.target.closest('.lang-switch'))) closeAll();
  });
  document.addEventListener('keydown', function (e) {
    var sw = e.target.closest && e.target.closest('.lang-switch');
    if (!sw) return;
    var btn = sw.querySelector('.lang-toggle'), menu = sw.querySelector('.lang-menu');
    var items = [].slice.call(menu.querySelectorAll('button')), i = items.indexOf(e.target);
    if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); e.stopPropagation(); openMenu(btn, false); btn.focus(); return; }
    if (e.target === btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openMenu(btn, true, true); return; }
    if (i < 0) return;
    var to = e.key === 'ArrowDown' ? (i + 1) % items.length : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length :
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
    if (to >= 0) { e.preventDefault(); items[to].focus(); }
  }, true);
  document.addEventListener('focusout', function (e) {
    var sw = e.target.closest && e.target.closest('.lang-switch');
    if (sw && !(e.relatedTarget && sw.contains(e.relatedTarget))) setTimeout(function () { if (!sw.contains(document.activeElement)) closeAll(); }, 0);
  });

  window.SAAI18n = { lang: lang, dir: RTL[lang] ? 'rtl' : 'ltr', t: t, translate: translate, ui: ui, words: words, splitMode: splitMode, names: LANGS };

  /* the 404 page has no site.js: it marks where the switch goes */
  [].forEach.call(document.querySelectorAll('[data-lang-ui]'), function (el) { el.outerHTML = ui(el.getAttribute('data-lang-ui')); });

  if (!active) return;

  /* ---------- first pass, before any other script runs ---------- */
  var title = look(norm(document.title), 'text', null, 'page title');
  if (title) document.title = title;
  walk(document.body);
  root.classList.remove('i18n-wait');

  /* ---------- then whatever scripts add or change ---------- */
  new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i], tg = r.target;
      if (blocked(tg)) continue;
      if (r.type === 'attributes') { attr(tg, r.attributeName); continue; }
      for (var j = 0; j < r.addedNodes.length; j++) {
        var n = r.addedNodes[j];
        if (n.parentNode !== tg) continue;   /* moved again since */
        if (n.nodeType === 1) { if (!(mine.has(tg) && mine.get(tg) === segKey(tg))) walk(n); }
        else if (n.nodeType === 3) textAdded(tg, n);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS.concat('value') });

  /* ---------- headings with a word wider than the screen ----------
     Split headings animate word by word, so a word never wraps. A long word (Russian above all) can then
     run past a phone screen at display sizes: such a heading is scaled down until its widest word fits. */
  function fit() {
    var changed = false;
    [].forEach.call(document.querySelectorAll('[data-split], .emi-title'), function (el) {
      if (el.dataset.fit) { el.style.fontSize = ''; delete el.dataset.fit; changed = true; }
      var p = el.parentElement, cs = p && getComputedStyle(p);
      var avail = p ? p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0, widest = 0;
      avail = Math.min(avail, document.documentElement.clientWidth - 32);   /* a long word can stretch its own box too */
      if (avail <= 0) return;
      [].forEach.call(el.querySelectorAll('.split-word, .emi-w'), function (w) { widest = Math.max(widest, w.getBoundingClientRect().width); });
      if (widest > avail + 1) {
        el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * avail / widest * .97).toFixed(1) + 'px';
        el.dataset.fit = '1'; changed = true;
      }
    });
    if (changed && window.ScrollTrigger) window.ScrollTrigger.refresh();
  }
  var fitT, fitQ;
  function queueFit() { clearTimeout(fitQ); fitQ = setTimeout(fit, 0); }   /* site.js splits headings as they are set up: fit once each batch is done */
  window.addEventListener('load', function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit); });
  var fitW = innerWidth;   /* phones fire resize as the address bar moves: refit only when the width changes */
  window.addEventListener('resize', function () { if (innerWidth === fitW) return; fitW = innerWidth; clearTimeout(fitT); fitT = setTimeout(fit, 250); });

  if (notes) window.__i18nNotes = function () { return Array.from(notes.values()); };
})();
