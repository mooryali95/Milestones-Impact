// الأرقام العربية الهندية (٠-٩) والفارسية (۰-۹) تتحول إلى 0-9 لحظة كتابتها في أي حقل إدخال، بلا رفض ولا تنبيه.
// مستمع واحد على المستند في طور الالتقاط يسبق React، ويكتب القيمة بمُعيِّن النموذج الأصلي لا بمُعيِّن العنصر،
// فلا يُحدَّث متتبع القيمة في React ويصل onChange إلى الشاشة بالقيمة المحوّلة كأن المستخدم كتبها هكذا.
const DIGITS = /[٠-٩۰-۹]/g;
export const latinDigits = (s) => String(s ?? '').replace(DIGITS, (d) => String((d.charCodeAt(0) & 0xF) % 10));
// ٠ = U+0660 و۰ = U+06F0: الخانة الدنيا هي الرقم نفسه

const SKIP = new Set(['checkbox', 'radio', 'file', 'range', 'color', 'button', 'submit', 'reset', 'hidden']);

export function normalizeField(el) {
  if (!el || el.tagName !== 'INPUT' || SKIP.has(el.type)) return false;
  const v = el.value;
  if (!/[٠-٩۰-۹]/.test(v)) return false;
  let pos = null;
  try { pos = el.selectionStart; } catch { /* email/number لا تدعم المؤشر */ }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, latinDigits(v));
  if (pos != null) { try { el.setSelectionRange(pos, pos); } catch { /* يكفي التحويل */ } }
  return true;
}

export function installLatinDigits(doc = document) {
  const on = (e) => normalizeField(e.target);
  doc.addEventListener('input', on, true);
  return () => doc.removeEventListener('input', on, true);
}
