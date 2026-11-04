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
