/* ════════════════════════════════════════════════════════════════════
   ░░  SCROLL EFFECTS  ░░
   ════════════════════════════════════════════════════════════════════
   1. Scroll Progress Bar (top of page)
   2. Header background on scroll
   3. Reveal elements on scroll (Intersection Observer)
   ════════════════════════════════════════════════════════════════════ */

(function initScrollEffects() {
  const scrollBar = document.getElementById('scrollBar');
  const header = document.getElementById('header');

  if (!scrollBar || !header) return;

  let ticking = false;

  // Optimized scroll handler with requestAnimationFrame
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        // Update progress bar
        const scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        scrollBar.style.width = scrolled + '%';

        // Toggle header style
        if (window.scrollY > 50) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }

        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

/* ──────────────────────────────────────────────
   🎬 REVEAL ON SCROLL
   ────────────────────────────────────────────── */
(function initRevealOnScroll() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();
