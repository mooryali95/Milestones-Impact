// ════════════════════════════════════════════════════════════════
// نوافذ المراحل: المصدر الواحد لتواريخ كل مرحلة في دفعة
// ════════════════════════════════════════════════════════════════
// يستوردها خريطة الجهة (journey-map.js) والخط الزمني (journey-timeline.js)، فلا تُحسب النوافذ مرتين.
// دالة نقية بلا قاعدة بيانات.
import { addDays } from './milestones.js';
import { stageRules } from './journey.js';

const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// نافذة كل مرحلة: من جدول الدفعة إن ضُبط لها، وإلا متتابعة بمددها المخططة من بداية الدفعة.
// المرحلة التي «تبدأ مع» X تبدأ ببداية X وتمتد بمدتها، والمؤشر يتقدم إلى أبعد نهاية في المجموعة،
// فالمرحلة التالية تبدأ حين تنتهي أطول مراحل المجموعة. المرجع بلا نافذة معروفة يُعامل «بعد السابقة».
export function stageWindows(stages, cohort = {}) {
  const sched = cohort?.schedule || {};
  let cursor = cohort?.starts_on || null;
  const out = {};
  const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
  for (const s of stages) {
    const r = stageRules(s);
    const ref = r.unlock === 'with' && r.with ? out[r.with] : null;
    const fixed = sched[s.key];
    if (fixed?.start) {
      out[s.key] = { from: fixed.start, to: fixed.end || fixed.start };
      cursor = ref ? later(cursor, fixed.end || fixed.start) : fixed.end || fixed.start;
      continue;
    }
    const from = ref ? ref.from : cursor;
    if (!from) continue;
    const to = addDays(from, Number(s.duration_days) || 0);
    out[s.key] = { from, to };
    cursor = ref ? later(cursor, to) : to;
  }
  return out;
}

// أين يقول الجدول إن الدفعة اليوم: آخر مرحلة بدأت نافذتها، ما لم تنتهِ الرحلة كلها
export function todayStage(stages, windows, today) {
  const t = isoDay(today);
  let at = null;
  for (const s of stages) {
    const w = windows[s.key];
    if (w && w.from <= t) at = s.key;
  }
  const last = stages.at(-1);
  if (at && last && windows[last.key] && t > windows[last.key].to) return null;
  return at;
}
