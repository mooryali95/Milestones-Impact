// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: إشارات التفعيل من مصادرها القائمة (المرحلة G1)
// ════════════════════════════════════════════════════════════════
// القاعدة في guidance.js وحدها. هنا ثلاثة استعلامات صغيرة (عدّ بلا صفوف)، والمبادرة من الرحلة نفسها
// (journeyFor) فلا تُقرأ مرتين. تعذّر القراءة يعيد null: لا تظهر بطاقة «ابدأ»، والاستشارة متاحة كما هي.
// العزل: المعرّف من جلسة المشارك وحدها (mePayload)، ولا يُقبل من جسم الطلب، وكل استعلام مقيد به
// (guidance_test.ts يثبت ألا تدخل صفوف مشارك في حكم غيره).
import { db } from './core.ts';
import { GUIDANCE_READ_SECONDS, guidanceState } from './guidance.js';

export async function guidanceFor(participantId: string, initiative: boolean) {
  try {
    const [read, quizzes, models] = await Promise.all([
      db.from('reading_progress').select('module_id', { count: 'exact', head: true }).eq('participant_id', participantId).gte('active_seconds', GUIDANCE_READ_SECONDS),
      db.from('handbook_progress').select('module_id', { count: 'exact', head: true }).eq('participant_id', participantId),
      // سلّم مرة على الأقل: تاريخ التسليم يبقى بعد المراجعة أو الإعادة (returned)، فلا تُسقطه حالته اللاحقة
      db.from('model_submissions').select('model_id', { count: 'exact', head: true }).eq('participant_id', participantId).not('submitted_at', 'is', null),
    ]);
    for (const r of [read, quizzes, models]) if (r.error) throw r.error;
    return guidanceState({
      read_seconds: (read.count ?? 0) > 0 ? GUIDANCE_READ_SECONDS : 0,
      quizzes: quizzes.count ?? 0, initiative, models: models.count ?? 0,
    });
  } catch (e) {
    console.error('guidance signals', e);
    return null;
  }
}
