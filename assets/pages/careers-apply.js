/* =========================================================================
   CAREERS · open positions and the application form
   1. Job list: built from window.SAA_JOBS (assets/data/jobs.js), with
      category filter chips when there are two or more categories
   2. "Apply now" (any [data-apply-role]): picks the role in the form,
      scrolls to it, focuses the first field. ?role= in the URL picks it too
      (General application and Emiratisation registration replace the old
      saaest.com CV and Emiratisation forms)
   3. Application form -> mailto to saaest@eim.ae (same checks as the
      contact form: linked errors, honeypot, 3 s time trap, 3 sends per
      10 minutes, control characters stripped)
   FORM SERVICE: to post to a form service later, replace openMail(href) in
   the submit handler with a fetch() POST of `data` and keep these checks.
   ========================================================================= */
(function () {
  'use strict';

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EMAIL = 'saaest@eim.ae';
  const GENERAL = 'General application';
  const EMIRATI = 'Emiratisation registration (UAE Nationals)';   /* also an <option> in careers.html */
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    return m && +m[2] >= 1 && +m[2] <= 12 ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '';
  };
  const ARROW = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------------------------------------------------------------
     1. JOB LIST
     --------------------------------------------------------------------- */
  const raw = Array.isArray(window.SAA_JOBS) ? window.SAA_JOBS : [];
  const jobs = raw.filter(j => j && j.open !== false && String(j.title || '').trim()).map((j, i) => ({
    id: String(j.id || 'job-' + (i + 1)).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    title: String(j.title).trim(),
    category: String(j.category || '').trim(),
    positions: Math.max(0, parseInt(j.positions, 10) || 0),
    location: String(j.location || '').trim() || 'To be confirmed',
    type: String(j.type || '').trim() || 'To be confirmed',
    posted: String(j.posted || '').trim(),
    summary: String(j.summary || '').trim(),
    requirements: Array.isArray(j.requirements) ? j.requirements.map(r => String(r).trim()).filter(Boolean) : [],
    example: j.example === true
  }));

  const list = $('jobsList'), countText = $('jobsCountText'), filter = $('jobsFilter');
  const empty = $('jobsEmpty'), general = $('jobsGeneral');
  const roles = n => n + (n === 1 ? ' open role' : ' open roles');

  function card(j) {
    const tid = 'job-' + j.id + '-t';
    const date = fmtDate(j.posted);
    const meta = [
      ['Positions', j.positions ? String(j.positions) : 'To be confirmed'],
      ['Location', j.location],
      ['Type', j.type]
    ];
    return '<li class="job" data-cat="' + esc(j.category) + '">' +
      '<div class="job-card' + (j.example ? ' is-example' : '') + '">' +
        '<div class="job-main">' +
          '<p class="job-top">' + (j.category ? '<span class="job-cat mono">' + esc(j.category) + '</span>' : '') +
            (j.example ? '<span class="placeholder job-ex">Example listing</span>' : '') + '</p>' +
          '<h3 class="job-title" id="' + tid + '">' + esc(j.title) + '</h3>' +
          (j.summary ? '<p class="job-sum">' + esc(j.summary) + '</p>' : '') +
          (j.requirements.length ? '<div class="job-req"><p class="job-req-t mono">Requirements</p><ul>' + j.requirements.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div>' : '') +
        '</div>' +
        '<dl class="job-meta">' +
          meta.map(m => '<div><dt>' + m[0] + '</dt><dd>' + esc(m[1]) + '</dd></div>').join('') +
          (date ? '<div><dt>Posted</dt><dd><time datetime="' + esc(j.posted) + '">' + date + '</time></dd></div>' : '') +
        '</dl>' +
        '<div class="job-act"><button class="btn job-apply" type="button" data-apply-role="' + esc(j.title) + '">Apply now<span class="sr-only"> for ' + esc(j.title) + (j.example ? ' (example listing)' : '') + '</span> ' + ARROW + '</button></div>' +
      '</div></li>';
  }

  let activeCat = '';
  function showCount() {
    if (!countText) return;
    const n = activeCat ? jobs.filter(j => j.category === activeCat).length : jobs.length;
    countText.textContent = roles(n) + (activeCat ? ' in ' + activeCat : '');
  }

  if (list) {
    list.innerHTML = jobs.map(card).join('');
    if (!jobs.length) {
      if (empty) empty.hidden = false;
      if (countText) countText.textContent = 'No open roles right now';
    } else {
      if (general) general.hidden = false;
      showCount();
      const cats = [...new Set(jobs.map(j => j.category).filter(Boolean))];
      if (filter && cats.length >= 2) {
        const chip = (val, label, n, on) => '<button type="button" class="jf-chip" data-cat="' + esc(val) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + ' <span class="jf-n">' + n + '</span></button>';
        filter.innerHTML = chip('', 'All', jobs.length, true) + cats.map(c => chip(c, c, jobs.filter(j => j.category === c).length, false)).join('');
        filter.hidden = false;
        filter.addEventListener('click', e => {
          const b = e.target.closest('.jf-chip');
          if (!b) return;
          activeCat = b.dataset.cat || '';
          filter.querySelectorAll('.jf-chip').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
          list.querySelectorAll('.job').forEach(li => { li.hidden = !!activeCat && li.dataset.cat !== activeCat; });
          showCount();
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        });
      }
    }
  }

  /* ---------------------------------------------------------------------
     2. ROLE PICKER + "Apply now"
     --------------------------------------------------------------------- */
  const form = $('applyForm');
  const fRole = $('aRole');
  if (fRole) {
    const gen = fRole.querySelector('option[value="' + GENERAL + '"]');
    jobs.forEach(j => {
      if ([...fRole.options].some(o => o.value === j.title)) return;
      const o = document.createElement('option');
      o.value = j.title; o.textContent = j.title + (j.example ? ' (example listing)' : '');
      fRole.insertBefore(o, gen || null);
    });
    /* links from other pages pick the role: careers.html?role=general|emiratisation|<job id>#apply */
    const want = (new URLSearchParams(location.search).get('role') || '').toLowerCase();
    const pre = want === 'general' ? GENERAL : want === 'emiratisation' ? EMIRATI : (jobs.find(j => j.id === want) || {}).title;
    if (pre && [...fRole.options].some(o => o.value === pre)) fRole.value = pre;
  }

  let lenis = null;
  if (window.SAA) window.SAA.ready(c => { lenis = c.lenis || null; });

  function goApply(role) {
    if (!form || !fRole) return;
    if (role && [...fRole.options].some(o => o.value === role)) {
      fRole.value = role;
      fRole.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const target = form;
    const first = $('aName');
    /* absolute target from the live layout, so it is right even if the page was scrolled outside Lenis */
    if (lenis && !REDUCE) lenis.scrollTo(Math.max(0, target.getBoundingClientRect().top + window.scrollY - 110), { duration: 1.1, force: true });
    else target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    if (first) first.focus({ preventScroll: true });
    const picked = $('apPicked');
    if (picked) picked.textContent = role ? 'Role selected: ' + role + '.' : '';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-apply-role]');
    if (!b) return;
    e.preventDefault();
    goApply(b.getAttribute('data-apply-role'));
  });

  /* ---------------------------------------------------------------------
     3. APPLICATION FORM -> mailto
     --------------------------------------------------------------------- */
  if (!form) return;
  const GUARD = {
    MIN_MS: 3000, MAX_SENDS: 3, WINDOW_MS: 10 * 60 * 1000, KEY: 'saa-form-sends',
    line: v => String(v || '').replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim(),
    text: v => String(v || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g, '').trim(),
    sends() {
      try {
        const a = JSON.parse(sessionStorage.getItem(GUARD.KEY) || '[]'), t = Date.now();
        return Array.isArray(a) ? a.filter(x => typeof x === 'number' && t - x < GUARD.WINDOW_MS) : [];
      } catch (_) { return []; }
    },
    limited: () => GUARD.sends().length >= GUARD.MAX_SENDS,
    record() { try { const a = GUARD.sends(); a.push(Date.now()); sessionStorage.setItem(GUARD.KEY, JSON.stringify(a)); } catch (_) { /* storage blocked */ } }
  };
  const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
  const phoneOk = v => /^\+?[0-9 ()./-]{6,30}$/.test(v) && (v.match(/\d/g) || []).length >= 7 && (v.match(/\d/g) || []).length <= 15;
  const openMail = href => { window.location.href = href; };

  const fName = $('aName'), fEmail = $('aEmail'), fPhone = $('aPhone'), fNat = $('aNat'), fLoc = $('aLoc');
  const fExp = $('aExp'), fMsg = $('aMsg'), fConsent = $('aConsent'), trap = $('aWebsite');
  const out = $('apMsg');
  const readyAt = performance.now();
  let tried = false;

  /* a quiet announcement when "Apply now" picks a role */
  const picked = document.createElement('p');
  picked.id = 'apPicked'; picked.className = 'sr-only'; picked.setAttribute('aria-live', 'polite');
  form.prepend(picked);

  function setErr(el, text) {
    const e = $(el.id + 'Err'); if (e) e.textContent = text || '';
    if (text) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  }
  function validate() {
    const bad = [];
    const chk = (ok, el, text) => { setErr(el, ok ? '' : text); if (!ok) bad.push(el); };
    const nv = GUARD.line(fName.value), ev = GUARD.line(fEmail.value), pv = GUARD.line(fPhone.value);
    const tv = GUARD.line(fNat.value), lv = GUARD.line(fLoc.value), mv = GUARD.text(fMsg.value);
    chk(!!fRole.value, fRole, 'Please choose a role, or choose General application.');
    chk(nv.length >= 2 && nv.length <= 100, fName, nv.length > 100 ? 'Please shorten your name to 100 characters.' : 'Please enter your full name.');
    chk(EMAIL_RE.test(ev) && ev.length <= 254, fEmail, ev ? 'Please check your email address, for example name@example.com.' : 'Please enter your email address.');
    chk(phoneOk(pv), fPhone, pv ? 'Please check your phone number. Use digits, spaces and an optional + at the start.' : 'Please enter a phone or WhatsApp number.');
    chk(tv.length >= 2 && tv.length <= 60, fNat, 'Please enter your nationality.');
    chk(lv.length >= 2 && lv.length <= 80, fLoc, 'Please enter your current city and country.');
    chk(!!fExp.value, fExp, 'Please choose your years of experience.');
    chk(mv.length <= 1500, fMsg, 'Please keep your message under 1,500 characters.');
    chk(fConsent.checked, fConsent, 'Please tick this box so we can use your details for recruitment.');
    return bad;
  }
  const clearOut = () => { out.textContent = ''; out.className = 'form-msg ap-msg'; };
  const recheck = () => { if (!tried) return; const bad = validate(); if (!bad.length && out.classList.contains('err')) clearOut(); };
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  const say = text => { out.className = 'form-msg ap-msg err'; out.textContent = text; };
  const ICON_OK = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function thanks(name) {
    out.className = 'form-msg ap-msg ok';
    out.innerHTML = '';
    const ic = document.createElement('span'); ic.className = 'ok-ic'; ic.innerHTML = ICON_OK;
    const txt = document.createElement('span');
    const b = document.createElement('b'); b.textContent = name;
    const a = document.createElement('a'); a.href = 'mailto:' + EMAIL; a.textContent = EMAIL;
    const cv = document.createElement('strong'); cv.textContent = 'Attach your CV (PDF) to that email before you press send.';
    if (name) txt.append('Thank you, ', b, '. '); else txt.append('Thank you. ');
    txt.append('Your email app should now open with your application to ', a, '. ', cv,
      ' If nothing opens, email your CV to ' + EMAIL + ' with the role in the subject, or call +971 2 627 0622.');
    out.append(ic, txt);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      role: GUARD.line(fRole.value), name: GUARD.line(fName.value), email: GUARD.line(fEmail.value), phone: GUARD.line(fPhone.value),
      nationality: GUARD.line(fNat.value), location: GUARD.line(fLoc.value), experience: GUARD.line(fExp.value), message: GUARD.text(fMsg.value)
    };

    /* honeypot: a bot filled the hidden field, so look successful and send nothing */
    if (trap && trap.value) { thanks(data.name); return; }

    tried = true;
    const bad = validate();
    if (bad.length) {
      say(bad.length === 1 ? 'Please check the highlighted field.' : 'Please check the ' + bad.length + ' highlighted fields.');
      bad[0].focus();
      return;
    }
    if (performance.now() - readyAt < GUARD.MIN_MS) { say('That was quick. Please wait a moment, then press Send application again.'); return; }
    if (GUARD.limited()) { say('You have sent several messages in the last few minutes. Please wait a little, or email your CV to ' + EMAIL + ' directly.'); return; }

    const lines = [
      'Job application',
      '',
      'Role: ' + data.role,
      'Full name: ' + data.name,
      'Email: ' + data.email,
      'Phone / WhatsApp: ' + data.phone,
      'Nationality: ' + data.nationality,
      'Current location: ' + data.location,
      'Years of experience: ' + data.experience
    ];
    if (data.message) lines.push('', 'Message:', data.message);
    lines.push('', 'CV: attached as a PDF.', '',
      'I agree that SAA Group may use my details for recruitment, as described in its privacy policy.',
      'Sent from the careers page of the SAA Group website.');
    const subject = GUARD.line('Job application: ' + data.role + ' · ' + data.name);
    const href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));

    GUARD.record();
    thanks(data.name);
    form.dispatchEvent(new CustomEvent('saa:form-sent', { bubbles: true, detail: { form: 'applyForm' } }));
    openMail(href);
  });

  /* ---------------------------------------------------------------------
     Modest reveal for the job rows (the static parts use data-reveal)
     --------------------------------------------------------------------- */
  if (window.SAA && list) window.SAA.ready(({ gsap, ScrollTrigger, reduce }) => {
    if (reduce || !gsap || !ScrollTrigger) return;
    const rows = list.querySelectorAll('.job');
    if (!rows.length) return;
    gsap.from(rows, { y: 36, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, clearProps: 'opacity,transform',
      scrollTrigger: { trigger: list, start: 'top 88%', once: true } });
  });
})();
