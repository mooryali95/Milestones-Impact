/* ════════════════════════════════════════════════════════════════════
   ░░  TYPEFORM MODAL — Complete Flow  ░░
   ════════════════════════════════════════════════════════════════════
   منطق الفورم التفاعلي بأسلوب Typeform.
   - 5 أسئلة + شاشة ترحيب + شاشة شكر
   - Validation كاملة
   - اختصارات لوحة المفاتيح (Enter / Escape)
   - إرسال البيانات إلى Supabase + Fallback mailto
   ════════════════════════════════════════════════════════════════════ */

(function initTypeform() {

  // ──────────────────────────────────────────────
  // ⚙️ CONFIG
  // ──────────────────────────────────────────────
  const CONFIG = {
    product: document.body.dataset.product || 'MI-LEADERS',

    // Supabase: الطلب يمر بإجراء contact في دالة send-otp (تحقق بشري وحدود إغراق على الخادم)
    supabaseUrl:    'https://eormhcupwgwpllhrfxxg.supabase.co',
    supabaseKey:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0',

    // Fallback mailto
    recipientEmail: 'mi@sunkvalue.com',
  };

  // ──────────────────────────────────────────────
  // 📮 قناة طلبات الموقع: نموذج التواصل ومقياس الجاهزية
  // ──────────────────────────────────────────────
  // كل طلب يمر بإجراء contact في send-otp وحده: الإدراج المباشر في contact_requests
  // مغلق أمام المفتاح العام منذ ترحيل 20261105100000. تنجح الدالة أو ترمي خطأ؛
  // وإن طلب الخادم التحقق البشري حمل الخطأ code = 'captcha' ومعه siteKey.
  async function postContact(payload, opts = {}) {
    const ctrl = opts.timeoutMs ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), opts.timeoutMs);
    let res;
    try {
      res = await fetch(
        // منطقة التنفيذ مثبتة على منطقة القاعدة (ap-south-1) كسائر عملاء الدوال (src/lib/api.js fnUrl، ops-3)
        `${CONFIG.supabaseUrl}/functions/v1/send-otp?forceFunctionRegion=ap-south-1`,
        {
          method: 'POST',
          signal: ctrl ? ctrl.signal : undefined,
          headers: {
            'Content-Type':  'application/json',
            'apikey':        CONFIG.supabaseKey,
            'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          },
          body: JSON.stringify({ action: 'contact', ...payload, captcha: opts.captcha || undefined }),
        }
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok && data && data.success) return true;
    // الخادم يطلب التحقق البشري: يُعرض ثم يُعاد الإرسال بالرمز
    if (data && data.code === 'captcha' && data.site_key) {
      const err = new Error('captcha');
      err.code = 'captcha';
      err.siteKey = data.site_key;
      throw err;
    }
    throw new Error(`send-otp ${res.status}: ${(data && data.message) || ''}`);
  }

  // التحقق البشري (Cloudflare Turnstile): لا يُحمَّل شيء من خارج الموقع إلا حين
  // يطلبه الخادم (code: captcha مع site_key).
  let turnstileLoading = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!turnstileLoading) {
      turnstileLoading = new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => ok(window.turnstile);
        s.onerror = () => { turnstileLoading = null; no(new Error('turnstile')); };
        document.head.appendChild(s);
      });
    }
    return turnstileLoading;
  }

  // متاحة قبل فحص النافذة: صفحة المقياس ترسل طلبها من هنا أيضًا (assessment.js)
  window.MIContact = { send: postContact, loadTurnstile };

  // ──────────────────────────────────────────────
  // 🎯 DOM References
  // ──────────────────────────────────────────────
  const tfModal    = document.getElementById('tfModal');
  const tfSteps    = document.querySelectorAll('.tf-step');
  const tfProgress = document.getElementById('tfProgress');
  const tfCounter  = document.getElementById('tfCounter');
  const tfNext     = document.getElementById('tfNext');
  const tfPrev     = document.getElementById('tfPrev');
  const tfFooter   = document.getElementById('tfFooter');

  if (!tfModal) return;

  // ──────────────────────────────────────────────
  // 📊 State
  // ──────────────────────────────────────────────
  let currentStep = 0;
  const stepOrder = ['welcome', '1', '2', '3', 'thanks'];
  let formData = {};
  let lastMailtoLink = '';
  let opener = null;   // العنصر الذي فتح النافذة، يعود إليه التركيز عند الإغلاق

  const FIELD_IDS = ['qName', 'qOrg', 'qEmail', 'qPhone', 'qContext'];

  // رسالة خطأ الخطوة تُعلن لقارئ الشاشة: role=alert، والنص يُدرج لحظة الظهور
  // فيُقرأ كل مرة، والحقول مربوطة بها (aria-describedby)
  tfSteps.forEach((stepEl) => {
    const err = stepEl.querySelector('.tf-step__error');
    if (!err) return;
    err.id = err.id || `tfErr-${stepEl.dataset.step}`;
    err.dataset.msg = err.textContent.trim();
    err.textContent = '';
    err.setAttribute('role', 'alert');
    stepEl.querySelectorAll('input, textarea').forEach((f) => f.setAttribute('aria-describedby', err.id));
  });

  function setOptions(value) {
    document.querySelectorAll('.tf-option').forEach(opt => {
      const on = !!value && opt.dataset.value === value;
      opt.classList.toggle('selected', on);
      opt.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  // تُمسح المدخلات بعد إرسال ناجح فقط، فمن أغلق النافذة خطأً يجد ما كتبه حين يعود
  function resetFields() {
    FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    setOptions(null);
  }

  // ──────────────────────────────────────────────
  // 🔓 PUBLIC API — Open/Close
  // ──────────────────────────────────────────────
  window.openTypeform = function(presetInterest) {
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    tfModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    currentStep = 0;
    formData = {};
    hideSubmitError();
    tfSteps.forEach((s) => showError(s, false));
    if (presetInterest) setOptions(presetInterest);
    goToStep(0);
  };

  window.closeTypeform = function() {
    tfModal.classList.remove('open');
    document.body.style.overflow = '';
    // يعود التركيز إلى ما فتح النافذة إن بقي ظاهرًا قابلًا للتركيز
    if (opener && opener.isConnected && !opener.closest('[inert]') && opener.getClientRects().length) {
      opener.focus({ preventScroll: true });
    }
    opener = null;
  };

  // العناصر القابلة للتركيز الظاهرة في النافذة (الخطوات غير النشطة inert فلا تُعد)
  function focusables() {
    return Array.from(tfModal.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.disabled && !el.closest('[inert]') && el.getClientRects().length
        && getComputedStyle(el).visibility !== 'hidden');
  }

  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.resendEmail = resendEmail;

  // ──────────────────────────────────────────────
  // 🎬 Navigation
  // ──────────────────────────────────────────────
  function goToStep(idx) {
    const stepKey = stepOrder[idx];
    const target = document.querySelector(`.tf-step[data-step="${stepKey}"]`);
    // الخطوات غير النشطة شفافة فقط، فتُجعل inert كي لا يبلغها Tab ولا قارئ الشاشة
    tfSteps.forEach(s => {
      const on = s === target;
      s.classList.toggle('active', on);
      s.inert = !on;
      if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
    });

    const progressSteps = stepOrder.length - 2;
    let prog = 0;
    if (stepKey === 'welcome')      prog = 0;
    else if (stepKey === 'thanks')  prog = 100;
    else                            prog = (parseInt(stepKey) / progressSteps) * 100;
    tfProgress.style.width = prog + '%';

    if (stepKey === 'welcome' || stepKey === 'thanks') {
      tfCounter.textContent = '';
      tfFooter.style.display = 'none';
    } else {
      tfCounter.innerHTML = `<strong>${stepKey}</strong> &nbsp;/&nbsp; ${progressSteps}`;
      tfFooter.style.display = 'flex';
    }

    tfPrev.style.visibility = (idx > 1 && stepKey !== 'thanks') ? 'visible' : 'hidden';

    if (stepKey === '3') {
      tfNext.innerHTML = '<span>إرسال الرسالة</span><span class="tf-btn-next__enter">Enter ↵</span>';
    } else {
      tfNext.innerHTML = '<span>موافق</span><span class="tf-btn-next__enter">Enter ↵</span>';
    }

    // الترحيب والشكر بلا حقول: التركيز على زرهما فورًا، فلا يبقى خلف النافذة
    const input = target && target.querySelector('input, textarea');
    if (target && !input) {
      const btn = target.querySelector('button');
      if (btn) btn.focus({ preventScroll: true });
    }
    setTimeout(() => {
      if (input && tfModal.classList.contains('open') && target.classList.contains('active')
        && !target.contains(document.activeElement)) input.focus();
    }, 400);

    const body = document.getElementById('tfBody');
    if (body) body.scrollTop = 0;
  }

  function nextStep() {
    const currentKey = stepOrder[currentStep];
    if (currentKey !== 'welcome' && !validateStep(currentKey)) return;

    if (currentKey === '3') {
      submitForm();
      return;
    }

    currentStep = Math.min(currentStep + 1, stepOrder.length - 1);
    goToStep(currentStep);
  }

  function prevStep() {
    currentStep = Math.max(currentStep - 1, 0);
    goToStep(currentStep);
  }

  // ──────────────────────────────────────────────
  // ✅ Validation
  // ──────────────────────────────────────────────
  // invalid: معرّفات الحقول المخالفة، فتُوسم aria-invalid ويُنقل التركيز إلى أولها
  function showError(stepEl, show, invalid = []) {
    const err = stepEl.querySelector('.tf-step__error');
    if (err) {
      err.classList.toggle('show', show);
      err.textContent = show ? (err.dataset.msg || '') : '';
    }
    stepEl.querySelectorAll('input').forEach((f) => {
      if (show && invalid.includes(f.id)) f.setAttribute('aria-invalid', 'true');
      else f.removeAttribute('aria-invalid');
    });
    if (show && invalid.length) {
      const first = document.getElementById(invalid[0]);
      if (first) first.focus();
    }
  }

  function validateStep(stepKey) {
    const stepEl = document.querySelector(`.tf-step[data-step="${stepKey}"]`);
    if (!stepEl) return true;

    if (stepKey === '1') {
      const name = document.getElementById('qName').value.trim();
      const org = document.getElementById('qOrg').value.trim();
      const bad = [name.length < 2 && 'qName', org.length < 2 && 'qOrg'].filter(Boolean);
      if (bad.length) { showError(stepEl, true, bad); return false; }
      formData.name = name;
      formData.organization = org;
    }
    else if (stepKey === '2') {
      const email = document.getElementById('qEmail').value.trim();
      const phone = document.getElementById('qPhone').value.trim();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const bad = [!validEmail && 'qEmail', phone.length < 6 && 'qPhone'].filter(Boolean);
      if (bad.length) { showError(stepEl, true, bad); return false; }
      formData.email = email;
      formData.phone = phone;
    }
    else if (stepKey === '3') {
      const selected = stepEl.querySelector('.tf-option.selected');
      if (!selected) { showError(stepEl, true); return false; }
      formData.interest = selected.dataset.value;
      formData.interestLabel = (selected.querySelector('.tf-option__title') || selected).textContent.trim();
      formData.context = (document.getElementById('qContext')?.value || '').trim();
    }


    showError(stepEl, false);
    return true;
  }

  // ──────────────────────────────────────────────
  // 🎯 Option Selection
  // ──────────────────────────────────────────────
  document.querySelectorAll('.tf-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.tf-option').forEach(o => {
        o.classList.remove('selected');
        o.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('selected');
      opt.setAttribute('aria-checked', 'true');

      // الاختيار لا ينقل تلقائيًا: السياق الاختياري في الخطوة نفسها
    });
  });

  // ──────────────────────────────────────────────
  // ⌨️ Keyboard Shortcuts
  // ──────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!tfModal.classList.contains('open')) return;
    if (e.key === 'Escape') { closeTypeform(); return; }
    // Tab يبقى داخل النافذة: من آخر عنصر إلى أولها وبالعكس، ومن خارجها إلى أولها
    if (e.key === 'Tab') {
      const list = focusables();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (i === -1 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
      return;
    }
    // Enter في حقل نصي يتقدم خطوة؛ والأزرار (السابق، الإغلاق، الخيارات) تبقى على سلوكها الأصلي
    if (e.key === 'Enter' && !e.shiftKey) {
      const activeEl = document.activeElement;
      const inField = activeEl && activeEl.tagName === 'INPUT' && tfModal.contains(activeEl);
      const nowhere = !activeEl || activeEl === document.body || activeEl === tfModal;
      if (!inField && !nowhere) return;
      e.preventDefault();
      nextStep();
    }
  });

  // ──────────────────────────────────────────────
  // 🏷️ Interest Labels
  // ──────────────────────────────────────────────
  const INTEREST_LABELS = {
    leaders:     'برنامج إدارة المشروعات للقادة',
    matrix:      'منصة مصفوفة التأثير',
    partnership: 'شراكة استراتيجية',
    general:     'استشارة عامة',
  };

  // ──────────────────────────────────────────────
  // 🗄️ Supabase — إرسال البيانات
  // ──────────────────────────────────────────────
  async function sendToSupabase() {
    const payload = {
      product:        CONFIG.product,
      source_url:     window.location.href,
      name:           formData.name           || '',
      organization:   formData.organization   || '',
      email:          formData.email          || '',
      phone:          formData.phone          || '',
      interest:       formData.interest       || '',
      interest_label: (formData.interestLabel || INTEREST_LABELS[formData.interest]) || '',
      context:        formData.context        || '',
      user_agent:     navigator.userAgent,
      language:       navigator.language,
      status:         'new',
    };

    await postContact(payload, { captcha: formData.captcha });
    formData.captcha = '';
    return true;
  }

  // ──────────────────────────────────────────────
  // 📧 Mailto Fallback
  // ──────────────────────────────────────────────
  function buildMailtoLink() {
    const subject = encodeURIComponent(
      `[${CONFIG.product}] طلب جديد — ${(formData.interestLabel || INTEREST_LABELS[formData.interest]) || 'تواصل'}`
    );
    const body = encodeURIComponent(
      `السلام عليكم،\n\n` +
      `وردنا طلب جديد:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `المنتج: ${CONFIG.product}\n` +
      `الاسم: ${formData.name || '—'}\n` +
      `الجهة: ${formData.organization || '—'}\n` +
      `البريد: ${formData.email || '—'}\n` +
      `الجوال: ${formData.phone || '—'}\n` +
      `نوع الطلب: ${(formData.interestLabel || INTEREST_LABELS[formData.interest]) || '—'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `السياق الإضافي:\n${formData.context || 'لم يُذكر'}\n\n` +
      `أُرسل عبر نموذج التواصل في موقع Milestone Impact`
    );
    return `mailto:${CONFIG.recipientEmail}?subject=${subject}&body=${body}`;
  }

  function triggerMailto() {
    lastMailtoLink = buildMailtoLink();
    window.open(lastMailtoLink, '_blank');
  }

  // ──────────────────────────────────────────────
  // 🚀 Submit — Supabase أولاً، mailto كـ Fallback
  // ──────────────────────────────────────────────
  // لا تظهر شاشة الشكر إلا بعد حفظ الطلب فعلًا؛ وعند الفشل يرى الزائر
  // رسالة واضحة مع إعادة المحاولة أو الإرسال بالبريد، فلا يضيع طلب بصمت.
  let submitting = false;
  async function submitForm() {
    if (submitting) return;
    submitting = true;
    const nextLabel = tfNext.innerHTML;
    tfNext.disabled = true;
    tfNext.innerHTML = '<span>جارٍ الإرسال…</span>';
    hideSubmitError();

    try {
      await sendToSupabase();
      resetFields();
      currentStep = stepOrder.length - 1;
      goToStep(currentStep);

      // تنبيه الإدارة وتأكيد المرسل يرسلهما الخادم من الطلب المحفوظ (إجراء contact)
    } catch (err) {
      if (err && err.code === 'captcha' && err.siteKey) {
        showCaptcha(err.siteKey);
        return;
      }
      console.error('Contact submit failed:', err);
      showSubmitError();
    } finally {
      submitting = false;
      tfNext.disabled = false;
      if (tfNext.innerHTML.includes('جارٍ الإرسال')) tfNext.innerHTML = nextLabel;
    }
  }

  function hideSubmitError() {
    document.querySelectorAll('.tf-submit-error').forEach((el) => el.remove());
  }

  function showSubmitError() {
    const stepEl = document.querySelector('.tf-step.active');
    if (!stepEl) return;
    const box = document.createElement('div');
    box.className = 'tf-submit-error';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<p>تعذّر إرسال طلبكم الآن. بياناتكم محفوظة في النموذج، أعيدوا المحاولة أو أرسلوها بالبريد مباشرة.</p>' +
      '<div class="tf-submit-error__actions">' +
      '<button type="button" class="tf-submit-error__retry">إعادة المحاولة</button>' +
      '<button type="button" class="tf-submit-error__mail">الإرسال بالبريد</button>' +
      '</div>';
    box.querySelector('.tf-submit-error__retry').addEventListener('click', submitForm);
    box.querySelector('.tf-submit-error__mail').addEventListener('click', triggerMailto);
    stepEl.appendChild(box);
  }

  // ──────────────────────────────────────────────
  // 🤖 التحقق البشري (Cloudflare Turnstile)
  // ──────────────────────────────────────────────
  function showCaptcha(siteKey) {
    hideSubmitError();
    const stepEl = document.querySelector('.tf-step.active');
    if (!stepEl) return;
    const box = document.createElement('div');
    box.className = 'tf-submit-error tf-captcha';
    box.setAttribute('role', 'status');
    box.innerHTML = '<p>أكّدوا أنكم لستم برنامجًا آليًا، ويُرسل طلبكم تلقائيًا بعدها.</p><div class="tf-captcha__box"></div>';
    stepEl.appendChild(box);
    loadTurnstile()
      .then((t) => t.render(box.querySelector('.tf-captcha__box'), {
        sitekey: siteKey, language: 'ar',
        callback: (token) => { formData.captcha = token; submitForm(); },
        'error-callback': () => showSubmitError(),
      }))
      .catch(() => showSubmitError());
  }

  function resendEmail() {
    if (lastMailtoLink) {
      window.open(lastMailtoLink, '_blank');
    } else {
      triggerMailto();
    }
  }

  // Initialize
  tfFooter.style.display = 'none';

})();
