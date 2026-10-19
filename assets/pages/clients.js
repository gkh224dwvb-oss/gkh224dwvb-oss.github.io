/* =========================================================================
   SAA GROUP: Clients page (clients.html)
   Keeps the "Clients listed" number in the hero in step with assets/data/clients.js.
   ========================================================================= */
(function () {
  'use strict';
  const el = document.querySelector('[data-client-count]');
  const list = Array.isArray(window.SAA_CLIENTS) ? window.SAA_CLIENTS.filter(c => c && typeof c.name === 'string' && c.name.trim()) : [];
  if (!el) return;
  if (list.length) el.textContent = String(list.length);
  else el.closest('div').hidden = true;
})();
