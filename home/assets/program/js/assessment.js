/* ════════════════════════════════════════════════════════════════════
   ░░  مقياس جاهزية الأثر — Impact Readiness Assessment  ░░
   ════════════════════════════════════════════════════════════════════
   - ١٢ سؤالاً موزعة على حلقات سلسلة الأثر الخمس
   - نتيجة فورية: درجة كلية، ومستوى نضج، ومخطط للحلقات
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

  // ──────────────────────────────────────────────
  // سلسلة الأثر: الحلقات والأسئلة والتوصيات
  // ──────────────────────────────────────────────
  const LINKS = [
    {
      key: 'inputs', name: 'المدخلات', en: 'Inputs',
      questions: [
        'لكل مبادرة تكليفٌ موثّق يحدّد مالكها وغايتها والموارد المرصودة لها.',
        'تُربط الميزانيات والموارد بأهداف أثرٍ محدّدة، لا بالبنود التشغيلية وحدها.',
      ],
      advice: 'ابدؤوا بوثيقة تكليف موحّدة لكل مبادرة تسمّي المالك والغاية والموارد، واربطوا كل بند في الميزانية بنتيجة يُراد تحقيقها.',
    },
    {
      key: 'activities', name: 'الأنشطة', en: 'Activities',
      questions: [
        'تُدار المشروعات وفق منهجية معتمدة بمراحل ونقاط قرار واضحة.',
        'تُرصد المخاطر والانحرافات دوريًا وتُصعَّد عبر مسار حوكمة معلوم.',
      ],
      advice: 'اعتمدوا دورة حياة موحّدة للمشروع ببوابات قرار، وسجلًّا للمخاطر يُراجع في اجتماع دوري بصلاحيات تصعيد واضحة.',
    },
    {
      key: 'outputs', name: 'المخرجات', en: 'Outputs',
      questions: [
        'تُعرَّف مخرجات كل مشروع بمعايير قبول قابلة للتحقق قبل البدء.',
        'تُسلَّم المخرجات وتُوثَّق بمحاضر استلام رسمية.',
      ],
      advice: 'حدّدوا لكل مخرج معيار قبول مكتوبًا قبل التنفيذ، ولا تُغلق مرحلة إلا بمحضر استلام موقّع من صاحب القرار.',
    },
    {
      key: 'outcomes', name: 'النتائج', en: 'Outcomes',
      questions: [
        'تتوفر مؤشرات نتائج تقيس التغيّر لدى المستفيد، لا حجم النشاط.',
        'تُجمع بيانات خط الأساس قبل التدخل للمقارنة بها.',
        'تُراجَع النتائج دوريًا على مستوى القيادة لاتخاذ قرارات تصحيحية.',
      ],
      advice: 'انقلوا القياس من عدّ الأنشطة إلى رصد التغيّر: خط أساس قبل التدخل، ومؤشر نتيجة لكل هدف، ومراجعة قيادية ربع سنوية.',
    },
    {
      key: 'impact', name: 'الأثر', en: 'Impact',
      questions: [
        'يُقاس الأثر بعد انتهاء المشروع بمدة كافية لإثبات استدامته.',
        'يُعبَّر عن الأثر بقيمة اقتصادية أو اجتماعية تُعرض على الممولين وأصحاب القرار.',
        'تُغذّي دروس الأثر قرارات المحفظة والتخطيط للدورة التالية.',
      ],
      advice: 'صمّموا قياسًا لاحقًا بعد الإغلاق، وترجموا الأثر إلى قيمة مالية واجتماعية معلنة، واجعلوا خلاصاته مدخلًا إلزاميًا لتخطيط المحفظة.',
    },
  ];

  const SCALE = [
    { v: 0, label: 'غير قائم' },
    { v: 1, label: 'في بداياته' },
    { v: 2, label: 'قائم جزئيًا' },
    { v: 3, label: 'راسخ ومُقاس' },
  ];

  const LEVELS = [
    { min: 0,  name: 'مرحلة النية',          desc: 'النوايا حاضرة، لكن الأثر لا يزال رهين الاجتهاد الفردي. الأولوية لبناء الأساس: تكليف واضح ومنهجية معتمدة.' },
    { min: 40, name: 'مرحلة التأسيس',        desc: 'ثمة ممارسات قائمة، لكنها غير منتظمة. الأولوية لتوحيد المنهجية وربط المخرجات بنتائج قابلة للقياس.' },
    { min: 60, name: 'مرحلة الانضباط',       desc: 'التنفيذ منضبط والمخرجات موثّقة. الخطوة التالية إثبات النتائج وترجمة الأثر إلى قيمة معلنة.' },
    { min: 80, name: 'مرحلة الأثر المؤسسي', desc: 'الأثر يُقاس ويُدار ويُغذّي القرار. الأولوية لصون هذا المستوى وتعميمه على المحفظة كاملة.' },
  ];

  // تسطيح الأسئلة مع ربط كل سؤال بحلقته
  const QUESTIONS = [];
  LINKS.forEach((link, li) => link.questions.forEach(text => QUESTIONS.push({ text, li })));
  const TOTAL = QUESTIONS.length;

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
  // الحساب
  // ──────────────────────────────────────────────
  function compute() {
    const max = SCALE[SCALE.length - 1].v;
    const perLink = LINKS.map((link, li) => {
      const vals = QUESTIONS.map((q, i) => (q.li === li ? answers[i] : null)).filter(v => v !== null);
      const pct = Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * max)) * 100);
      return { name: link.name, en: link.en, advice: link.advice, pct };
    });
    const total = Math.round((answers.reduce((a, b) => a + b, 0) / (TOTAL * max)) * 100);
    const level = [...LEVELS].reverse().find(l => total >= l.min);
    const sorted = [...perLink].sort((a, b) => a.pct - b.pct);
    return { total, level, perLink, weakest: sorted[0], strongest: sorted[sorted.length - 1] };
  }

  function finish() {
    qBar.style.width = '100%';
    result = compute();
    $('#asScore').textContent = result.total;
    $('#asLevel').textContent = result.level.name;
    $('#asLevelDesc').textContent = result.level.desc;
    $('#asWeakest').textContent = result.weakest.name;
    $('#asChart').innerHTML = chartHTML(result.perLink);
    show('result');
  }

  // ──────────────────────────────────────────────
  // المخطط: عمود أفقي لكل حلقة
  // ──────────────────────────────────────────────
  function chartHTML(perLink) {
    return '<ul class="as-bars" aria-label="نتيجة كل حلقة من حلقات سلسلة النتائج">' + perLink.map(l => `
      <li class="as-bars__row${l === result.weakest ? ' is-weak' : ''}">
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
    return `الدرجة الكلية: ${result.total}% (${result.level.name})\n` +
      result.perLink.map(l => `${l.name}: ${l.pct}%`).join('\n') +
      `\nالحلقة الأضعف: ${result.weakest.name}`;
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
      <li class="as-rlink${i === 0 ? ' is-first' : ''}">
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
