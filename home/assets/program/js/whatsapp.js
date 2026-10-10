/* ════════════════════════════════════════════════════════════════════
   ░░  زر واتساب العائم — حجز محادثة مباشرة  ░░
   ════════════════════════════════════════════════════════════════════
   يُضاف بسطر واحد في أي صفحة. الرقم والرسالة في CONFIG أدناه.
   ════════════════════════════════════════════════════════════════════ */

(function initWhatsApp() {
  const CONFIG = {
    phone:   '966532134539',
    message: 'السلام عليكم، أودّ حجز محادثة تعريفية مع فريق Milestone Impact.',
    label:   'تحدّث معنا عبر واتساب',
  };

  if (document.querySelector('.wa-float')) return;

  const style = document.createElement('style');
  style.textContent = `
    .wa-float{position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));left:20px;z-index:900;
      display:flex;align-items:center;gap:10px;height:52px;padding:0 16px 0 14px;border-radius:26px;
      background:#0B272F;color:#EAF0F0;border:1px solid rgba(199,154,75,.55);text-decoration:none;
      font:600 14px/1 "Noto Kufi Arabic",system-ui,sans-serif;box-shadow:0 10px 30px rgba(6,19,24,.28);
      transition:transform .25s ease,background .25s ease}
    .wa-float:hover,.wa-float:focus-visible{background:#12414E;transform:translateY(-2px)}
    .wa-float:focus-visible{outline:2px solid #C79A4B;outline-offset:3px}
    .wa-float svg{width:24px;height:24px;flex:none;fill:#C79A4B}
    .wa-float__text{white-space:nowrap}
    @media (max-width:640px){.wa-float{width:52px;padding:0;justify-content:center}.wa-float__text{display:none}}
    @media print{.wa-float{display:none}}
  `;
  document.head.appendChild(style);

  const a = document.createElement('a');
  a.className = 'wa-float';
  a.href = `https://wa.me/${CONFIG.phone}?text=${encodeURIComponent(CONFIG.message)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', CONFIG.label);
  a.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>' +
    `<span class="wa-float__text">${CONFIG.label}</span>`;
  document.body.appendChild(a);
})();
