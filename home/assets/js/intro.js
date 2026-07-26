// ══ Auto-generated from shared/js — edit the source there, not this copy. ══
/* ══════════════════════════════════════════
   INTRO OVERLAY — فيديو تعريفي يُعرض مرة واحدة لكل جلسة
   (shared — عدّل هنا فقط)
══════════════════════════════════════════ */
(function () {
  const KEY = 'mi_intro_seen';
  const overlay = document.getElementById('introOverlay');
  if (!overlay) return;

  const video = overlay.querySelector('.intro-overlay__video');
  const skipBtn = overlay.querySelector('.intro-overlay__skip');
  const bar = overlay.querySelector('.intro-overlay__bar');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // شوهد في هذه الجلسة، أو المستخدم يفضّل تقليل الحركة → تخطٍّ فوري
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) {}

  if (seen || reduceMotion) {
    overlay.classList.add('is-done');
    return;
  }

  document.body.classList.add('intro-active');
  if (bar) bar.classList.add('is-running');

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;

    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}

    overlay.classList.add('is-hiding');
    if (video) { try { video.pause(); } catch (e) {} }

    setTimeout(function () {
      overlay.classList.add('is-done');
      document.body.classList.remove('intro-active');
    }, 900);
  }

  // تشغيل الفيديو — مع تخطٍّ فوري إن مُنع التشغيل أو تعذّر الترميز
  if (video) {
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { dismiss(); });
    }
    video.addEventListener('ended', dismiss);
    video.addEventListener('error', dismiss);

    // مع عناصر <source> لا يُطلق الفيديو حدث error —
    // نفحص إن لم يجد المتصفح ترميزاً مدعوماً
    video.addEventListener('stalled', function () {
      if (video.networkState === 3 /* NETWORK_NO_SOURCE */) dismiss();
    });
    setTimeout(function () {
      if (video.readyState === 0 && video.networkState === 3) dismiss();
    }, 1500);
  }

  if (skipBtn) skipBtn.addEventListener('click', dismiss);

  // تخطٍّ بالضغط على Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') dismiss();
  });

  // شبكة أمان: لا يبقى الفيديو أكثر من 8 ثوانٍ مهما حدث
  setTimeout(dismiss, 8000);
})();
