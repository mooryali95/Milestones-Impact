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

    // Supabase
    supabaseUrl:    'https://eormhcupwgwpllhrfxxg.supabase.co',
    supabaseKey:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvcm1oY3Vwd2d3cGxsaHJmeHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTY2OTksImV4cCI6MjA4NjM3MjY5OX0.xbZtLH9R9mE3ogfNToojrtzQUK799y5rZrj29ggB1f0',
    table:          'contact_requests',

    // Fallback mailto
    recipientEmail: 'mi@sunkvalue.com',
  };

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
  let submitting = false;
  // true بعد إرسال ناجح (أو قبل أول فتح): الفتح التالي يبدأ نموذجاً فارغاً.
  // false أثناء التعبئة: إغلاق النافذة بالخطأ (Escape أو ✕) لا يمسح ما كُتب.
  let pristine = true;
  let lastFocus = null;

  const SEND_TIMEOUT_MS = 15000;

  // ──────────────────────────────────────────────
  // 🔓 PUBLIC API — Open/Close
  // ──────────────────────────────────────────────
  window.openTypeform = function(presetInterest) {
    lastFocus = document.activeElement;
    tfModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    currentStep = 0;
    formData = {};
    if (presetInterest) formData.interest = presetInterest;
    hideSendError();
    goToStep(0);

    if (presetInterest) {
      setTimeout(() => {
        document.querySelectorAll('.tf-option').forEach(opt => {
          opt.classList.remove('selected');
          opt.setAttribute('aria-checked', 'false');
          if (opt.dataset.value === presetInterest) {
            opt.classList.add('selected');
            opt.setAttribute('aria-checked', 'true');
          }
        });
      }, 50);
    } else if (pristine) {
      document.querySelectorAll('.tf-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.setAttribute('aria-checked', 'false');
      });
    }

    if (!pristine) return;
    ['qName', 'qOrg', 'qEmail', 'qPhone', 'qContext', 'qWebsite'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    pristine = false;
  };

  window.closeTypeform = function() {
    tfModal.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  };

  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.resendEmail = resendEmail;

  // ──────────────────────────────────────────────
  // 🎬 Navigation
  // ──────────────────────────────────────────────
  function goToStep(idx) {
    tfSteps.forEach(s => s.classList.remove('active'));

    const stepKey = stepOrder[idx];
    const target = document.querySelector(`.tf-step[data-step="${stepKey}"]`);
    if (target) target.classList.add('active');

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

    setTimeout(() => {
      if (target) {
        const input = target.querySelector('.tf-input');
        if (input) input.focus();
      }
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
  function showError(stepEl, show) {
    const err = stepEl.querySelector('.tf-step__error');
    if (err) err.classList.toggle('show', show);
  }

  function validateStep(stepKey) {
    const stepEl = document.querySelector(`.tf-step[data-step="${stepKey}"]`);
    if (!stepEl) return true;

    if (stepKey === '1') {
      const name = document.getElementById('qName').value.trim();
      const org = document.getElementById('qOrg').value.trim();
      if (name.length < 2 || org.length < 2) { showError(stepEl, true); return false; }
      formData.name = name;
      formData.organization = org;
    }
    else if (stepKey === '2') {
      const email = document.getElementById('qEmail').value.trim();
      const phone = document.getElementById('qPhone').value.trim();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!validEmail || phone.length < 6) { showError(stepEl, true); return false; }
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
    if (submitting) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'TEXTAREA') return;
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

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type':  'application/json',
          'apikey':        CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
      }
    ).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase error ${res.status}: ${err}`);
    }

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
      `السياق الإضافي:\n${formData.context || '— لم يُذكر —'}\n\n` +
      `— تم الإرسال عبر Milestone Impact`
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

  async function submitForm() {
    if (submitting) return;
    hideSendError();

    // حقل خفي لا يراه الزائر: إن امتلأ فالمُرسِل برنامج آلي — نُظهر الشكر ولا نرسل شيئاً
    const trap = document.getElementById('qWebsite');
    if (trap && trap.value) { finishSubmission(); return; }

    submitting = true;
    setSending(true);
    try {
      await sendToSupabase();
      currentStep = stepOrder.length - 1;
      goToStep(currentStep);

      // إشعار الأدمن (fire & forget)
      fetch(`${CONFIG.supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` },
        body: JSON.stringify({
          action: 'notify',
          name: formData.name || '—', organization: formData.organization || '—',
          emailContact: formData.email || '—', phone: formData.phone || '—',
          interest: formData.interest || '—', interestLabel: (formData.interestLabel || INTEREST_LABELS[formData.interest]) || '—',
          product: CONFIG.product, sourceUrl: window.location.href, submittedAt: new Date().toISOString(),
        }),
      }).catch(() => {});

      // إيميل تأكيد للمتقدم (مع حماية rate limit)
      fetch(`${CONFIG.supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` },
        body: JSON.stringify({
          action: 'confirm',
          name: formData.name || '—',
          email: formData.email || '',
          product: CONFIG.product,
          interest: formData.interest || '—',
          interestLabel: (formData.interestLabel || INTEREST_LABELS[formData.interest]) || '—',
        }),
      }).catch(() => {});

    } catch (err) {
      console.error('Supabase insert failed:', err);
      showSubmitError();
    } finally {
      submitting = false;
      tfNext.disabled = false;
      if (tfNext.innerHTML.includes('جارٍ الإرسال')) tfNext.innerHTML = nextLabel;
    }
    submitting = false;
    setSending(false);
    finishSubmission();

    // إشعار الأدمن (fire & forget)
    fetch(`${CONFIG.supabaseUrl}/functions/v1/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` },
      body: JSON.stringify({
        action: 'notify',
        name: formData.name || '—', organization: formData.organization || '—',
        emailContact: formData.email || '—', phone: formData.phone || '—',
        interest: formData.interest || '—', interestLabel: (formData.interestLabel || INTEREST_LABELS[formData.interest]) || '—',
        product: CONFIG.product, sourceUrl: window.location.href, submittedAt: new Date().toISOString(),
      }),
    }).catch(() => {});

    // إيميل تأكيد للمتقدم (مع حماية rate limit)
    fetch(`${CONFIG.supabaseUrl}/functions/v1/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.supabaseKey, 'Authorization': `Bearer ${CONFIG.supabaseKey}` },
      body: JSON.stringify({
        action: 'confirm',
        name: formData.name || '—',
        email: formData.email || '',
        product: CONFIG.product,
        interest: formData.interest || '—',
        interestLabel: (formData.interestLabel || INTEREST_LABELS[formData.interest]) || '—',
      }),
    }).catch(() => {});
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
