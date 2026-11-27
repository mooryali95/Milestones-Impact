// زر الحضور في «الحضور والجلسات» (المرحلة 12): يقول ما يفتح. «سجّل الحضور (الحاضر من المتوقع)» لمن يكتب و«عرض الحضور» لمن يقرأ،
// ويُعطل للجلسة بلا موعد وحدها ما لم يكن فيها حضور مسجل؛ الجلسة المستقبلية تفتح الورقة لعرض المتوقعين (والحضور المبكر). expected من admin.activities حين يحمله الرد
import { isUndated } from '../../supabase/functions/leaders-api/logic.js';

export function attendanceButton(s, { canWrite, now = Date.now() } = {}) {
  const attended = Number(s?.attended) || 0;
  const expected = Number.isFinite(Number(s?.expected)) && s?.expected != null ? Number(s.expected) : null;
  const count = expected == null ? `(${attended})` : `(${attended} من ${expected})`;
  const label = `${canWrite ? 'سجّل الحضور' : 'عرض الحضور'} ${count}`;
  const undated = isUndated(s);
  void now;
  if (undated && attended === 0) return { label, disabled: true, reason: 'يُفتح بعد تحديد الموعد' };
  return { label, disabled: false, reason: null };
}
