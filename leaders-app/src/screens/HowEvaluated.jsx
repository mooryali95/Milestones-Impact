// ════════════════════════════════════════════════════════════════
// كيف تُقيَّم (D06 وD07 وD17): المعادلة كما تُطبَّق على برنامج المشارك، من الخادم، بلا مفاتيح
// ════════════════════════════════════════════════════════════════
// المكوّنات بأوزانها، والقياس النهائي بالإتقان المحكّي، وحدود القرار معلنة «مؤقتة» للدفعة الأولى،
// وما لا يدخل الدرجة، والمراجعة البشرية قرب الحدود، ومسار التظلم.
import React from 'react';
import { FINAL_COMPONENT_AR, FINAL_DECISION_AR } from '../../../supabase/functions/leaders-api/logic.js';

export default function HowEvaluated({ policy }) {
  if (!policy?.weights) return null;
  const t = policy.thresholds || {};
  const mastery = policy.measure?.mode === 'mastery';
  return (
    <details className="card how-eval">
      <summary>كيف يُقيَّم عملك في نهاية البرنامج</summary>
      <p className="small muted">تقييم ختامي واحد من أربعة مكوّنات بأوزانها، يعتمده خبير أو لجنة، ومنه وحده تصدر «شهادة الإتمام بنجاح».</p>
      <ul className="pay-points">
        {Object.entries(policy.weights).filter(([, w]) => w > 0).map(([k, w]) => <li key={k}>{FINAL_COMPONENT_AR[k] || k}: {w}%</li>)}
      </ul>
      {mastery && <p className="small">القياس النهائي إتقان محكّي: نتيجتك في الاختبار الموضوعي بعد البرنامج (معرفة ومواقف، بلا تقدير ذاتي) مقابل محك {policy.measure.mastery_cut}%. تغيّرك عن القياس المبدئي يُعرض لك وصفًا ولا يدخل الدرجة.</p>}
      <p className="small">القرار بالدرجة: {FINAL_DECISION_AR.pass} من {t.pass}، و{FINAL_DECISION_AR.pass_notes} من {t.pass_notes}، و{FINAL_DECISION_AR.extend} من {t.extend}، و{FINAL_DECISION_AR.fail} دونها. <b>هذه الحدود مؤقتة للدفعة الأولى</b>، وتُراجع بعد بياناتها.</p>
      <p className="small">لا يدخل الدرجة: كاتون والقاعة، فهما للتعلم. وكل حالة في نطاق نقطتين حول حد قرار يراجعها الخبير مراجعة بشرية بتعليل.</p>
      <p className="small muted">إن لم يُرضِك القرار فاطلب مراجعته بالرد على بريد القرار خلال عشرة أيام عمل، فتراجعه لجنة لم تشارك فيه. إصدار المعادلة {policy.version}.</p>
    </details>
  );
}
