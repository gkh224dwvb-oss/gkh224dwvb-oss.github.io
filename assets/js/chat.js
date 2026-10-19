/* =========================================================================
   SAA Assistant — site-wide chatbot (v2)
   Answers from SAA Group's own published information (KB below).
   To switch to a live AI backend, deploy api/chat.js and set chatEndpoint
   in assets/js/config.js (window.SAA_CONFIG.chatEndpoint = '/api/chat').
   Empty = built-in answers. Any backend error falls back to the built-in answers.
   ========================================================================= */
(function () {
  'use strict';
  /* read at send time so config.js can load in any order */
  const endpoint = () => { const c = window.SAA_CONFIG || {}; return typeof c.chatEndpoint === 'string' ? c.chatEndpoint.trim() : ''; };
  const MAX_LEN = 500, HISTORY_SENT = 12, MIN_GAP = 1000, PER_MIN = 20;
  const BASE = document.body.dataset.base || '';
  const EXT = {
    cv: 'careers.html?role=general#applyForm',
    jobs: 'careers.html#jobs',
    emirati: 'careers.html?role=emiratisation#applyForm',
    map: 'https://www.google.com/maps?q=24.4912691,54.3608709'
  };
  const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}<span class="sr-only"> (opens in a new tab)</span></a>`;

  const KB = [
    { id: 'about', k: ['about', 'who are you', 'what is saa', 'company', 'history', 'founded', 'since', 'background', 'overview', 'what do you do', 'tell me'],
      a: `SAA Group was founded in <b>1993</b> by H.E. Saeed Abdulla Rashed Al Shamsi, its Owner and Chairman. Based in Abu Dhabi, it is a UAE Government licensed recruitment agency supplying <b>more than 2,500 employees</b>, mainly to the Oil &amp; Gas sector. <a href="about.html">Read our story</a>.`,
      f: ['Group companies', 'Services', 'Contact details'] },
    { id: 'services', k: ['service', 'services', 'offer', 'provide', 'manpower', 'recruit', 'staffing', 'supply', 'onshore', 'offshore', 'workers', 'labour', 'labor', 'outsourc', 'technician', 'engineer'],
      a: `Our core service is <b>recruitment and manpower supply</b> for onshore and offshore oil and gas fields and facilities. Across the group we also cover:<ul><li>Construction, maintenance and real estate</li><li>Transport</li><li>Safety and environment</li><li>Import and export</li></ul><a href="services.html">See all services</a>.`,
      f: ['How do I hire through SAA?', 'Quality process', 'Group companies'] },
    { id: 'companies', k: ['companies', 'subsidiar', 'establishment', 'contracting', 'maintenance', 'facilities', 'exigency', 'trading', 'real estate', 'property', 'group'],
      a: `The SAA Group has five companies:<ul><li>SAA Technical &amp; Specialized Services LLC</li><li>SAA Contracting &amp; General Maintenance LLC</li><li>SAA Facilities Management LLC</li><li>Exigency General Trading</li><li>Sama SAA Real Estate</li></ul><a href="group.html">Meet the group</a>.`,
      f: ['Services', 'Contact details'] },
    { id: 'hire', k: ['how do i hire', 'client', 'employer', 'need people', 'need staff', 'need workers', 'request', 'quote', 'quotation', 'proposal', 'partner', 'project', 'tender'],
      a: `To hire through SAA, call <b>+971 2 627 0622</b> or email <b>saaest@eim.ae</b> with the roles, numbers and location (onshore or offshore). You can also <a href="adipec.html">book a meeting with us at ADIPEC 2026</a> or use our <a href="contact.html">contact form</a>.`,
      f: ['Meet at ADIPEC', 'Quality process'] },
    { id: 'jobs', k: ['job', 'jobs', 'vacanc', 'vacancy', 'vacancies', 'opening', 'openings', 'career', 'work for', 'work with', 'apply', 'application', 'how to apply', 'position', 'employment', 'cv', 'resume', 'register', 'hiring', 'driver', 'drivers'],
      a: `On our careers page you can <a href="careers.html#jobs">see open positions</a> and <a href="careers.html#apply">apply in two minutes</a>. You can also <a href="${EXT.cv}">send us your CV</a> as a general application. We look for applicants who show integrity, responsiveness and consistency, with the right qualifications and experience.`,
      f: ['Emiratisation', 'Contact details'] },
    { id: 'emirati', k: ['emirati', 'emiratisation', 'emiratization', 'national', 'uae national', 'local talent', 'tawteen'],
      a: `Emiratisation is central to our strategy: <b>national jobs for national talents</b>. UAE Nationals can <a href="${EXT.emirati}">register with us</a> on our careers page and enter the job market.`,
      f: ['Send my CV', 'About SAA'] },
    { id: 'quality', k: ['quality', 'process', 'iso', 'standard', 'qms', 'audit', 'certif', 'compliance', 'accredit', 'licen'],
      a: `Quality drives our growth. Our system covers five areas: <b>Management Responsibility</b>, <b>Resource Management</b>, <b>Support</b>, <b>Analysis &amp; Improvement</b> and <b>Service Realization</b>. We are a UAE Government licensed recruitment agency. For specific certificates, please contact our team. <a href="quality.html">How we work</a>.`,
      f: ['Services', 'Contact details'] },
    { id: 'safety', k: ['safety', 'hse', 'environment', 'health'],
      a: `Safety &amp; Environment is one of the five sectors the SAA Group works in, alongside recruitment and manpower supply. For details on a specific requirement, our team can help on <b>+971 2 627 0622</b>.`,
      f: ['Services', 'Contact details'] },
    { id: 'adipec', k: ['adipec', 'exhibition', 'expo', 'show', 'event', 'stand', 'booth', 'adnec', 'november', 'meet', 'meeting', 'conference'],
      a: `Meet our Acting Manager and Head of Operations, <b>Mohamed El Naggar</b>, and the SAA team at <b>ADIPEC 2026</b>, <b>2–5 November</b> at ADNEC Centre, Abu Dhabi, on <b>stand 16535</b>. <a href="adipec.html#meet">Request a meeting</a>.`,
      f: ['How do I hire through SAA?', 'Contact details'] },
    { id: 'contact', k: ['contact', 'phone', 'call', 'telephone', 'number', 'email', 'mail', 'fax', 'address', 'location', 'where', 'office', 'reach', 'po box', 'map', 'whatsapp'],
      a: `You can reach us at:<ul><li>Tel: <b>+971 2 627 0622</b></li><li>Fax: +971 2 626 8577</li><li>Email: <b>saaest@eim.ae</b></li><li>P.O. Box 27595, Abu Dhabi, UAE</li></ul>${ext(EXT.map, 'Open our location in Maps')}`,
      f: ['Meet at ADIPEC', 'Services'] },
    { id: 'chairman', k: ['chairman', 'owner', 'founder', 'saeed', 'al shamsi'],
      a: `SAA Group was founded in 1993 by <b>H.E. Saeed Abdulla Rashed Al Shamsi</b>, its Owner and Chairman. In his words: “Client satisfaction is at the heart of our decision-making.” <a href="about.html#chairman">Read his message</a>.`,
      f: ['Our leadership', 'About SAA'] },
    { id: 'ceo', k: ['ceo', 'chief executive', 'shamis', 'alshamsi'],
      a: `Our Chief Executive Officer is <b>H.E. Shamis Alshamsi</b>. <a href="about.html#ceo">Read his message</a>.`,
      f: ['Our leadership', 'Meet at ADIPEC'] },
    { id: 'leadership', k: ['leadership', 'leaders', 'management', 'manager', 'boss', 'who runs', 'head of operations', 'operations', 'acting manager', 'mohamed', 'naggar', 'consultant', 'business development', 'iqbal'],
      a: `SAA Group is led by:<ul><li><b>H.E. Saeed Abdulla Rashed Al Shamsi</b>, Founder, Owner and Chairman</li><li><b>H.E. Shamis Alshamsi</b>, Chief Executive Officer</li><li><b>Mr. Mohamed El Naggar</b>, Acting Manager and Head of Operations</li><li><b>Dr. Ahmed Abdullah Al Ali</b>, Group Consultant</li><li><b>Mr. Iqbal Ahmed</b>, Business Development Manager</li></ul>You can meet Mohamed at ADIPEC 2026. <a href="about.html#leadership">Our leadership</a>.`,
      f: ['Meet at ADIPEC', 'About SAA'] },
    { id: 'clients', k: ['clients', 'customers', 'who do you work', 'references', 'sector', 'industries', 'oil', 'gas', 'energy', 'private', 'public', 'government'],
      a: `We have served <b>more than 50 clients</b> across the <b>semi-government, government and private</b> sectors, with a specialism in Oil &amp; Gas. Most of the 2,500+ employees we supply work in the UAE's Oil &amp; Gas sector. See <a href="clients.html">the clients we have served</a>.`,
      f: ['Services', 'How do I hire through SAA?'] },
    { id: 'hello', k: ['hi', 'hello', 'hey', 'salam', 'marhaba', 'good morning', 'good afternoon', 'good evening', 'مرحبا', 'السلام'],
      a: `Marhaba, and welcome to SAA Group. I can help with our services, jobs, Emiratisation, ADIPEC 2026 or how to reach us.`, f: ['Services', 'Find a job', 'Meet at ADIPEC'] },
    { id: 'privacy', k: ['privacy', 'private data', 'personal data', 'my data', 'data', 'cookie', 'cookies', 'gdpr', 'tracking', 'store my', 'save my', 'delete my'],
      a: `Our <a href="privacy.html">privacy policy</a> explains how SAA Group handles personal data and cookies. This chat does not store your messages. You can change your cookie choices at any time in <button type="button" class="chat-link" data-cookie-settings>Cookie settings</button>.`,
      f: ['Terms of use', 'Contact details'] },
    { id: 'terms', k: ['terms', 'terms of use', 'conditions', 'legal', 'disclaimer'],
      a: `Our <a href="terms.html">terms of use</a> set out the rules for using this website. For any question about them, contact our team on <b>+971 2 627 0622</b> or at <b>saaest@eim.ae</b>.`,
      f: ['Privacy policy', 'Contact details'] },
    { id: 'thanks', k: ['thank', 'thanks', 'shukran', 'great', 'perfect', 'شكرا'],
      a: `You're welcome. Is there anything else I can help with?`, f: ['Contact details', 'Meet at ADIPEC'] }
  ];
  const CHIPS = {
    'Services': 'services', 'Group companies': 'companies', 'Contact details': 'contact', 'How do I hire through SAA?': 'hire',
    'Quality process': 'quality', 'Meet at ADIPEC': 'adipec', 'Emiratisation': 'emirati', 'Send my CV': 'jobs', 'Find a job': 'jobs', 'About SAA': 'about', 'Our leadership': 'leadership',
    'Privacy policy': 'privacy', 'Terms of use': 'terms'
  };
  const START = ['Services', 'Find a job', 'Meet at ADIPEC', 'Contact details'];
  const FALLBACK = { a: `I don't have that information yet. Our team can help directly on <b>+971 2 627 0622</b> or at <b>saaest@eim.ae</b>.`, f: ['Services', 'Find a job', 'Contact details'] };

  const norm = s => ' ' + s.toLowerCase().replace(/[^a-z0-9؀-ۿ\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  function match(q) {
    const t = norm(q); let best = null, score = 0;
    for (const e of KB) {
      let s = 0;
      for (const k of e.k) {
        const kk = k.toLowerCase();
        if (kk.length <= 3 ? t.includes(' ' + kk + ' ') : t.includes(kk)) s += kk.includes(' ') ? 3 : kk.length > 5 ? 2 : 1.5;
      }
      if (s > score) { score = s; best = e; }
    }
    return score > 0 ? best : FALLBACK;
  }

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 10h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  document.body.insertAdjacentHTML('beforeend', `
<button type="button" class="chat-fab" id="chatFab" aria-haspopup="dialog" aria-controls="chatPanel" aria-expanded="false" data-cursor-hover>
  <span class="chat-orb">${ICON}</span><span class="txt">Ask SAA <span class="sub">${(window.SAA_CONFIG || {}).chatEndpoint ? 'AI assistant' : 'Quick answers'}</span></span>
</button>
<section class="chat-panel" id="chatPanel" role="dialog" aria-label="SAA Assistant" aria-modal="false" hidden>
  <div class="chat-top"><span class="chat-orb">${ICON}</span><div><b>SAA Assistant</b><span>Online · replies instantly</span></div>
    <button type="button" class="chat-close" id="chatClose" aria-label="Close chat"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
  <div class="chat-log" id="chatLog" aria-live="polite" data-lenis-prevent></div>
  <div class="chat-chips" id="chatChips"></div>
  <form class="chat-form" id="chatForm" autocomplete="off">
    <label for="chatInput" class="sr-only">Your question</label>
    <input id="chatInput" placeholder="Ask about jobs, services, ADIPEC…" maxlength="${MAX_LEN}" enterkeyhint="send">
    <button type="submit" aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
  </form>
  <div class="chat-note">Answers come from SAA Group's own information.</div>
</section>`);

  const fab = document.getElementById('chatFab'), panel = document.getElementById('chatPanel'), log = document.getElementById('chatLog'),
        chips = document.getElementById('chatChips'), form = document.getElementById('chatForm'), input = document.getElementById('chatInput');
  const history = []; let started = false, busy = false, lastSend = 0, sent = [], warned = 0;
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const based = html => (BASE ? html.replace(/href="(?!https?:|mailto:|tel:|#|\/)/g, 'href="' + BASE) : html);
  function add(html, who) { const d = document.createElement('div'); d.className = 'chat-msg ' + who; d.innerHTML = who === 'bot' ? based(html) : html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function setChips(list) {
    chips.innerHTML = '';
    list.forEach(l => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chat-chip'; b.textContent = l; b.onclick = () => ask(l); chips.appendChild(b); });
  }
  async function reply(q) {
    const url = endpoint();
    if (url) {
      const ctl = window.AbortController ? new AbortController() : null, timer = ctl && setTimeout(() => ctl.abort(), 15000);
      try {
        /* only the recent turns go to the server (the API rejects bodies over 16 KB) */
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-HISTORY_SENT) }), signal: ctl ? ctl.signal : undefined });
        if (r.ok) { const j = await r.json(); if (j && typeof j.reply === 'string' && j.reply.trim()) return { a: esc(j.reply).replace(/\n/g, '<br>'), f: START, raw: j.reply }; }
      } catch (_) { /* fall back to built-in answers */ } finally { timer && clearTimeout(timer); }
    }
    const id = CHIPS[q]; const e = id ? KB.find(x => x.id === id) : match(q);
    return { a: e.a, f: e.f, raw: e.a.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '') };
  }
  /* simple client-side throttle: one send per second, at most 20 a minute */
  function gate() {
    const now = Date.now();
    if (now - lastSend < MIN_GAP) return 'fast';
    sent = sent.filter(t => now - t < 60000);
    if (sent.length >= PER_MIN) return 'limit';
    lastSend = now; sent.push(now); return 'ok';
  }
  async function ask(q) {
    q = String(q || '').trim().slice(0, MAX_LEN); if (!q || busy) return false;
    const g = gate();
    if (g === 'fast') return false;
    if (g === 'limit') {
      if (Date.now() - warned > 20000) { warned = Date.now(); add('You have sent a lot of messages in a short time. Please wait a minute before you ask again, or call our team on <b>+971 2 627 0622</b>.', 'bot'); }
      return false;
    }
    busy = true;
    add(esc(q), 'me'); chips.innerHTML = ''; history.push({ role: 'user', content: q });
    const typing = add('<span class="chat-typing"><i></i><i></i><i></i></span>', 'bot'); typing.style.padding = '0';
    const [res] = await Promise.all([reply(q), new Promise(r => setTimeout(r, 700))]);
    typing.remove(); add(res.a, 'bot'); history.push({ role: 'assistant', content: res.raw }); setChips(res.f || START); busy = false;
    return true;
  }
  /* On phones the panel fills the screen, so it becomes a modal dialog: the page behind is inert
     and Tab stays inside. On desktop it floats as a non-modal dialog. */
  const phone = matchMedia('(max-width: 520px)');
  let inerted = [], opener = null;
  function setModal(on) {
    panel.setAttribute('aria-modal', String(on));
    inerted.forEach(n => { n.inert = false; }); inerted = [];
    if (on) { inerted = [...document.querySelectorAll('.skip-link, header, main, footer, .menu-panel')].filter(n => !n.inert && !panel.contains(n)); inerted.forEach(n => { n.inert = true; }); }
  }
  function open() {
    if (!panel.hidden) { input.focus({ preventScroll: true }); return; }
    opener = document.activeElement !== document.body ? document.activeElement : null;
    panel.hidden = false; fab.hidden = true; fab.setAttribute('aria-expanded', 'true');
    setModal(phone.matches);
    if (!started) { started = true; add('Marhaba! I\'m the SAA Assistant. Ask me about our manpower services, jobs and Emiratisation, ADIPEC 2026, or how to reach our team.', 'bot'); setChips(START); }
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  }
  function close() {
    if (panel.hidden) return;
    setModal(false);
    panel.hidden = true; fab.hidden = false; fab.setAttribute('aria-expanded', 'false');
    const back = opener && opener !== fab && document.contains(opener) && !opener.closest('[inert]') ? opener : fab;
    back.focus({ preventScroll: true }); opener = null;
  }
  if (phone.addEventListener) phone.addEventListener('change', () => { if (!panel.hidden) setModal(phone.matches); });
  fab.addEventListener('click', open);
  document.getElementById('chatClose').addEventListener('click', close);
  /* a link in an answer to a section of this same page (e.g. careers.html#jobs on Careers): close the chat so the section shows */
  log.addEventListener('click', e => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const h = a.getAttribute('href'), i = h.indexOf('#'), pg = h.slice(0, i).split('?')[0].replace(/^\//, '');
    if (!pg || pg === (location.pathname.split('/').pop() || 'index.html')) close();
  });
  addEventListener('keydown', e => {
    if (panel.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab' || panel.getAttribute('aria-modal') !== 'true') return;
    const items = [...panel.querySelectorAll('button, input, a[href]')].filter(n => !n.disabled && n.getClientRects().length);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { input.value = ''; return; }
    if (busy) return;
    input.value = '';
    if (!(await ask(v)) && !input.value) input.value = v; /* throttled: give the text back */
  });
  document.addEventListener('click', e => { const t = e.target.closest('[data-open-chat]'); if (t) { e.preventDefault(); open(); } });
  window.SAA_CHAT = { open, ask, KB };
})();
