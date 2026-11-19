// آخر نشاط فعلي للمشارك (تصور تشغيل الدفعة 2026-11-19، المرحلة 0): «آخر دخول» وقت آخر تسجيل دخول برمز، والجلسة تبقى
// 14 يومًا وتتجدد بالاستعمال، فمن يعمل كل يوم يظهر دخوله قديمًا. وقت آخر استعمال محفوظ في الجلسة نفسها (last_seen_at)
// يكتبه participantFromToken مع كل طلب. منطق خالص، للخادم ولاختباره.

/** آخر نشاط فعلي: الأحدث من آخر دخول ومن آخر استعمال لأي جلسة (auth_sessions.last_seen_at)، أو null */
export function lastActive(lastLoginAt, seen = []) {
  let best = null;
  for (const v of [lastLoginAt, ...seen]) {
    const t = v ? Date.parse(v) : NaN;
    if (!Number.isNaN(t) && (best == null || t > best)) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}
