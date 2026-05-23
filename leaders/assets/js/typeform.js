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
    product: 'MI-LEADERS',

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
      document.querySelectorAll('.tf-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.setAttribute('aria-checked', 'false');
      });
    }

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

    if (stepKey === '5') {
      tfNext.innerHTML = '<span>إرسال الرسالة</span><span class="tf-btn-next__enter">Enter ↵</span>';
    } else {
      tfNext.innerHTML = '<span>موافق</span><span class="tf-btn-next__enter">Enter ↵</span>';
    }

    setTimeout(() => {
      if (target) {
        const input = target.querySelector('input, textarea');
        if (input) input.focus();
      }
    }, 400);

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
    if (e.key === 'Escape') { closeTypeform(); return; }
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
      interest_label: INTEREST_LABELS[formData.interest] || '',
      context:        formData.context        || '',
      user_agent:     navigator.userAgent,
      language:       navigator.language,
      status:         'new',
    };

    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
      }
    );

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
      `[${CONFIG.product}] طلب جديد — ${INTEREST_LABELS[formData.interest] || 'تواصل'}`
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
      `نوع الطلب: ${INTEREST_LABELS[formData.interest] || '—'}\n` +
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
  async function submitForm() {
    currentStep = stepOrder.length - 1;
    goToStep(currentStep);

    try {
      await sendToSupabase();
      // إرسال إشعار للأدمن بالبريد
      fetch(`${CONFIG.supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`,
        },
        body: JSON.stringify({
          action: 'notify',
          name: formData.name || '—',
          organization: formData.organization || '—',
          emailContact: formData.email || '—',
          phone: formData.phone || '—',
          interest: formData.interest || '—',
          interestLabel: INTEREST_LABELS[formData.interest] || '—',
          product: CONFIG.product,
          sourceUrl: window.location.href,
          submittedAt: new Date().toISOString(),
        }),
      }).catch(e => console.warn('notify failed:', e));
    } catch (err) {
      console.error('Supabase insert failed:', err);
    }
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
