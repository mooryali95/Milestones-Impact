// ════════════════════════════════════════════════════════════════
// مؤقت القاعة: كل جهاز يعدّ إلى وقت النهاية الذي يملكه الخادم
// ════════════════════════════════════════════════════════════════
// view.session.ends_at وقت النهاية، وview.now ساعة الخادم لحظة الرد: الفرق بينها وبين ساعة الجهاز يُحسب مرة
// عند وصول الحالة، فيتطابق العدّ على الجوال والشاشة الكبيرة ولو اختلفت ساعتاهما.
import { useEffect, useMemo, useState } from 'react';
import { secondsLeft, clock } from '../../supabase/functions/leaders-api/hall.js';

/** الثواني الباقية (null حين لا مؤقت) */
export function useHallTimer(view) {
  const endsAt = view?.session?.ends_at || null;
  const skew = useMemo(() => (view?.now ? new Date(view.now).getTime() - Date.now() : 0), [view?.now]);
  const [left, setLeft] = useState(() => secondsLeft(endsAt, Date.now() + skew));
  useEffect(() => {
    const tick = () => setLeft(secondsLeft(endsAt, Date.now() + skew));
    tick();
    if (!endsAt) return undefined;
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [endsAt, skew]);
  return left;
}

export const timerLabel = (left) => (left == null ? '' : left > 0 ? clock(left) : 'انتهى الوقت');
