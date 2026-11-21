// ════════════════════════════════════════════════════════════════
// عمود الورشة الاختيارية (workshop_sessions.optional، الترحيل 20261122100000): القراءة المتسامحة في مكان واحد
// ════════════════════════════════════════════════════════════════
// القاعدة نفسها في optional.js. هذا الملف يجيب سؤالًا واحدًا: هل العمود موجود؟ قبل ترحيله لا عمود، فكل ورشة إلزامية كما كانت،
// والاختيار «اختيارية» معطل في اللوحة بجملة «غير مفعّلة بعد»، والحفظ بها مرفوض برسالته (لا تُحفظ إلزامية بصمت).
// من يقرأ الجلسات بأعمدة مسماة يطلب أعمدته من sessionCols، فيحمل الصف وسمه بعد الترحيل ولا يسقط الاستعلام قبله.
// ومن يقرأ بـ* يحمله بلا شيء. والعدّ نفسه بـcountedSessions وoptionalSession من optional.js.
import { db } from './core.ts';
import { missingColumn } from './missing-column.ts';

// «موجود» تُحفظ ما عاشت الدالة (العمود لا يُحذف)، و«غير موجود» تُعاد قراءتها في كل طلب فيُلتقط الترحيل حين يُطبق
let ready = false;
export async function optionalReady(): Promise<boolean> {
  if (ready) return true;
  // optional-exempt: سؤال هل عمود الوسم موجود، لا قراءة جلسات
  const { error } = await db.from('workshop_sessions').select('optional').limit(1);
  if (error && !missingColumn(error)) console.error('workshop optional', error.message);
  ready = !error;
  return ready;
}
/** أعمدة قراءة الجلسات ومعها الوسم إن وُجد عموده */
export async function sessionCols(cols: string): Promise<string> {
  return (await optionalReady()) ? `${cols}, optional` : cols;
}
/** للاختبارات وحدها: يعيد السؤال من جديد */
export function resetOptionalReady() { ready = false; }
