// ════════════════════════════════════════════════════════════════
// نوافذ المراحل: المصدر الواحد لتواريخ كل مرحلة في دفعة
// ════════════════════════════════════════════════════════════════
// يستوردها خريطة الجهة (journey-map.js) والخط الزمني (journey-timeline.js)، فلا تُحسب النوافذ مرتين.
// دالة نقية بلا قاعدة بيانات.
import { addDays } from './milestones.js';
import { stageRules } from './journey.js';

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// مجموعات «تبدأ مع» بترتيب أول ظهورها، كما يجمعها distributeSchedule: المرحلة تنضم إلى مجموعة مرجعها إن كان قبلها،
// والسلسلة (C مع B وB مع A) تُحل إلى A. المرجع اللاحق أو الغائب يجعلها مجموعة وحدها («بعد السابقة»)
export function withGroups(stages) {
  const groups = [], groupOf = new Map();
  for (const s of stages) {
    const r = stageRules(s);
    const g = r.unlock === 'with' && r.with ? groupOf.get(r.with) : null;
    if (g) g.push(s); else groups.push([s]);
    groupOf.set(s.key, g || groups.at(-1));
  }
  return groups;
}

// نافذة كل مرحلة: من جدول الدفعة إن ضُبط لها، وإلا من مددها المخططة من بداية الدفعة.
// المجموعة تبدأ معًا: أولها من المؤشر، وكل من «تبدأ مع» X من بداية X وتمتد بمدتها. المجموعة التالية تبدأ حين تنتهي
// أطول مراحل المجموعة، ولو جاءت في الترتيب بين مراحلها، كما في distributeSchedule، فلا يختلف المصدران على تاريخ.
export function stageWindows(stages, cohort = {}) {
  const sched = cohort?.schedule || {};
  let cursor = cohort?.starts_on || null;
  const out = {};
  const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
  for (const group of withGroups(stages)) {
    let end = null;
    group.forEach((s, i) => {
      const fixed = sched[s.key];
      if (fixed?.start) {
        // بداية مكتوبة بلا نهاية: النهاية من البداية بمدة المرحلة، لا يوم البداية، فلا تُستحق «نهاية X» يوم بدئها
        out[s.key] = { from: fixed.start, to: fixed.end || addDays(fixed.start, Number(s.duration_days) || 0) };
        // أول المجموعة بجدول ثابت يضع نهايتها كما هو، ولو سبق المؤشر
        end = i === 0 ? out[s.key].to : later(end, out[s.key].to);
        return;
      }
      const ref = i > 0 ? out[stageRules(s).with] : null;
      const from = i === 0 ? cursor : ref ? ref.from : cursor;
      if (!from) return;
      const to = addDays(from, Number(s.duration_days) || 0);
      out[s.key] = { from, to };
      end = later(end, to);
    });
    if (end) cursor = end;
  }
  return out;
}

// أين يقول الجدول إن الدفعة اليوم: آخر مرحلة في الترتيب تحوي نافذتها اليوم، وإلا آخر مرحلة بدأت (بين مرحلتين).
// الرحلة تنتهي بأبعد نهاية بين كل المراحل لا بنافذة آخرها في الترتيب، فمرحلة قصيرة تسير مع أطول منها لا تنهيها
export function todayStage(stages, windows, today) {
  const t = isoDay(today);
  let inside = null, started = null, end = null;
  for (const s of stages) {
    const w = windows[s.key];
    if (!w) continue;
    if (!end || w.to > end) end = w.to;
    if (w.from <= t) started = s.key;
    if (w.from <= t && t <= w.to) inside = s.key;
  }
  if (!started || (end && t > end)) return null;
  return inside || started;
}
