// ════════════════════════════════════════════════════════════════
// حفظ الدفعة بحارس النقل: الخادم يرفض حفظًا ينقل من لهم تقدم إلى دفعة على برنامج آخر
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
export async function saveCohort(body, confirm, call = L) {
  const r = await call('admin.cohort-save', body);
  if (r?.success || r?.code !== 'confirm_move') return r;
  if (!(await confirm(confirmMoveText(r), { danger: true, ok: MOVE_OK }))) return { success: false, message: MOVE_CANCELLED };
  return call('admin.cohort-save', { ...body, confirm_move: true });
}
