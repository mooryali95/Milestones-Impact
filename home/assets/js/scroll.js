/* ════════════════════════════════════════════════════════════════════
   ░░  SCROLL EFFECTS  ░░
   ════════════════════════════════════════════════════════════════════
   1. Scroll Progress Bar (top of page)
   2. Header background on scroll
   3. Reveal elements on scroll (Intersection Observer + scroll fallback)
   ════════════════════════════════════════════════════════════════════ */

(function initScrollEffects() {
  const scrollBar = document.getElementById('scrollBar');
  const header = document.getElementById('header');

  if (!scrollBar || !header) return;

  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        scrollBar.style.width = scrolled + '%';

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
   🎬 REVEAL ON SCROLL (with scroll fallback)
   ────────────────────────────────────────────── */
(function initRevealOnScroll() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  // IntersectionObserver — الطريقة الأساسية
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

  reveals.forEach(el => observer.observe(el));

  // Scroll fallback — يضمن أن أي عنصر دخل نطاق الرؤية يصير in-view
  let scrollTicking = false;
  const checkPassedElements = () => {
    const viewportBottom = window.scrollY + window.innerHeight;
    document.querySelectorAll('.reveal:not(.in-view)').forEach(el => {
      const rect = el.getBoundingClientRect();
      const elTop = rect.top + window.scrollY;
      if (elTop < viewportBottom - 60) {
        el.classList.add('in-view');
        observer.unobserve(el);
      }
    });
  };

  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(() => {
        checkPassedElements();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });

  // فحص أوّلي عند التحميل (للعناصر المرئية فوراً)
  setTimeout(checkPassedElements, 100);
})();

/* ──────────────────────────────────────────────
   🎯 SCROLLSPY — Active nav link based on visible section
   ────────────────────────────────────────────── */
(function initScrollspy() {
  const navLinks = document.querySelectorAll('.header__nav-link[href^="#"]');
  if (!navLinks.length) return;

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
          navLinks.forEach(l => l.classList.remove('is-active'));
          const link = linkMap[entry.target.id];
          if (link) link.classList.add('is-active');
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
  );

  sections.forEach(s => observer.observe(s));
})();
