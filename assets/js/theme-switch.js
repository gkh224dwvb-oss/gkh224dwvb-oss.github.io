/* 404 page only: the sun/moon switch. Other pages get theirs from site.js.
   Kept in a file because the site's Content-Security-Policy blocks inline scripts. */
/* theme.js holds the state; the scene repaints through the light-mode rules in 404.html */
(function () {
  var btn = document.getElementById('themeToggle'), T = window.SAATheme;
  if (!btn || !T) return;
  function label() { btn.setAttribute('aria-label', T.get() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'); }
  label();
  btn.hidden = false;
  document.addEventListener('saa:theme', label);
  btn.addEventListener('click', function () { T.toggle(); });
})();
