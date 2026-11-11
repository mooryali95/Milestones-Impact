// ════════════════════════════════════════════════════════════════
// مسودات لا تضيع: تحذير عند إغلاق الصفحة وفيها تعديل غير محفوظ،
// ودفع الحفظ حين تُغادَر الشاشة داخل التطبيق قبل أن يلحقها الحفظ التلقائي
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';

export function useUnsavedGuard(dirty, flush) {
  const latest = useRef({ dirty, flush });
  latest.current = { dirty, flush };
  useEffect(() => {
    const warn = (e) => { if (latest.current.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (latest.current.dirty && latest.current.flush) latest.current.flush();
    };
  }, []);
}

// مسودة نموذج يُحفظ بزر لا تلقائيًا (وحفظه قد يرسل بريدًا، فلا يُدفع آليًا): تبقى في الجلسة حين تُغادَر الشاشة
// داخل التطبيق، وتعود عند الرجوع إليها. sessionStorage في هذا التبويب وحده وتزول بإغلاقه، والمفتاح يحمل صاحب
// الحساب فلا تظهر مسودة حساب في حساب آخر. take تقرؤها وتحذفها، فلا تعود مرتين.
const draftKey = (k) => `mi_draft:${k}`;
export const drafts = {
  save(k, value) { try { sessionStorage.setItem(draftKey(k), JSON.stringify(value)); } catch { /* وضع خاص أو مساحة ممتلئة */ } },
  take(k) {
    try {
      const raw = sessionStorage.getItem(draftKey(k));
      sessionStorage.removeItem(draftKey(k));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
};
