// سؤال صاحب القرار الذي يفتح باب «حالة العمل» (institutional.js) وفصله في ملف العمل (capstone.js) — المرحلة 29.
// المصدر واحد: decision-questions.json بجانب fields.json يربط الأبواب والفصول بمفاتيح الأسئلة ويحمل سؤال الأثر،
// ونصوص الأسئلة الخمسة بعمق مستوى المشارك من الشرائح (slices.json، frameworks.impact.case)
import DECISION_QUESTIONS from '../../../supabase/content/initiative-guide/v1/decision-questions.json' with { type: 'json' };

import { SLICES, trackManifest } from '../../../supabase/functions/leaders-api/track-manifest.js';

export { DECISION_QUESTIONS };
/** الأسئلة الخمسة بعمق مستوى المشارك: المصدر الواحد لباب «حالة العمل» وفصله في ملف العمل */
export const caseQuestions = (meta = {}) => trackManifest(meta.track_key || null, meta.priority || null).card?.support.case.questions || SLICES.frameworks.impact.case.advanced.questions;
/** نص السؤال لمفتاحه: من الملف أولًا، ثم من أسئلة الشرائح الممررة */
export const decisionQuestion = (key, ask = {}) => (key ? DECISION_QUESTIONS.questions[key] || ask?.[key] || null : null);
export const doorQuestion = (en, ask = {}) => decisionQuestion(DECISION_QUESTIONS.doors[en], ask);
export const chapterQuestion = (sectionKey, ask = {}) => decisionQuestion(DECISION_QUESTIONS.chapters[sectionKey], ask);
