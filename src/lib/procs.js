// العمليات الست عشرة للمصفوفة: مصدر واحد يبنيها تطبيق المصفوفة ولوحة الإدارة
// من الثوابت (المراحل × المسارات) مدموجة بتفاصيلها من قاعدة البيانات (process_details).
import { OPERATIONS, PHASES, TRACKS } from '../config/constants';

export function buildProcs(processDetails = {}) {
  const list = [];
  let idx = 0;
  for (const ph of PHASES) {
    for (const tr of TRACKS) {
      const op = OPERATIONS[tr.id][ph.id - 1];
      const key = `${tr.id}-${ph.id}`;
      const detail = processDetails[key] || {};
      list.push({
        key, trackId: tr.id, trackNameAr: tr.nameAr,
        trackColor: tr.color, trackWeight: tr.weight, trackIcon: tr.icon,
        trackContentAr: tr.contentAr, phaseId: ph.id, phaseNameAr: ph.nameAr,
        groupAr: ph.groupAr, group: ph.group, ...op, index: idx,
        insight: detail.insight || '',
        whyItMatters: detail.why_it_matters || '',
        fullDesc: detail.description || '',
        outputs: detail.outputs || [],
        duration: detail.duration || `${op.dur} أيام`,
        feeds: detail.feeds || [],
        fedBy: detail.fed_by || [],
      });
      idx++;
    }
  }
  return list;
}
export const PROC_COUNT = PHASES.length * TRACKS.length;
