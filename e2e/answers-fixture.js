// بيانات «إجابات القياس» المُحاكاة لمواصفات e2e: تُبنى بـreviewAnswers نفسها التي يرد بها الخادم،
// فلا يبتعد شكل المحاكاة عن الرد الحقيقي. (تصور بطاقة المستوى وإجابات القياس، المرحلة 2)
import { reviewAnswers } from '../supabase/functions/leaders-api/answer-review.js';

const T = Date.parse('2026-11-02T10:00:00Z');
const iso = (sec) => new Date(T + sec * 1000).toISOString();
const likert = (id, dimension, sort, text) => ({ id, code: id.toUpperCase(), dimension, tier: 'behavior', sort, kind: 'likert', text_ar: text,
  options: ['أبدًا', 'نادرًا', 'أحيانًا', 'غالبًا', 'دائمًا', 'لا ينطبق على عملي'].map((label, i) => ({ label, score: i === 5 ? -1 : i })) });
const choice = (id, dimension, tier, sort, text, labels, scores) => ({ id, code: id.toUpperCase(), dimension, tier, sort, kind: 'choice', text_ar: text, options: labels.map((label, i) => ({ label, score: scores[i] })) });

export const questions = [
  likert('mi-b01', 'milestone', 1, 'أراجع خطة المعالم مع فريقي كل أسبوع'),
  likert('mi-b02', 'milestone', 2, 'أوثّق قرارات التغيير في سجل المشروع'),
  choice('mi-s01', 'milestone', 'skill', 1, 'تأخر مورد رئيس أسبوعين، ما أول ما تفعله؟', ['أعيد جدولة المعالم المتأثرة وأبلغ الراعي', 'أنتظر حتى يتضح الأثر', 'أطلب بديلًا فورًا', 'أخفض نطاق المشروع'], [4, 0, 2, 1]),
  likert('im-b01', 'impact', 1, 'أراجع مؤشرات الأثر مع فريقي شهريًا'),
  likert('im-b02', 'impact', 2, 'أقيس رضا المستفيدين بعد كل مرحلة'),
  choice('im-k01', 'impact', 'knowledge', 1, 'ما أفضل مؤشر لقياس أثر برنامج دعم رواد الأعمال؟',
    ['عدد الورش المنفذة لرواد الأعمال خلال العام', 'نسبة المشاركين الراضين عن جودة الورش المقدمة', 'نسبة المنشآت المستمرة بعد عامين من الدعم', 'عدد طلبات الالتحاق بالبرنامج في كل دورة'], [0, 1, 4, 0]),
  choice('im-k02', 'impact', 'knowledge', 2, 'ما الفرق بين المخرج والأثر؟', ['لا فرق', 'المخرج ما ننتجه والأثر ما يتغير', 'الأثر أسرع ظهورًا', 'المخرج يقاس بالرضا'], [0, 4, 0, 0]),
  choice('im-k03', 'impact', 'knowledge', 3, 'متى يُقاس خط الأساس؟', ['قبل التدخل', 'بعده', 'في منتصفه', 'لا حاجة له'], [4, 0, 1, 0]),
];
const rows = [
  { question_id: 'mi-b01', value: { k: 3 }, answered_at: iso(40) },
  { question_id: 'mi-b02', value: { k: 4 }, answered_at: iso(48) },
  { question_id: 'mi-s01', value: { k: 0 }, answered_at: iso(80) },
  { question_id: 'im-b01', value: { k: 5 }, answered_at: iso(300) },
  { question_id: 'im-b02', value: { k: 2 }, answered_at: iso(309) },
  { question_id: 'im-k01', value: { k: 1 }, answered_at: iso(313) },   // 4ث وجزئية: سريع
  { question_id: 'im-k02', value: { k: 1 }, answered_at: iso(332) },
  { question_id: 'im-k03', value: { k: 0 }, answered_at: iso(355) },
];

export function answersReply({ id = 'a1', kind = 'baseline' } = {}) {
  return {
    success: true,
    assessment: { id, kind, title: 'القياس المبدئي', form: 'A', started_at: iso(0), submitted_at: iso(34 * 60) },
    assessments: [{ id: 'a1', kind: 'baseline', form: 'A', submitted_at: iso(34 * 60) }, { id: 'a2', kind: 'post', form: 'B', submitted_at: '2026-12-20T10:00:00Z' }],
    ...reviewAnswers({ questions, rows, startedAt: iso(0), submittedAt: iso(34 * 60), results: { milestone: { knowledge: null, skill: 100, behavior: 87.5 }, impact: { knowledge: 41.67, skill: null, behavior: 50 } } }),
  };
}
