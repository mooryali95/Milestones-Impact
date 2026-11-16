// ════════════════════════════════════════════════════════════════
// المراجعة المتتالية لملفات المشاركين (اعتمدها المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// فتح مشارك من القائمة المفلترة يحفظ ترتيبها كما يراه المدير، فيتنقل في ملفه بين «السابق» و«التالي»
// دون الرجوع للقائمة. لقطة في هذه الجلسة من المتصفح فقط: لا خادم ولا مصدر ثانٍ للبيانات.

const KEY = 'mi_admin_review_queue';
const MAX = 500; // حد قائمة المشاركين على الخادم

/** يحفظ ترتيب القائمة الظاهرة ووصفها عند فتح أحد صفوفها */
export function saveQueue(ids, label = '') {
  const list = [...new Set((ids || []).filter(Boolean))].slice(0, MAX);
  try { sessionStorage.setItem(KEY, JSON.stringify({ ids: list, label: String(label || '') })); } catch { /* التخزين محجوب: لا تنقل */ }
}

export function readQueue() {
  try {
    const q = JSON.parse(sessionStorage.getItem(KEY));
    return q && Array.isArray(q.ids) ? { ids: q.ids.filter((x) => typeof x === 'string'), label: String(q.label || '') } : null;
  } catch { return null; }
}

/** موضع المشارك في القائمة وجاراه، أو null إن فُتح من خارجها (رابط مباشر أو شاشة أخرى) */
export function position(queue, id) {
  const ids = queue?.ids || [];
  const i = ids.indexOf(id);
  if (i < 0 || ids.length < 2) return null;
  return { index: i + 1, total: ids.length, prev: ids[i - 1] || null, next: ids[i + 1] || null, label: queue.label || '' };
}

/** وصف القائمة: العرض السريع المختار، أو «قائمتك» إن كانت فلاتر حرة */
export function queueLabel(presets, view) {
  return (presets || []).find((p) => p.key === view)?.label || '';
}

/** اختصار لوحة المفاتيح للتنقل، إلا داخل حقل أو نافذة مفتوحة أو مع مفتاح تعديل */
export function navKey(e, doc = globalThis.document) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const t = e.target;
  const tag = t?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return null;
  if (doc?.querySelector?.('[aria-modal="true"], dialog[open]')) return null;
  // الأسهم داخل التبويبات أو قائمة الإجراءات تتنقل فيها هي (نمط ARIA)، لا بين الملفات
  if (t?.closest?.('[role="tablist"], [role="menu"], [role="listbox"]')) return null;
  // الصفحة من اليمين لليسار: السهم الأيسر للأمام. J وK بموضع المفتاح (code) فتعملان بلوحة عربية أيضًا
  if (e.key === 'ArrowLeft' || e.code === 'KeyJ') return 'next';
  if (e.key === 'ArrowRight' || e.code === 'KeyK') return 'prev';
  return null;
}
