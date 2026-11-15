/* ════════════════════════════════════════════════════════════════════
   ░░  المساعد الآلي في الموقع (agent-chat)  ░░
   ════════════════════════════════════════════════════════════════════
   زر عائم ولوحة محادثة: لا يظهر إلا إن قالت الدالة إنه مفعّل (status)، ويتحقق Turnstile مرة عند البدء،
   ويبث الرد (SSE)، وزر «تحدث مع الفريق» ظاهر دائمًا، ونموذج تحويل يكتب طلب تواصل مربوطًا بالمحادثة.
   يقرأ عنوان الدالة ومفتاحها من typeform.js (window.MIContact) فلا يتكرر المفتاح. كل نص يُعرض نصًا لا HTML،
   والروابط وحدها تُبنى عناصر، ولمواقع المنظومة وحدها. نموذج «تواصل معنا» يبقى مسارًا احتياطيًا. */
(function initAgentChat() {
  'use strict';
  const C = window.MIContact;
  if (!C || !C.fnUrl || document.querySelector('.mi-chat-launch')) return;

  const STORE = 'mi-agent-v1';
  const STATUS = 'mi-agent-status-v1';
  const STATUS_TTL = 10 * 60 * 1000;
  const MAX_CHARS = 1500;
  const HOSTS = ['mi.sunkvalue.com', 'leaders.sunkvalue.com', 'matrix.sunkvalue.com'];
  const page = document.body.dataset.product || 'MI-HOME';
  const lang0 = (document.documentElement.lang || 'ar').startsWith('en') ? 'en' : 'ar';

  const T = {
    launch: 'اسأل Milestone Impact',
    title: 'المساعد الآلي',
    sub: 'Milestone Impact',
    notice: 'مساعد آلي يجيب من معلوماتنا المعتمدة، وقد يطلع فريقنا على المحادثة. تُحفظ المحادثة 90 يومًا، وما حولته إلى الفريق يُحفظ مع طلبك. ',
    privacy: 'سياسة الخصوصية',
    placeholder: 'اكتب سؤالك هنا',
    send: 'إرسال',
    team: 'تحدث مع الفريق',
    close: 'إغلاق المحادثة',
    verifying: 'لحظة، نتحقق أنك لست برنامجًا آليًا.',
    failed: 'تعذّر بدء المحادثة. راسلنا على mi@sunkvalue.com أو استخدم نموذج «تواصل معنا».',
    rate: 'محادثات كثيرة الآن. حاول بعد قليل أو راسلنا بالبريد.',
    unavailable: 'المساعد غير متاح الآن. اترك رسالتك للفريق.',
    expired: 'انتهت هذه المحادثة. ابدأ محادثة جديدة.',
    tooLong: `الرسالة أطول من ${MAX_CHARS} حرف.`,
    handoffTitle: 'اترك رسالتك للفريق',
    handoffLead: 'نحتاج اسمك وبريدك، والجهة ورقم التواصل إن شئت. يصل طلبك إلى الفريق مع هذه المحادثة.',
    noteRequired: 'رسالتك',
    badNote: 'اكتب رسالتك للفريق.',
    name: 'الاسم', email: 'البريد الإلكتروني', org: 'الجهة (اختياري)', phone: 'رقم التواصل (اختياري)', note: 'رسالتك (اختياري)',
    submit: 'أرسل إلى الفريق', back: 'رجوع إلى المحادثة',
    badName: 'اكتب اسمك.', badEmail: 'البريد الإلكتروني غير صحيح.',
    sent: 'وصل طلبك إلى الفريق.',
    sentEn: 'Your request has reached our team.',
    newChat: 'محادثة جديدة',
  };

  // ── الحالة في الجلسة (هذا التبويب وحده) ──
  const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
  const save = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* تصفح خاص */ } };
  let state = load(STORE) || { token: null, log: [], handedOff: false };
  const persist = () => save(STORE, { token: state.token, log: state.log.slice(-60), handedOff: state.handedOff });

  async function call(body) {
    const res = await fetch(C.fnUrl('agent-chat'), { method: 'POST', headers: C.fnHeaders(), body: JSON.stringify(body) });
    return res;
  }

  // ── البناء ──
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const kid of kids) if (kid) n.append(kid);
    return n;
  };

  // نص بروابط: المواقع المعتمدة وحدها تصير روابط، وما سواها يبقى نصًا
  function richText(node, text) {
    node.textContent = '';
    const re = /https?:\/\/[^\s<>()"'،]+/g;
    let last = 0; let m;
    while ((m = re.exec(text))) {
      const url = m[0].replace(/[.,;:!?]+$/, '');
      let host = '';
      try { host = new URL(url).host; } catch { /* ليس رابطًا */ }
      node.append(document.createTextNode(text.slice(last, m.index)));
      if (HOSTS.includes(host)) node.append(el('a', { href: url, target: '_blank', rel: 'noopener', dir: 'ltr', text: url }));
      else node.append(document.createTextNode(url));
      last = m.index + url.length;
    }
    node.append(document.createTextNode(text.slice(last)));
  }

  const launch = el('button', { class: 'mi-chat-launch', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', hidden: '' },
    el('span', { class: 'mi-chat-launch__dot', 'aria-hidden': 'true' }), el('span', { text: T.launch }));
  const log = el('div', { class: 'mi-chat__log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const input = el('textarea', { class: 'mi-chat__input', rows: '1', maxlength: String(MAX_CHARS), placeholder: T.placeholder, 'aria-label': T.placeholder, dir: 'auto' });
  const sendBtn = el('button', { class: 'mi-chat__send', type: 'submit', text: T.send });
  const form = el('form', { class: 'mi-chat__form' }, input, sendBtn);
  const teamBtn = el('button', { class: 'mi-chat__chip', type: 'button', text: T.team, onclick: () => showHandoff('request') });
  const actions = el('div', { class: 'mi-chat__actions' }, teamBtn);
  const captcha = el('div', { class: 'mi-chat__captcha' });
  const closeBtn = el('button', { class: 'mi-chat__close', type: 'button', 'aria-label': T.close, text: '✕', onclick: () => toggle(false) });
  const titleId = 'mi-chat-title';
  const panel = el('section', { class: 'mi-chat', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId, hidden: '', dir: 'rtl' },
    el('header', { class: 'mi-chat__head' },
      el('div', {}, el('h2', { class: 'mi-chat__title', id: titleId, text: T.title }), el('p', { class: 'mi-chat__sub', text: T.sub })),
      closeBtn),
    el('p', { class: 'mi-chat__notice' }, document.createTextNode(T.notice), el('a', { href: '/privacy.html', text: T.privacy })),
    log, captcha, actions, form);

  // ── نموذج التحويل ──
  const f = {};
  const field = (key, label, type = 'text', extra = {}) => {
    f[key] = el(type === 'textarea' ? 'textarea' : 'input', { name: key, ...(type !== 'textarea' ? { type } : { rows: '2' }), dir: 'auto', ...extra });
    return el('label', {}, el('span', { text: label }), f[key]);
  };
  const hErr = el('p', { class: 'mi-chat__err', role: 'alert' });
  const hSubmit = el('button', { class: 'mi-chat__chip mi-chat__chip--solid', type: 'submit', text: T.submit });
  const hForm = el('form', { class: 'mi-chat__handoff', hidden: '', novalidate: '' },
    el('h3', { text: T.handoffTitle }), el('p', { text: T.handoffLead }),
    field('name', T.name, 'text', { autocomplete: 'name', required: '' }),
    field('email', T.email, 'email', { autocomplete: 'email', required: '', dir: 'ltr' }),
    field('organization', T.org, 'text', { autocomplete: 'organization' }),
    field('phone', T.phone, 'tel', { autocomplete: 'tel', dir: 'ltr' }),
    field('note', T.note, 'textarea'),
    hErr,
    el('div', { class: 'mi-chat__actions', style: 'padding:0' },
      hSubmit,
      el('button', { class: 'mi-chat__chip', type: 'button', text: T.back, onclick: () => hideHandoff() })));
  const noteLabel = f.note.previousElementSibling;
  // بلا رسالة من الزائر في المحادثة تصير «رسالتك» مطلوبة: لا يصل الفريق طلب فارغ
  const noteNeeded = () => !state.log.some((x) => x.who === 'me');
  panel.insertBefore(hForm, form);
  let handoffReason = 'request';

  function addMsg(who, text, opts = {}) {
    const m = el('div', { class: `mi-chat__msg mi-chat__msg--${who}`, dir: 'auto' });
    richText(m, text);
    log.append(m);
    log.scrollTop = log.scrollHeight;
    if (!opts.transient) { state.log.push({ who, text }); persist(); }
    return m;
  }
  function typing() {
    const m = el('div', { class: 'mi-chat__msg mi-chat__msg--bot', 'aria-label': '...' }, el('span', { class: 'mi-chat__typing', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')));
    log.append(m); log.scrollTop = log.scrollHeight;
    return m;
  }
  function setBusy(b) { sendBtn.disabled = b; }

  function showHandoff(reason) {
    handoffReason = reason;
    hForm.hidden = false; form.hidden = true; actions.hidden = true;
    hErr.textContent = '';
    const need = noteNeeded();
    noteLabel.textContent = need ? T.noteRequired : T.note;
    if (need) f.note.setAttribute('required', ''); else f.note.removeAttribute('required');
    log.scrollTop = log.scrollHeight;
    f.name.focus({ preventScroll: true });
  }
  function hideHandoff() {
    hForm.hidden = true; form.hidden = state.handedOff; actions.hidden = state.handedOff;
    input.focus();
  }

  // ── البدء: Turnstile مرة، ثم start ──
  let starting = null;
  function ensureStarted() {
    if (state.token) return Promise.resolve(true);
    if (starting) return starting;
    starting = (async () => {
      const st = load(STATUS);
      const siteKey = st && st.site_key;
      const note = addMsg('note', T.verifying, { transient: true });
      let t = null; let wid = null; let timer = null;
      // يُزال الودجت في كل نهاية (نجاح أو فشل)، فإعادة المحاولة ترسم في حاوية نظيفة
      const clearCaptcha = () => {
        clearTimeout(timer);
        try { if (t && wid !== null && wid !== undefined) t.remove(wid); } catch { /* أُزيل */ }
        wid = null; captcha.textContent = '';
      };
      try {
        t = await C.loadTurnstile();
        const token = await new Promise((ok, no) => {
          const fail = () => no(new Error('captcha'));
          // التحقق لا ينتظر إلى الأبد: مهلة كلية، ومهلة التحدي وانتهاء الرمز قبل استعماله فشل
          timer = setTimeout(fail, 60_000);
          wid = t.render(captcha, { sitekey: siteKey, appearance: 'interaction-only', callback: ok, 'error-callback': fail, 'timeout-callback': fail, 'expired-callback': fail, language: 'ar' });
        });
        clearCaptcha();
        const res = await call({ action: 'start', captcha: token, page, source_url: location.href, locale: lang0 });
        const j = await res.json().catch(() => ({}));
        note.remove();
        if (!j.success) {
          addMsg('note', j.code === 'rate' ? T.rate : (j.code === 'agent_unavailable' || j.code === 'agent_off') ? T.unavailable : T.failed, { transient: true });
          if (j.code === 'agent_unavailable' || j.code === 'agent_off') showHandoffFallback();
          return false;
        }
        state.token = j.token; persist();
        addMsg('bot', j.greeting);
        // السقف اليومي بلغ قبل البدء: يُقال السبب قبل نموذج «اترك رسالتك»
        if (j.capped) { if (j.capped_text) addMsg('bot', j.capped_text); showHandoff('capped'); }
        return true;
      } catch {
        clearCaptcha();
        note.remove();
        addMsg('note', T.failed, { transient: true });
        return false;
      } finally { starting = null; }
    })();
    return starting;
  }
  // بلا محادثة (المساعد غير متاح): «اترك رسالتك» عبر نموذج الموقع القائم
  function showHandoffFallback() {
    actions.textContent = '';
    actions.append(el('button', { class: 'mi-chat__chip mi-chat__chip--solid', type: 'button', text: T.team, onclick: () => { toggle(false); if (window.openTypeform) window.openTypeform(); } }));
  }

  // ── الإرسال والبث ──
  async function sendMessage(text) {
    if (!(await ensureStarted())) return;
    addMsg('me', text);
    setBusy(true);
    const dots = typing();
    // فقاعة البث مخفية عن قارئ الشاشة (تتغير مع كل دفعة)، ويُعلن الرد مرة واحدة كاملًا عند done
    let bubble = null; let streamed = ''; let ended = false;
    try {
      const res = await call({ action: 'send', token: state.token, message: text });
      const type = res.headers.get('content-type') || '';
      if (!type.includes('text/event-stream')) {
        const j = await res.json().catch(() => ({}));
        dots.remove();
        if (j.code === 'expired') { resetChat(); addMsg('note', T.expired, { transient: true }); return; }
        if (j.code === 'too_long') { addMsg('note', T.tooLong, { transient: true }); return; }
        if (j.text) addMsg('bot', j.text);
        if (j.handoff || j.code === 'conv_cap') showHandoff(j.code === 'conv_cap' ? 'conv_cap' : 'agent');
        if (j.code === 'agent_unavailable') { addMsg('note', T.unavailable, { transient: true }); showHandoffFallback(); }
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (block.match(/^event: (.+)$/m) || [])[1];
          let data = {};
          try { data = JSON.parse((block.match(/^data: (.+)$/m) || [])[1] || '{}'); } catch { /* سطر ناقص */ }
          if (ev === 'delta') {
            if (!bubble) { dots.remove(); bubble = el('div', { class: 'mi-chat__msg mi-chat__msg--bot', dir: 'auto', 'aria-hidden': 'true' }); log.append(bubble); }
            streamed += data.t || '';
            bubble.textContent = streamed;
            log.scrollTop = log.scrollHeight;
          } else if (ev === 'done') {
            ended = true; dots.remove();
            if (bubble) bubble.remove();
            addMsg('bot', data.text || '');
            if (data.handoff) showHandoff('agent');
          } else if (ev === 'capped') {
            ended = true; dots.remove();
            addMsg('bot', data.text || '');
            showHandoff('capped');
          } else if (ev === 'error') {
            ended = true; dots.remove(); if (bubble) bubble.remove();
            addMsg('note', data.text || T.failed, { transient: true });
          }
        }
      }
      // انتهى الاتصال بلا حدث ختامي (انقطاع أو مهلة): لا تبقى النافذة في الانتظار
      if (!ended) { dots.remove(); if (bubble) bubble.remove(); addMsg('note', T.failed, { transient: true }); }
    } catch {
      dots.remove();
      addMsg('note', T.failed, { transient: true });
    } finally { setBusy(false); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    if (text.length > MAX_CHARS) { addMsg('note', T.tooLong, { transient: true }); return; }
    input.value = ''; autosize();
    sendMessage(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  const autosize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; };
  input.addEventListener('input', autosize);

  // طلب تحويل واحد في كل مرة: النقر المزدوج لا يرسل طلبين ولا يضيف تأكيدين
  let handingOff = false;
  hForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (handingOff || state.handedOff) return;
    hErr.textContent = '';
    const v = (k) => f[k].value.trim();
    if (v('name').length < 2) { hErr.textContent = T.badName; f.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) { hErr.textContent = T.badEmail; f.email.focus(); return; }
    if (noteNeeded() && !v('note')) { hErr.textContent = T.badNote; f.note.focus(); return; }
    handingOff = true; hSubmit.disabled = true;
    let j = {};
    try {
      if (!(await ensureStarted())) return;
      const res = await call({ action: 'handoff', token: state.token, name: v('name'), email: v('email'), organization: v('organization'), phone: v('phone'), note: v('note'), reason: handoffReason });
      j = await res.json().catch(() => ({}));
    } catch { j = {}; } finally { handingOff = false; hSubmit.disabled = false; }
    if (!j.success && j.code !== 'already') { hErr.textContent = j.field === 'email' ? T.badEmail : j.field === 'name' ? T.badName : j.field === 'note' ? T.badNote : T.failed; return; }
    if (state.handedOff) return;
    state.handedOff = true; persist();
    hForm.hidden = true; form.hidden = true;
    // التأكيد بلغة الخادم (لغة آخر رسالة للزائر) فلا يختلط العربي بالإنجليزي في فقاعة واحدة
    const sent = j.sent || (j.lang === 'en' ? T.sentEn : T.sent);
    addMsg('bot', `${sent} ${j.promise || ''}`.trim());
    actions.hidden = false; actions.textContent = '';
    actions.append(el('button', { class: 'mi-chat__chip', type: 'button', text: T.newChat, onclick: () => { resetChat(); } }));
  });

  function resetChat() {
    state = { token: null, log: [], handedOff: false }; persist();
    log.textContent = ''; form.hidden = false; hForm.hidden = true;
    actions.hidden = false; actions.textContent = ''; actions.append(teamBtn);
  }

  // ── الفتح والإغلاق ──
  function toggle(open) {
    panel.hidden = !open;
    launch.setAttribute('aria-expanded', String(open));
    launch.hidden = open && window.matchMedia('(max-width: 520px)').matches;
    if (open) {
      if (state.handedOff) { form.hidden = true; }
      if (!state.token && !state.log.length) ensureStarted();
      setTimeout(() => (state.handedOff ? closeBtn : input).focus(), 0);
    } else { launch.hidden = false; launch.focus(); }
  }
  launch.addEventListener('click', () => toggle(panel.hidden));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  for (const m of state.log) addMsg(m.who, m.text, { transient: true });
  if (state.handedOff) { form.hidden = true; actions.textContent = ''; actions.append(el('button', { class: 'mi-chat__chip', type: 'button', text: T.newChat, onclick: () => resetChat() })); }
  document.body.append(launch, panel);

  // ── الظهور: الزر لا يظهر إلا إن كان المساعد مفعّلًا (مخزن عشر دقائق في الجلسة) ──
  (async () => {
    let st = load(STATUS);
    if (!st || Date.now() - st.at > STATUS_TTL) {
      try {
        const j = await (await call({ action: 'status' })).json();
        st = { at: Date.now(), enabled: !!j.enabled, site_key: j.site_key || null };
      } catch { st = { at: Date.now(), enabled: false, site_key: null }; }
      save(STATUS, st);
    }
    if (st.enabled) launch.hidden = false;
  })();
})();
