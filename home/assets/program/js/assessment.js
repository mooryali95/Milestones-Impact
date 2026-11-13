/* ════════════════════════════════════════════════════════════════════
   ░░  مقياس جاهزية الأثر — Impact Readiness Assessment  ░░
   ════════════════════════════════════════════════════════════════════
   - ١٥ عبارة: ثلاث لكل حلقة من حلقات سلسلة النتائج الخمس
   - نتيجة فورية: درجة كلية، وقراءة أولية، ومخطط للحلقات
   - العبارات والسلّم والحساب في assessment-core.js (يُحمَّل قبل هذا الملف، وله اختبار وحدة)
   - التقرير التفصيلي مقابل الاسم والجهة والبريد، يُرسل طلبًا عبر قناة الموقع
     الموحدة (window.MIContact في typeform.js: إجراء contact في send-otp)
   - طباعة التقرير أو حفظه PDF من المتصفح
   ════════════════════════════════════════════════════════════════════ */

(function initAssessment() {

  const CONFIG = {
    product:        'MI-ASSESSMENT',
    recipientEmail: 'mi@sunkvalue.com',
    timeoutMs:      15000,
  };

  // المحتوى والحساب من assessment-core.js
  const CORE = window.MIAssessmentCore;
  if (!CORE) { console.error('[Assessment] assessment-core.js not loaded'); return; }
  const { LINKS, SCALE, QUESTIONS, TOTAL } = CORE;

  // ──────────────────────────────────────────────
  // DOM
  // ──────────────────────────────────────────────
  const root = document.getElementById('assessment');
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const screens = {
    intro:  $('[data-screen="intro"]'),
    quiz:   $('[data-screen="quiz"]'),
    result: $('[data-screen="result"]'),
  };
  const qNum      = $('#asQNum');
  const qLink     = $('#asQLink');
  const qText     = $('#asQText');
  const qOptions  = $('#asOptions');
  const qBar      = $('#asBar');
  const qCounter  = $('#asCounter');
  const btnPrev   = $('#asPrev');
  const gateForm  = $('#asGate');
  const gateError = $('#asGateError');
  const gateBtn   = $('#asGateBtn');
  const report    = $('#asReport');

  const GATE_LABEL  = 'اعرض التقرير الكامل';
  const RETRY_LABEL = 'إعادة المحاولة';

  let answers = new Array(TOTAL).fill(null);
  let current = 0;
  let result = null;
  let sending = false;
  let saveFailed = false;   // تعذّر الإرسال: التقرير معروض والبوابة باقية برسالتها وإعادة المحاولة
  let captchaToken = '';

  // ──────────────────────────────────────────────
  // التنقل بين الشاشات
  // ──────────────────────────────────────────────
  function show(name) {
    Object.entries(screens).forEach(([k, el]) => { el.hidden = k !== name; });
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#asStart').addEventListener('click', () => { current = 0; renderQuestion(); show('quiz'); });
  btnPrev.addEventListener('click', () => { if (current > 0) { current--; renderQuestion(); } });
  $('#asRestart').addEventListener('click', () => {
    answers = new Array(TOTAL).fill(null);
    result = null;
    saveFailed = false;
    removeCaptcha();
    gateError.hidden = true;
    gateBtn.textContent = GATE_LABEL;
    report.hidden = true;
    gateForm.hidden = false;
    show('intro');
  });

  // ──────────────────────────────────────────────
  // عرض السؤال
  // ──────────────────────────────────────────────
  function renderQuestion() {
    const q = QUESTIONS[current];
    const link = LINKS[q.li];
    qNum.textContent = String(current + 1).padStart(2, '0');
    qLink.textContent = `الحلقة ${q.li + 1} من 5 · ${link.name}`;
    qText.textContent = q.text;
    qCounter.textContent = `${current + 1} / ${TOTAL}`;
    qBar.style.width = `${(current / TOTAL) * 100}%`;
    btnPrev.disabled = current === 0;

    qOptions.innerHTML = '';
    SCALE.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'as-option' + (answers[current] === s.v ? ' is-selected' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', answers[current] === s.v ? 'true' : 'false');
      b.innerHTML = `<span class="as-option__key">${i + 1}</span><span class="as-option__label">${s.label}</span>`;
      b.addEventListener('click', () => choose(s.v));
      qOptions.appendChild(b);
    });

    const first = qOptions.querySelector('.is-selected') || qOptions.firstChild;
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
  }

  function choose(v) {
    answers[current] = v;
    renderQuestion();
    setTimeout(() => {
      if (current < TOTAL - 1) { current++; renderQuestion(); }
      else finish();
    }, 220);
  }

  // اختصارات لوحة المفاتيح: ١ إلى ٤ للاختيار
  document.addEventListener('keydown', (e) => {
    if (screens.quiz.hidden) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= SCALE.length) { e.preventDefault(); choose(SCALE[n - 1].v); }
  });

  // ──────────────────────────────────────────────
  // النتيجة (الحساب في CORE.scoreReadiness)
  // ──────────────────────────────────────────────
  function finish() {
    qBar.style.width = '100%';
    result = CORE.scoreReadiness(answers);
    $('#asScore').textContent = result.total;
    $('#asLevel').textContent = result.level.name;
    $('#asLevelDesc').textContent = result.level.desc;
    $('#asWeakLabel').textContent = result.focus.label;
    $('#asWeakest').textContent = result.focus.names;
    $('#asChart').innerHTML = chartHTML(result.perLink);
    show('result');
  }

  // ──────────────────────────────────────────────
  // المخطط: عمود أفقي لكل حلقة
  // ──────────────────────────────────────────────
  function chartHTML(perLink) {
    return '<ul class="as-bars" aria-label="نتيجة كل حلقة من حلقات سلسلة النتائج">' + perLink.map(l => `
      <li class="as-bars__row${result.focus.links.includes(l) ? ' is-weak' : ''}">
        <span class="as-bars__name">${l.name}</span>
        <span class="as-bars__track"><span class="as-bars__fill" style="width:${Math.max(2, l.pct)}%"></span></span>
        <span class="as-bars__pct">${l.pct}%</span>
      </li>`).join('') + '</ul>';
  }

  // ──────────────────────────────────────────────
  // بوابة التقرير التفصيلي
  // ──────────────────────────────────────────────
  // التقرير لا يُحجب بعطل عندنا: إن تعذّر الإرسال عُرض التقرير، وبقيت البوابة فوقه
  // برسالة ظاهرة وإعادة محاولة وبديل البريد، فلا يضيع الطلب بصمت.
  gateForm.addEventListener('submit', (e) => { e.preventDefault(); submitGate(); });

  function readGate() {
    return {
      name:         gateForm.elements.name.value.trim().slice(0, 120),
      organization: gateForm.elements.organization.value.trim().slice(0, 160),
      email:        gateForm.elements.email.value.trim().slice(0, 160),
      phone:        gateForm.elements.phone.value.trim().slice(0, 30),
      website:      gateForm.elements.website.value,   // حقل مخفي لاصطياد الروبوتات
    };
  }

  async function submitGate() {
    if (sending || !result) return;
    const data = readGate();

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email);
    if (data.name.length < 2 || data.organization.length < 2 || !validEmail) {
      gateError.textContent = 'يُرجى إدخال الاسم والجهة وبريد إلكتروني صحيح.';
      gateError.hidden = false;
      return;
    }
    gateError.hidden = true;

    // روبوت: نعرض التقرير دون حفظ شيء
    if (data.website) { revealReport(data); return; }

    sending = true;
    gateBtn.disabled = true;
    gateBtn.textContent = 'جارٍ إعداد التقرير…';
    removeCaptcha();
    const captcha = captchaToken;
    captchaToken = '';   // رمز التحقق صالح لمرة واحدة

    try {
      await saveLead(data, captcha);
      saveFailed = false;
      revealReport(data);
    } catch (err) {
      if (err && err.code === 'captcha' && err.siteKey) {
        showCaptcha(err.siteKey, data);
      } else {
        console.warn('[Assessment] Save failed:', err);
        showSaveError(data);
      }
    } finally {
      sending = false;
      gateBtn.disabled = false;
      gateBtn.textContent = saveFailed ? RETRY_LABEL : GATE_LABEL;
    }
  }

  function showSaveError(data) {
    saveFailed = true;
    gateError.innerHTML = 'تعذّر إرسال بياناتكم إلينا الآن، والتقرير معروض أدناه. أعيدوا المحاولة، أو أرسلوا النتيجة إلينا عبر <a href="' + mailtoLink(data) + '">البريد</a>.';
    gateError.hidden = false;
    gateBtn.textContent = RETRY_LABEL;
    revealReport(data, { keepGate: true });
  }

  // التحقق البشري داخل البوابة، ويُعاد الإرسال تلقائيًا بعده
  function showCaptcha(siteKey, data) {
    removeCaptcha();
    const box = document.createElement('div');
    box.className = 'as-captcha';
    box.setAttribute('role', 'status');
    box.innerHTML = '<p class="as-card__text">أكّدوا أنكم لستم برنامجًا آليًا، ويُعرض التقرير تلقائيًا بعدها.</p><div class="as-captcha__box"></div>';
    gateBtn.before(box);
    const fail = () => { removeCaptcha(); showSaveError(data); };
    if (!window.MIContact) { fail(); return; }
    window.MIContact.loadTurnstile()
      .then((t) => t.render(box.querySelector('.as-captcha__box'), {
        sitekey: siteKey, language: 'ar',
        callback: (token) => { captchaToken = token; submitGate(); },
        'error-callback': fail,
      }))
      .catch(fail);
  }

  function removeCaptcha() {
    root.querySelectorAll('.as-captcha').forEach((el) => el.remove());
  }

  function summaryText() {
    return `الدرجة الكلية: ${result.total}% (قراءة أولية: ${result.level.name})\n` +
      result.perLink.map(l => `${l.name}: ${l.pct}%`).join('\n') +
      `\n${result.focus.label} ${result.focus.names}`.trimEnd();
  }

  // الخادم يطوي الأسطر في سطر واحد، فالملخص في الطلب مفصول بفواصل منقوطة ليُقرأ في اللوحة
  async function saveLead(data, captcha) {
    if (!window.MIContact) throw new Error('MIContact unavailable');
    await window.MIContact.send({
      product:        CONFIG.product,
      source_url:     window.location.href,
      name:           data.name,
      organization:   data.organization,
      email:          data.email,
      phone:          data.phone,
      interest:       'assessment',
      interest_label: 'مقياس جاهزية الأثر',
      context:        summaryText().split('\n').join('؛ ') + '؛ الإجابات: ' + answers.join(','),
      user_agent:     navigator.userAgent,
      language:       navigator.language,
    }, { captcha, timeoutMs: CONFIG.timeoutMs });
  }

  function mailtoLink(data) {
    const subject = `[${CONFIG.product}] نتيجة مقياس جاهزية الأثر | ${data.organization}`;
    const body = `الاسم: ${data.name}\nالجهة: ${data.organization}\nالبريد: ${data.email}\nالجوال: ${data.phone || '—'}\n\n${summaryText()}`;
    return `mailto:${CONFIG.recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // ──────────────────────────────────────────────
  // التقرير التفصيلي
  // ──────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function revealReport(data, opts = {}) {
    const date = new Date().toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
    const priorities = [...result.perLink].sort((a, b) => a.pct - b.pct);

    $('#asReportMeta').innerHTML =
      `<span>أُعدّ لـ <strong>${esc(data.organization)}</strong></span><span>${esc(data.name)}</span><span>${date}</span>`;

    $('#asReportLinks').innerHTML = priorities.map((l, i) => `
      <li class="as-rlink${result.focus.links.includes(l) || (i === 0 && result.focus.kind !== 'even') ? ' is-first' : ''}">
        <div class="as-rlink__head">
          <span class="as-rlink__rank">${String(i + 1).padStart(2, '0')}</span>
          <span class="as-rlink__name">${l.name} <em>${l.en}</em></span>
          <span class="as-rlink__pct">${l.pct}%</span>
        </div>
        <p class="as-rlink__advice">${l.advice}</p>
      </li>`).join('');

    report.hidden = false;
    // عند تعذّر الإرسال تبقى البوابة ظاهرة برسالتها فوق التقرير، ولا يُمرَّر بعيدًا عنها
    if (opts.keepGate) return;
    gateForm.hidden = true;
    report.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#asPrint').addEventListener('click', () => window.print());
})();
