// ════════════════════════════════════════════════════════════════
// حفظ الدفعة بحارس النقل: الخادم يرفض نقل أعضاء لهم تقدم من دفعة جهتهم على برنامج آخر
// ════════════════════════════════════════════════════════════════
// الرفض يسمي العدد (confirm_move)، فيُعرض على المدير، ولا يُعاد الإرسال بالتأكيد إلا بموافقته الصريحة.
// المصدر الواحد لنموذج الدفعة ومعالجها، فلا يختلفان في السؤال ولا في نصه.
import { L } from './leaders.js';

export const MOVE_OK = 'انقلهم إلى الدفعة الجديدة';
export const MOVE_CANCELLED = 'لم تُحفظ الدفعة: لم يُؤكَّد نقل المشاركين.';

// نص السؤال من رد الخادم: العدد ومن أين، وما يخسرونه
export function confirmMoveText(r) {
  const n = Number(r?.affected) || 0;
  const from = (r?.from || []).map((c) => `«${c.name}»`).join('، ');
  return `${n} مشاركًا من جهة هذه الدفعة لهم تقدم في ${from || 'دفعة جهتهم الحالية'} على برنامج آخر، وسينتقلون إلى هذه الدفعة تلقائيًا فيفقدون ما أنجزوه من رحلتهم. الملحقون يدويًا باقون في دفعتهم. هل تنقلهم؟`;
}

// L بحارس: الرد كما هو، إلا confirm_move فيُسأل المدير ثم يُعاد الإرسال بالتأكيد
export async function saveCohort(body, confirm, call = L) {
  const r = await call('admin.cohort-save', body);
  if (r?.success || r?.code !== 'confirm_move') return r;
  if (!(await confirm(confirmMoveText(r), { danger: true, ok: MOVE_OK }))) return { success: false, message: MOVE_CANCELLED };
  return call('admin.cohort-save', { ...body, confirm_move: true });
}
