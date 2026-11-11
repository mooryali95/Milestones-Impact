// ══ Auto-generated from shared/js — edit the source there, not this copy. ══
/* ══════════════════════════════════════════
   MOBILE MENU — Hamburger Drawer Controller
   (shared across home / leaders — edit here only)
══════════════════════════════════════════ */
(function () {
  const burgerBtn = document.getElementById('burgerBtn');
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileOverlay');
  const closeBtn = document.getElementById('drawerCloseBtn');
  const drawerLinks = document.querySelectorAll('.mobile-drawer__link');

  if (!burgerBtn || !drawer || !overlay) return;

  // الدرج المغلق خارج الشاشة: inert وaria-hidden فلا يبلغه Tab ولا قارئ الشاشة
  function setHidden(hidden) {
    drawer.inert = hidden;
    if (hidden) drawer.setAttribute('aria-hidden', 'true');
    else drawer.removeAttribute('aria-hidden');
  }
  setHidden(true);

  const isOpen = () => drawer.classList.contains('is-open');
  // نافذة التواصل قد تُفتح من زر «طلب موعد» داخل الدرج، فلها مفاتيحها ما دامت مفتوحة
  const contactOpen = () => !!document.querySelector('.tf-modal.open');

  function openDrawer() {
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    burgerBtn.classList.add('is-open');
    burgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setHidden(false);
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  // returnFocus: يعود التركيز إلى زر القائمة (لا عند اتباع رابط، فالتركيز يتبع وجهته)
  function closeDrawer(returnFocus) {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    burgerBtn.classList.remove('is-open');
    burgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setHidden(true);
    if (returnFocus) burgerBtn.focus({ preventScroll: true });
  }

  burgerBtn.addEventListener('click', function () {
    if (isOpen()) {
      closeDrawer(true);
    } else {
      openDrawer();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', function () { closeDrawer(true); });
  overlay.addEventListener('click', function () { closeDrawer(true); });

  drawerLinks.forEach(function (link) {
    link.addEventListener('click', function () { closeDrawer(false); });
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen() || contactOpen()) return;
    if (e.key === 'Escape') {
      closeDrawer(true);
      return;
    }
    // Tab يدور داخل الدرج المفتوح (الصفحة خلفه مغطاة)
    if (e.key === 'Tab') {
      const list = Array.from(drawer.querySelectorAll('a[href], button')).filter(function (el) {
        return !el.disabled && el.getClientRects().length;
      });
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (i === -1 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
    }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth >= 1024 && isOpen()) {
      closeDrawer(false);
    }
  });
})();
