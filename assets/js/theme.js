/* =========================================================================
   SAA GROUP — dark / light mode
   Loaded in <head> without defer, before the stylesheets, so the right
   colours are on <html data-theme> before the first paint (no flash).
   Dark is the default. The visitor's choice is remembered in localStorage.
   Other scripts use window.SAATheme: get(), set('light'|'dark'), toggle();
   every change fires a 'saa:theme' event on document ({ detail: { theme } }).
   ========================================================================= */
(function () {
  'use strict';
  var KEY = 'saa-theme', root = document.documentElement;
  var COLORS = { dark: '#04101F', light: '#F6F9FA' };   /* browser bar colour, matches --bg */
  function stored() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; }
  }
  function paintBar(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', COLORS[t]);
  }
  function apply(t) {
    root.setAttribute('data-theme', t);
    paintBar(t);
  }
  var theme = stored() || 'dark';
  apply(theme);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paintBar(theme); });

  function set(t, save) {
    if ((t !== 'light' && t !== 'dark') || t === theme) return;
    theme = t;
    if (save !== false) { try { localStorage.setItem(KEY, t); } catch (e) {} }
    apply(t);
    var ev;
    try { ev = new CustomEvent('saa:theme', { detail: { theme: t } }); } catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('saa:theme', false, false, { theme: t }); }
    document.dispatchEvent(ev);
  }
  window.SAATheme = {
    get: function () { return theme; },
    set: set,
    toggle: function () { set(theme === 'light' ? 'dark' : 'light'); }
  };
  /* another tab changed the mode: follow it */
  window.addEventListener('storage', function (e) { if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) set(e.newValue, false); });
})();
