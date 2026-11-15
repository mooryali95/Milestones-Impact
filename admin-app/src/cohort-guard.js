// ════════════════════════════════════════════════════════════════
// حفظ الدفعة والإلحاق بها بحارس النقل: الخادم يرفض ما ينقل من لهم تقدم إلى دفعة على برنامج آخر
// ════════════════════════════════════════════════════════════════
// الرفض يسمي العدد (confirm_move)، فيُعرض على المدير، ولا يُعاد الإرسال بالتأكيد إلا بموافقته الصريحة.
// المصدر الواحد لنموذج الدفعة ومعالجها، فلا يختلفان في السؤال ولا في نصه.
import { L } from './leaders.js';
import { moveConfirmText } from '../../supabase/functions/leaders-api/logic.js';

export const MOVE_OK = 'احفظ وانقلهم';
export const MOVE_CANCELLED = 'لم تُحفظ الدفعة: لم يُؤكَّد نقل المشاركين.';

// نص السؤال من رد الخادم بصياغة الخادم نفسها (moveConfirmText): العدد ومن أين وإلى أين، وما يخسرونه
export const confirmMoveText = (r) => `${moveConfirmText(r)} هل تنقلهم؟`;

// L بحارس: الرد كما هو، إلا confirm_move فيُسأل المدير ثم يُعاد الإرسال بالتأكيد
async function guarded(action, body, confirm, call, cancelled) {
  const r = await call(action, body);
  if (r?.success || r?.code !== 'confirm_move') return r;
  if (!(await confirm(confirmMoveText(r), { danger: true, ok: MOVE_OK }))) return { success: false, message: cancelled };
  return call(action, { ...body, confirm_move: true });
}
export const saveCohort = (body, confirm, call = L) => guarded('admin.cohort-save', body, confirm, call, MOVE_CANCELLED);

// الإلحاق الصريح بدفعة بالحارس نفسه (admin.cohort-enroll): من له تقدم وتنقله الإلحاقة إلى برنامج آخر يُسأل عنه المدير أولًا
export const ENROLL_CANCELLED = 'لم يُنقل أحد: لم يُؤكَّد نقل من لهم تقدم إلى برنامج آخر.';
export const enrollCohort = (body, confirm, call = L) => guarded('admin.cohort-enroll', body, confirm, call, ENROLL_CANCELLED);
