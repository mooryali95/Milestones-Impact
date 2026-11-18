// ════════════════════════════════════════════════════════════════
// سجل «ما لم يُحفظ بعد»: مصدر واحد يسأله التطبيقان قبل أي إعادة تحميل تلقائية
// ════════════════════════════════════════════════════════════════
// تصور تحديث المنصة، المرحلة 5 البند 4: إعادة التحميل عند التنقل الداخلي لا تقع ونموذج فيه تعديل لم يُحفظ.
// كل نموذج يسجّل دالة تقول «فيّ تعديل لم يُحفظ الآن؟»: useUnsavedGuard في تطبيق القادة (unsaved.js) وuseGuardedClose في
// لوحة الإدارة (ui.jsx) يسجّلان تلقائيًا، والمختبر والقياس يسجّلان حالتهما (Lab.jsx وAssessment.jsx).
// ونافذة حوار مفتوحة (aria-modal) تُعامل كأن فيها ما لم يُحفظ: الأسلم ألا تُغلق تحت يد من يكتب فيها.
import { useEffect, useRef } from 'react';

const sources = new Set();

/** يسجّل دالة تعيد true حين يوجد تعديل لم يُحفظ. يعيد دالة إلغاء التسجيل */
export function registerUnsaved(fn) {
  if (typeof fn !== 'function') return () => {};
  sources.add(fn);
  return () => { sources.delete(fn); };
}

/** نافذة حوار مفتوحة في الصفحة؟ */
export function openDialog(doc = typeof document === 'undefined' ? null : document) {
  try { return !!doc?.querySelector?.('[aria-modal="true"]'); } catch { return false; }
}

/** هل في الصفحة ما لم يُحفظ؟ دالة ترمي تُعامل كأن فيها ما لم يُحفظ (الشك يمنع إعادة التحميل) */
export function hasUnsaved(doc) {
  for (const fn of sources) {
    try { if (fn()) return true; } catch { return true; }
  }
  return openDialog(doc);
}

export const _resetUnsaved = () => { sources.clear(); };

/** خطاف React: يسجّل حالة dirty (قيمة أو دالة) ما دام المكوّن معروضًا */
export function useUnsavedFlag(dirty) {
  const latest = useRef(dirty);
  latest.current = dirty;
  useEffect(() => registerUnsaved(() => {
    const v = latest.current;
    return typeof v === 'function' ? !!v() : !!v;
  }), []);
}
