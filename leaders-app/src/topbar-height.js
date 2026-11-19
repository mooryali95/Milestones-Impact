// ════════════════════════════════════════════════════════════════
// ارتفاع الترويسة في ‎--topbar-h‎: ليثبت تحتها شريط «تحديث جديد متاح» وشريط «أنت دون اتصال» عند التمرير
// ════════════════════════════════════════════════════════════════
// الترويسة ثابتة أعلى الصفحة وارتفاعها يتغير (الهاتف، شعار الجهة، حافة الشاشة الآمنة)، فلا رقم مكتوب في الأنماط.
// بلا ترويسة، أو في متصفح بلا ResizeObserver: القيمة 0 فيثبت الشريطان أعلى الصفحة (styles.css)
export function trackTopbarHeight(win = typeof window === 'undefined' ? null : window) {
  const doc = win?.document;
  const root = doc?.getElementById('root');
  if (!root) return () => {};
  let seen = null;
  const set = () => doc.documentElement.style.setProperty('--topbar-h', `${seen?.isConnected ? Math.round(seen.getBoundingClientRect().height) : 0}px`);
  const ro = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(set) : null;
  const find = () => {
    const el = root.querySelector(':scope > .topbar');
    if (el !== seen) { if (seen) ro?.unobserve(seen); seen = el; if (el) ro?.observe(el); }
    set();
  };
  // الترويسة ابن مباشر للجذر في كل الشاشات (App.jsx)، فيكفي رصد أبنائه المباشرين
  const mo = typeof win.MutationObserver === 'function' ? new win.MutationObserver(find) : null;
  mo?.observe(root, { childList: true });
  find();
  return () => { mo?.disconnect(); ro?.disconnect(); };
}
