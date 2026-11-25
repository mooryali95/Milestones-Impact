// «مبادرتك الآن» في رحلتي («الوثيقة الحية»، اعتمده المالك 2026-11-25): سطر الخط نفسه (spine.js)، ورابط إليه،
// وتنبيه هادئ حين تتأخر الوثيقة عن تقدم الرحلة. يقرأ capstone.get كما هو، وخطؤه لا يظهر (السطر اختياري)
import React, { useEffect, useState } from 'react';
import { call } from '../api.js';
import { spineSummary } from '../../../supabase/content/initiative-guide/v1/spine.js';

// فرق التأخر المحتمل بين تقدم الرحلة وإنجاز الوثيقة بالنقاط المئوية
export const LAG_POINTS = 25;

/** هل تتأخر المبادرة عن التعلم؟ progress نسبة الرحلة (0 إلى 100)، وdone وtotal فصول الوثيقة */
export const initiativeLags = (progress, done, total) => total > 0 && Number(progress) - Math.round((done / total) * 100) >= LAG_POINTS;

export function InitiativeNow({ progress, onOpen }) {
  const [d, setD] = useState(null);
  useEffect(() => { call('capstone.get').then((r) => r?.success && setD(r)).catch(() => {}); }, []);
  if (!d || !onOpen) return null;
  const sum = spineSummary(d.sections);
  const lag = initiativeLags(progress, sum.done, sum.total);
  return (
    <section className={`card journey-initiative${lag ? ' warn' : ''}`} aria-labelledby="ji-h" data-initiative-now>
      <b id="ji-h">مبادرتك الآن</b>
      <span className="small">{sum.line}</span>
      {lag && <span className="small" role="note">رحلتك تتقدم أسرع من وثيقتك، فخصص لها وقتًا هذا الأسبوع.</span>}
      <button type="button" className="btn ghost sm" onClick={onOpen}>افتح خط الوثيقة</button>
    </section>
  );
}
