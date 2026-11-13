// ════════════════════════════════════════════════════════════════
// مؤشر الجهد المحفوظ على القياس: يُحسب مرة عند التسليم، ويُستكمل لما سُلّم قبل عموده
// ════════════════════════════════════════════════════════════════
// الحساب في answer-review.js (effortOf) وحده. هنا القراءة والحفظ: assessments.effort هو ما تقرؤه القائمة والفلتر
// وبطاقة المستوى وملف الخبير، فلا يُعاد الحساب عند كل عرض. استشاري: لا يقرؤه التسكين ولا الإرسال.
import { db } from './core.ts';
import { reviewAnswers } from './answer-review.js';
import { appSettings } from './settings.ts';

export async function computeEffort(a: { id: string; instrument_id: string; started_at?: string | null; submitted_at?: string | null }) {
  const [qs, rows, settings] = await Promise.all([
    db.from('questions').select('id, code, dimension, tier, kind, options, sort, retro, form').eq('instrument_id', a.instrument_id),
    db.from('assessment_answers').select('question_id, value, score, answered_at').eq('assessment_id', a.id),
    appSettings(),
  ]);
  return reviewAnswers({ questions: qs.data || [], rows: rows.data || [], startedAt: a.started_at, submittedAt: a.submitted_at, timing: settings.answer_review }).effort;
}

/** يحسب ويحفظ. تعذّر الحفظ (العمود قبل ترحيله) لا يُسقط شيئًا: يعود المحسوب كما هو */
export async function saveEffort(a: { id: string; instrument_id: string; started_at?: string | null; submitted_at?: string | null }) {
  const effort = await computeEffort(a);
  const { error } = await db.from('assessments').update({ effort }).eq('id', a.id);
  if (error) console.error('effort save:', error.message);
  return effort;
}
