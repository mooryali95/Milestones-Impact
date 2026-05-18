/* ════════════════════════════════════════════════════════════════════
   ░░  TYPEFORM MODAL — Complete Flow  ░░
   ════════════════════════════════════════════════════════════════════
   منطق الفورم التفاعلي بأسلوب Typeform.
   - 5 أسئلة + شاشة ترحيب + شاشة شكر
   - Validation كاملة
   - اختصارات لوحة المفاتيح (Enter / Escape)
   - إرسال البريد بصورة آمنة (window.open + fallback)
   ════════════════════════════════════════════════════════════════════ */

(function initTypeform() {

  // ──────────────────────────────────────────────
  // ⚙️ CONFIG — قابل للتبديل بين Worker و Mailto
  // ──────────────────────────────────────────────
  const CONFIG = {
    // المنتج (لتمييز الطلب في Worker)
    product: 'MI-LEADERS',

    // طريقة الإرسال:
    // 'worker' = Cloudflare Worker (يحتاج workerUrl)
    // 'mailto' = mailto: link (الوضع الافتراضي حالياً)
    method: 'mailto',

    // عند تفعيل Worker لاحقاً، ضع الـ URL هنا:
    workerUrl: 'https://mi-leaders-api.workers.dev/send',

    // البريد المُستلِم (يُستخدم في mailto مؤقتاً)
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
  const stepOrder = ['welcome', '1', '2', '3', '4', '5', 'thanks'];
  let formData = {};
  let lastMailtoLink = '';

  // ──────────────────────────────────────────────
  // 🔓 PUBLIC API — Open/Close
  // ──────────────────────────────────────────────
  window.openTypeform = function(presetInterest) {
    tfModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    currentStep = 0;
    formData = {};
    if (presetInterest) formData.interest = presetInterest;
    goToStep(0);

    // Apply preset interest if passed
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
    } else {
      // Clear all selections
      document.querySelectorAll('.tf-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.setAttribute('aria-checked', 'false');
      });
    }

    // Clear all inputs
    ['qName', 'qOrg', 'qEmail', 'qPhone', 'qContext'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  };

  window.closeTypeform = function() {
    tfModal.classList.remove('open');
    document.body.style.overflow = '';
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

    // Update progress bar
    const progressSteps = stepOrder.length - 2; // exclude welcome & thanks
    let prog = 0;
    if (stepKey === 'welcome')      prog = 0;
    else if (stepKey === 'thanks')  prog = 100;
    else                            prog = (parseInt(stepKey) / progressSteps) * 100;
    tfProgress.style.width = prog + '%';

    // Counter & footer visibility
    if (stepKey === 'welcome' || stepKey === 'thanks') {
      tfCounter.textContent = '';
      tfFooter.style.display = 'none';
    } else {
      tfCounter.innerHTML = `<strong>${stepKey}</strong> &nbsp;/&nbsp; ${progressSteps}`;
      tfFooter.style.display = 'flex';
    }

    // Previous button visibility
    tfPrev.style.visibility = (idx > 1 && stepKey !== 'thanks') ? 'visible' : 'hidden';

    // Next button label (different on last step)
    if (stepKey === '5') {
      tfNext.innerHTML = '<span>إرسال الرسالة</span><span class="tf-btn-next__enter">Enter ↵</span>';
    } else {
      tfNext.innerHTML = '<span>موافق</span><span class="tf-btn-next__enter">Enter ↵</span>';
    }

    // Focus input
    setTimeout(() => {
      if (target) {
        const input = target.querySelector('input, textarea');
        if (input) input.focus();
      }
    }, 400);

    // Scroll body to top
    const body = document.getElementById('tfBody');
    if (body) body.scrollTop = 0;
  }

  function nextStep() {
    const currentKey = stepOrder[currentStep];
    if (currentKey !== 'welcome' && !validateStep(currentKey)) return;

    if (currentKey === '5') {
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
      const val = document.getElementById('qName').value.trim();
      if (val.length < 2) { showError(stepEl, true); return false; }
      formData.name = val;
    }
    else if (stepKey === '2') {
      const val = document.getElementById('qOrg').value.trim();
      if (val.length < 2) { showError(stepEl, true); return false; }
      formData.organization = val;
    }
    else if (stepKey === '3') {
      const email = document.getElementById('qEmail').value.trim();
      const phone = document.getElementById('qPhone').value.trim();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!validEmail || phone.length < 6) { showError(stepEl, true); return false; }
      formData.email = email;
      formData.phone = phone;
    }
    else if (stepKey === '4') {
      const selected = stepEl.querySelector('.tf-option.selected');
      if (!selected) { showError(stepEl, true); return false; }
      formData.interest = selected.dataset.value;
    }
    else if (stepKey === '5') {
      formData.context = document.getElementById('qContext').value.trim();
    }

    showError(stepEl, false);
    return true;
  }

  // ──────────────────────────────────────────────
  // 🎯 Option Selection (with auto-advance)
  // ──────────────────────────────────────────────
  document.querySelectorAll('.tf-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.tf-option').forEach(o => {
        o.classList.remove('selected');
        o.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('selected');
      opt.setAttribute('aria-checked', 'true');

      // Auto-advance after 400ms
      setTimeout(() => {
        if (stepOrder[currentStep] === '4') nextStep();
      }, 400);
    });
  });

  // ──────────────────────────────────────────────
  // ⌨️ Keyboard Shortcuts
  // ──────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!tfModal.classList.contains('open')) return;

    if (e.key === 'Escape') {
      closeTypeform();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // Allow Enter in textarea (Shift+Enter for new line)
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'TEXTAREA') return;
      e.preventDefault();
      nextStep();
    }
  });

  // ──────────────────────────────────────────────
  // 📧 Email Submission
  // ──────────────────────────────────────────────
  const INTEREST_LABELS = {
    A: 'استشارة قيادية متخصصة',
    B: 'تنفيذ البرنامج مؤسسياً',
    C: 'شراكة استراتيجية'
  };

  function buildPayload() {
    return {
      product: CONFIG.product,
      productName: 'إدارة المشروعات للقادة',
      timestamp: new Date().toISOString(),
      requestId: `${CONFIG.product}-${Date.now()}`,
      data: {
        name: formData.name || '',
        organization: formData.organization || '',
        email: formData.email || '',
        phone: formData.phone || '',
        interest: formData.interest || '',
        interestLabel: INTEREST_LABELS[formData.interest] || '',
        context: formData.context || '',
      },
      meta: {
        source: window.location.href,
        userAgent: navigator.userAgent,
        language: navigator.language,
      }
    };
  }

  function buildMailtoLink() {
    const subject = encodeURIComponent(
      `[${CONFIG.product}] طلب جديد — ${INTEREST_LABELS[formData.interest] || 'تواصل'}`
    );

    const body = encodeURIComponent(
      `السلام عليكم،\n\n` +
      `وردنا طلب جديد عبر برنامج "إدارة المشروعات للقادة":\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `المنتج: ${CONFIG.product}\n` +
      `الاسم: ${formData.name || '—'}\n` +
      `الجهة: ${formData.organization || '—'}\n` +
      `البريد: ${formData.email || '—'}\n` +
      `الجوال: ${formData.phone || '—'}\n` +
      `نوع الطلب: ${INTEREST_LABELS[formData.interest] || '—'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `السياق الإضافي:\n${formData.context || '— لم يُذكر —'}\n\n` +
      `\n— تم الإرسال عبر Milestone Impact`
    );

    return `mailto:${CONFIG.recipientEmail}?subject=${subject}&body=${body}`;
  }

  async function sendViaWorker() {
    try {
      const response = await fetch(CONFIG.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Worker submission failed:', error);
      // Fallback to mailto if Worker fails
      lastMailtoLink = buildMailtoLink();
      window.open(lastMailtoLink, '_blank');
      return null;
    }
  }

  function sendViaMailto() {
    lastMailtoLink = buildMailtoLink();
    setTimeout(() => {
      const mailWin = window.open(lastMailtoLink, '_blank');
      if (!mailWin) {
        const a = document.createElement('a');
        a.href = lastMailtoLink;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }, 300);
  }

  function submitForm() {
    // ALWAYS show thanks screen first (UI feedback)
    currentStep = stepOrder.length - 1;
    goToStep(currentStep);

    // Then trigger the actual send based on CONFIG.method
    if (CONFIG.method === 'worker') {
      sendViaWorker();
    } else {
      sendViaMailto();
    }
  }

  // Re-trigger from Thank You screen
  function resendEmail() {
    if (CONFIG.method === 'worker') {
      sendViaWorker();
    } else if (lastMailtoLink) {
      window.location.href = lastMailtoLink;
    } else {
      sendViaMailto();
    }
  }

  // Initialize: hide footer initially (welcome screen)
  tfFooter.style.display = 'none';
})();
