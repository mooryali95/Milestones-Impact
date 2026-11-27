// زر الحضور في «الحضور والجلسات» (المرحلة 12): يقول ما يفتح. «سجّل الحضور (الحاضر من المتوقع)» لمن يكتب و«عرض الحضور» لمن يقرأ،
// ويُعطل بسبب ظاهر للجلسة بلا موعد وللجلسة التي لم تبدأ (التصور المعتمد)، ما لم يكن فيها حضور مسجل. expected من admin.activities حين يحمله الرد
import { isUndated } from '../../supabase/functions/leaders-api/logic.js';

export function attendanceButton(s, { canWrite, now = Date.now() } = {}) {
  const attended = Number(s?.attended) || 0;
  const expected = Number.isFinite(Number(s?.expected)) && s?.expected != null ? Number(s.expected) : null;
  const count = expected == null ? `(${attended})` : `(${attended} من ${expected})`;
  const label = `${canWrite ? 'سجّل الحضور' : 'عرض الحضور'} ${count}`;
  const undated = isUndated(s);
  if (attended === 0 && undated) return { label, disabled: true, reason: 'يُفتح بعد تحديد الموعد' };
  const starts = Date.parse(s?.starts_at);
  if (attended === 0 && Number.isFinite(starts) && starts > now) return { label, disabled: true, reason: 'يُفتح عند بدء الجلسة' };
  return { label, disabled: false, reason: null };
}
