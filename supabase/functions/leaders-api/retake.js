// ════════════════════════════════════════════════════════════════
// طلب إعادة القياس: نصه الواحد للموقع والبريد، ومن يصح أن يُطلب منه (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المدخل الواحد admin.reset-assessment: يلغي القياس ويسجّل الطلب على القياس نفسه، فيرى المشارك بطاقة في الموقع ويصله بريد
// بالنص نفسه. السبب «effort» حين دلّ مؤشر الجهد على استعجال، و«admin» لما سواه. النص لا يتهم ولا يعد بما لا يفعله النظام:
// الزمن لا يدخل الدرجة (answer-review.js)، وإنما لا يُعتمد على نتيجة لم تُقرأ أسئلتها.
export const RETAKE_REASONS = ['effort', 'admin'];
export const RETAKE_TITLE = 'نحتاج منك إعادة قياس تحديد المستوى';
export const RETAKE_MAIL_SUBJECT = 'نحتاج منك إعادة قياس تحديد المستوى';
export const RETAKE_BUTTON = 'أعد القياس';

/** @param {string} reason @param {number|null} [minutes] الزمن المعلن للأداة (instruments.est_minutes) */
export function retakeText(reason, minutes = null) {
  const time = minutes ? `يأخذ نحو ${minutes} دقيقة، وتقدمك يُحفظ سؤالًا سؤالًا فتكمله على أكثر من جلسة.` : 'تقدمك يُحفظ سؤالًا سؤالًا، فتكمله على أكثر من جلسة.';
  const why = reason === 'effort'
    ? 'أظهرت مراجعة إجاباتك أن كثيرًا منها جاء أسرع من الوقت اللازم لقراءة السؤال، فلا يمكننا الاعتماد على النتيجة لتحديد مسارك.'
    : 'راجعت إدارة البرنامج قياسك ورأت أن يُعاد قبل اعتماد مسارك.';
  return `${why} مسارك في البرنامج يُبنى على هذا القياس، لذلك نطلب منك إعادته بتأنٍّ. ${time}`;
}

// سبب الطلب من مؤشر الجهد المحفوظ: استعجال ظاهر أو مراجَع ← effort، وإلا قرار إداري
export const retakeReason = (effort) => (effort && (effort.level === 'low' || effort.level === 'watch') ? 'effort' : 'admin');

/**
 * طلب الإعادة القائم لمشارك: آخر قياس مبدئي ملغى طُلبت إعادته، ما لم يسلّم بعده قياسًا.
 * @param {any[]} assessments قياساته المبدئية { status, retake_requested_at, retake_reason, submitted_at }
 */
export function openRetake(assessments) {
  const asked = (assessments || []).filter((a) => a.status === 'void' && a.retake_requested_at)
    .sort((x, y) => String(y.retake_requested_at).localeCompare(String(x.retake_requested_at)))[0];
  if (!asked) return null;
  const redone = (assessments || []).some((a) => a.status === 'submitted' && a.submitted_at && String(a.submitted_at) > String(asked.retake_requested_at));
  return redone ? null : { requested_at: asked.retake_requested_at, reason: asked.retake_reason || 'admin' };
}

/** من يصح أن تُطلب منه الإعادة جماعيًا: سلّم قياسه ولم يُعتمد مستواه بعد */
export const canRequestRetake = (p, a) => !!a && a.status === 'submitted' && p?.status === 'pending_approval' && !p?.is_demo;
