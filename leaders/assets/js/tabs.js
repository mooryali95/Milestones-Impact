// ══ Auto-generated from shared/js — edit the source there, not this copy. ══
/* ════════════════════════════════════════════════════════════════════
   ░░  TRACK TABS  ░░
   ════════════════════════════════════════════════════════════════════
   التبديل بين مسار الأفراد ومسار المؤسسات في قسم Tracks.
   - دعم ARIA لإمكانية الوصول
   ════════════════════════════════════════════════════════════════════ */

(function initTabs() {
  const tabs = document.querySelectorAll('.tracks__tab');
  const panels = document.querySelectorAll('.tracks__panel');

  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all tabs
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });

      // Hide all panels
      panels.forEach(p => p.classList.remove('active'));

      // Activate clicked tab
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Show corresponding panel
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
})();
