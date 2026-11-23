// قائمة منبثقة تبقى داخل الشاشة (قرار المالك 2026-11-23: قائمة «⋯» خرجت عن حافة الهاتف).
// بعد الرسم: إن تجاوزت حافة النافذة تُزاح أفقيًا بقدر التجاوز وهامش 8px، ولا تتجاوز عرض الشاشة. منطق خالص للحساب
export const EDGE = 8;
/** الإزاحة الأفقية اللازمة لمستطيل { left, right } داخل نافذة بعرض vw (موجبة لليمين) */
export function shiftInto({ left, right }, vw, edge = EDGE) {
  if (right - left > vw - 2 * edge) return edge - left; // أعرض من الشاشة: يبدأ من الهامش، والعرض يقيده CSS
  if (left < edge) return edge - left;
  if (right > vw - edge) return vw - edge - right;
  return 0;
}
/** يطبّق الإزاحة على عنصر مرسوم. يُستدعى بعد فتح القائمة */
export function keepInView(el, win = globalThis.window) {
  if (!el || !win) return 0;
  el.style.transform = '';
  const dx = shiftInto(el.getBoundingClientRect(), win.innerWidth);
  if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`;
  return dx;
}
