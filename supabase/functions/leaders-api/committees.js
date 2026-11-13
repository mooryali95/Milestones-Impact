// ════════════════════════════════════════════════════════════════
// لجنتا المحتوى والقياس: العضوية من سجل الخبير، والتغطية مشتقة منه (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// لا قائمة أسماء ثانية: experts.committees يحمل العضوية، وexperts.dimensions يحمل الأطر، ومنهما تُقرأ المقاعد.
// قواعد التشكيل من docs/content/لجنة-المحتوى-والقياس-التشكيل-v2.md: لجنة المحتوى بعضو لكل إطار، ولجنة القياس بثلاثة.
import { DIMENSIONS } from './logic.js';
import { DIM_AR } from './labels.js';

export const COMMITTEES = ['content', 'measurement'];
export const COMMITTEE_AR = { content: 'لجنة المحتوى', measurement: 'لجنة القياس' };
export const MEASUREMENT_SEATS = 3;
export const cleanCommittees = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => COMMITTEES.includes(x)))];

/** تغطية اللجنتين من قائمة الخبراء: الأعضاء الفاعلون، وما ينقص كل لجنة بجملة تُقرأ */
export function committeeCoverage(experts) {
  const active = (experts || []).filter((e) => e.status === 'active');
  const of = (k) => active.filter((e) => (e.committees || []).includes(k));
  const content = of('content'), measurement = of('measurement');
  const uncovered = DIMENSIONS.filter((d) => !content.some((e) => (e.dimensions || []).includes(d)));
  const gaps = { content: [], measurement: [] };
  if (!content.length) gaps.content.push('لا أعضاء بعد');
  else if (uncovered.length) gaps.content.push(`لا عضو لإطار ${uncovered.map((d) => DIM_AR[d]).join(' ولا ')}`);
  if (measurement.length < MEASUREMENT_SEATS) gaps.measurement.push(measurement.length ? `${measurement.length} من ${MEASUREMENT_SEATS} مقاعد` : 'لا أعضاء بعد');
  const row = (k, list) => ({ key: k, title: COMMITTEE_AR[k], members: list.map((e) => ({ id: e.id, name: e.full_name, dimensions: e.dimensions || [] })), gaps: gaps[k], ready: gaps[k].length === 0 });
  return [row('content', content), row('measurement', measurement)];
}
