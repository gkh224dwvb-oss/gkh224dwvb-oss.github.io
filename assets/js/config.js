/* =========================================================================
   SAA GROUP — site configuration (loaded first, in <head>, on every page)
   The site's Content-Security-Policy blocks inline scripts, so set
   everything here rather than in a <script> tag in the HTML.

   For whoever deploys the site:
   - siteUrl       The live address, without a trailing slash.
   - analytics.ga4 Your Google Analytics 4 Measurement ID, e.g. 'G-AB12CD34EF'
                   (GA4 > Admin > Data streams > Web). Leave it '' to run with
                   no analytics. GA only loads after a visitor accepts analytics
                   in the cookie banner (assets/js/consent.js).
   - chatEndpoint  URL of the chatbot function, e.g. '/api/chat' once api/chat.js
                   is deployed with ANTHROPIC_API_KEY. Leave it '' to use the
                   built-in answers in assets/js/chat.js. Before you set it, update
                   'The Ask SAA assistant' in privacy.html: visitors' messages
                   would then leave the browser.
   - forceHttps    Sends visitors from http:// to https:// in the browser, as a
                   backup to the server redirect. Local and private addresses
                   are never redirected. To preview over plain http, use
                   localhost: on a LAN address (192.168.x) the pages' own
                   upgrade-insecure-requests tag asks for https files.
   - recruitApi    Web app URL of the recruitment backend (Google Apps Script, see
                   admin-system/backend/SETUP.md in the project files), ending in /exec.
                   With it, the careers form sends applications and CVs there and the
                   team sees them in /admin/. Leave it '' to keep the email-app form.
   - debug         true logs analytics events to the browser console.
   ========================================================================= */
(function () {
  'use strict';
  var defaults = {
    siteUrl: 'https://www.saagroup.ae',
    chatEndpoint: '',
    recruitApi: '',
    analytics: { ga4: '' },
    forceHttps: true,
    debug: false
  };

  /* Merge with anything already set on the page; never overwrite it. */
  var given = window.SAA_CONFIG || {};
  var cfg = Object.assign({}, defaults, given);
  cfg.analytics = Object.assign({}, defaults.analytics, given.analytics || {});
  /* Older setups used SAA_CONFIG.gaId: treat it as the GA4 ID. */
  if (!cfg.analytics.ga4 && given.gaId) cfg.analytics.ga4 = String(given.gaId);
  window.SAA_CONFIG = cfg;

  /* ---------- Force HTTPS (backup to the server redirect) ---------- */
  function isLocalHost(host) {
    host = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
    if (/\.(local|localhost)$/.test(host)) return true;
    var ip = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (ip) {
      var a = +ip[1], b = +ip[2];
      return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
    }
    if (host.indexOf(':') > -1) return /^(f[cd]|fe[89ab])/.test(host); /* IPv6 unique-local and link-local */
    return false;
  }
  try {
    var loc = window.location;
    if (cfg.forceHttps && loc.protocol === 'http:' && !isLocalHost(loc.hostname)) {
      loc.replace('https://' + loc.hostname + loc.pathname + loc.search + loc.hash);
    }
  } catch (_) { /* never block the page */ }
})();
