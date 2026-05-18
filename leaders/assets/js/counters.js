/* ════════════════════════════════════════════════════════════════════
   ░░  NUMBER COUNTERS  ░░
   ════════════════════════════════════════════════════════════════════
   عدّادات الأرقام في قسم الإحصائيات.
   - أرقام إنجليزية مع فواصل الآلاف (1,000)
   - تنشيط عند ظهور القسم في الشاشة (Intersection Observer)
   - حركة easing سلسة
   ════════════════════════════════════════════════════════════════════ */

(function initCounters() {
  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      // Cubic ease-out for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // English numerals with comma separators (1,000)
      el.textContent = Math.floor(target * eased).toLocaleString('en-US');

      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const countObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  document.querySelectorAll('[data-count]').forEach(el => countObserver.observe(el));
})();
