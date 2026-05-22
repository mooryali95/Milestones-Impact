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

/* ──────────────────────────────────────────────
   🎯 SCROLLSPY — Active nav link based on visible section
   ────────────────────────────────────────────── */
(function initScrollspy() {
  const navLinks = document.querySelectorAll('.header__nav-link[href^="#"]');
  if (!navLinks.length) return;

  // Map section id → nav link
  const linkMap = {};
  navLinks.forEach(link => {
    const id = link.getAttribute('href').slice(1);
    if (id) linkMap[id] = link;
  });

  const sections = Object.keys(linkMap)
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (!sections.length) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Clear all active states
          navLinks.forEach(l => l.classList.remove('is-active'));
          // Set active on current
          const link = linkMap[entry.target.id];
          if (link) link.classList.add('is-active');
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
  );

  sections.forEach(s => observer.observe(s));
})();
