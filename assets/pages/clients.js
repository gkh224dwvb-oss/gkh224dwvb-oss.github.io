/* =========================================================================
   SAA GROUP: Clients page (clients.html)
   Keeps a [data-client-count] number in step with assets/data/clients.js. The hero now shows SA's own
   figure ("100+ clients served", 19 Oct 2026) instead, so this only acts if that attribute comes back.
   ========================================================================= */
(function () {
  'use strict';
  const el = document.querySelector('[data-client-count]');
  const list = Array.isArray(window.SAA_CLIENTS) ? window.SAA_CLIENTS.filter(c => c && typeof c.name === 'string' && c.name.trim()) : [];
  if (!el) return;
  if (list.length) el.textContent = String(list.length);
  else el.closest('div').hidden = true;
})();
