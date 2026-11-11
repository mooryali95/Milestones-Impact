// ════════════════════════════════════════════════════════════════
// خريطة الرحلة للجهة: كم يقف عند كل مرحلة، ومنذ متى، ومن تجاوز مدتها (قرار المالك 2026-11-11)
// ════════════════════════════════════════════════════════════════
// المصدر الواحد: رحلة كل مشارك كما يراها هو (journeyFor في participant.ts)، تُجمَّع هنا بلا حساب ثانٍ.
// دالة نقية بلا قاعدة، يختبرها journey-map.test.js، ويستدعيها coordinator.ts.
// الخصوصية: الأعداد والأسباب المجمّعة لكل منسق، والأسماء لمن له صلاحية «القائمة» (list)، وما ينقص كل شخص لمن له
// صلاحية «النشاط» (activity). لا درجات ولا مستويات هنا أبدًا.
import { addDays, daysBetween, MILESTONE_GRACE_DAYS } from './milestones.js';
import { renderJourneyText } from './journey.js';

// مهلة السماح نفسها التي في المعالم: من تجاوز مدة مرحلته بأكثر منها يُعدّ متأخرًا
export const STAGE_GRACE_DAYS = MILESTONE_GRACE_DAYS;
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// نافذة كل مرحلة: من جدول الدفعة إن ضُبط لها، وإلا متتابعة بمددها المخططة من بداية الدفعة
export function stageWindows(stages, cohort = {}) {
  const sched = cohort?.schedule || {};
  let cursor = cohort?.starts_on || null;
  const out = {};
  for (const s of stages) {
    const fixed = sched[s.key];
    if (fixed?.start) {
      out[s.key] = { from: fixed.start, to: fixed.end || fixed.start };
      cursor = fixed.end || fixed.start;
      continue;
    }
    if (!cursor) continue;
    const to = addDays(cursor, Number(s.duration_days) || 0);
    out[s.key] = { from: cursor, to };
    cursor = to;
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

// موضع المشارك: المرحلة النشطة، وإلا أول مرحلة إلزامية لم تكتمل (مقفلة بانتظار اعتماد مثلًا). -1: أنهى الرحلة
export function positionOf(journey) {
  const active = journey.findIndex((s) => s.status === 'active');
  if (active >= 0) return active;
  return journey.findIndex((s) => s.status !== 'done' && (s.stage_mode || 'required') === 'required');
}

// متى دخل مرحلته: أحدث تاريخ إتمام معروف لما قبلها (بنود الرحلة، وإتمام الملف والقياس والاعتماد)، وإلا تسجيله
export function stageEntry(journey, idx, dates = []) {
  let best = null;
  const take = (d) => { if (d && (!best || String(d) > String(best))) best = d; };
  for (const s of journey.slice(0, Math.max(0, idx))) for (const it of s.items || []) take(it.completed_at);
  if (idx > 0) dates.forEach(take);
  return best;
}

// ما ينقصه الآن: أول بند إلزامي لم يكتمل في مرحلته، بنصه كما يراه المشارك
export function needsOf(stage) {
  if (!stage) return null;
  if (stage.status === 'locked') return stage.lock_reason || 'بانتظار فتح المرحلة';
  const it = (stage.items || []).find((x) => x.required && x.status !== 'done') || (stage.items || []).find((x) => x.status !== 'done');
  return it ? renderJourneyText(it.title_ar, { reqs: stage.items }) : null;
}

// people: [{ id, name, created_at, journey, milestones, dates }]
/** @param {{ stages: any[], people: any[], cohort?: any, program?: any, today?: any, list?: boolean, activity?: boolean }} o */
export function journeyMap({ stages, people, cohort = null, program = null, today = new Date(), list = false, activity = false }) {
  const keys = stages.map((s) => s.key);
  const windows = stageWindows(stages, cohort || {});
  const t = isoDay(today);
  const acc = Object.fromEntries(stages.map((s) => [s.key, { here: 0, done: 0, late: 0, rows: [], reasons: new Map() }]));
  const ms = new Map();
  let finished = 0;
  for (const p of people) {
    const j = (p.journey || []).filter((s) => keys.includes(s.key));
    const idx = positionOf(j);
    const key = idx >= 0 ? j[idx].key : null;
    const pos = key ? keys.indexOf(key) : keys.length;
    if (!key) finished += 1;
    for (let i = 0; i < pos; i++) acc[keys[i]].done += 1;
    if (key) {
      const s = stages[pos];
      const a = acc[key];
      a.here += 1;
      const entry = stageEntry(j, idx, p.dates || []) || p.created_at || null;
      const days = entry ? Math.max(0, daysBetween(isoDay(entry), t)) : 0;
      const d = Number(s.duration_days) || 0;
      const late = d > 0 && days > d + STAGE_GRACE_DAYS;
      if (late) a.late += 1;
      const needs = needsOf(j[idx]);
      if (needs) a.reasons.set(needs, (a.reasons.get(needs) || 0) + 1);
      a.rows.push({ id: p.id, name: p.name, days, late, needs: activity ? needs : null });
    }
    for (const m of p.milestones || []) {
      const x = ms.get(m.id) || { id: m.id, title: m.title_ar, due: m.due || null, done: 0, late: 0, sort: m.sort ?? 0 };
      if (m.done) x.done += 1;
      if (m.status === 'late') x.late += 1;
      if (!x.due && m.due) x.due = m.due;
      ms.set(m.id, x);
    }
  }
  const out = stages.map((s) => {
    const a = acc[s.key];
    const row = { key: s.key, title: s.title_ar, phase: s.phase || 'qualification', duration_days: Number(s.duration_days) || 0,
      here: a.here, done: a.done, late: a.late, window: windows[s.key] || null };
    // الأسماء لصلاحية «القائمة» وحدها، الأطول مكوثًا أولًا. وبدونها أسباب مجمّعة بلا أسماء (أكثرها أولًا)
    if (list) row.people = a.rows.sort((x, y) => y.days - x.days || String(x.name).localeCompare(String(y.name), 'ar'));
    else row.reasons = [...a.reasons].map(([text, count]) => ({ text, count })).sort((x, y) => y.count - x.count).slice(0, 5);
    return row;
  });
  const peak = out.reduce((b, s) => (s.here > (b?.here || 0) || (s.here === b?.here && s.late > b.late) ? s : b), null);
  return {
    program: program ? { name: program.name } : null,
    cohort: cohort ? { name: cohort.name, starts_on: cohort.starts_on || null, today_stage: todayStage(stages, windows, today) } : null,
    totals: { total: people.length, finished, late: out.reduce((n, s) => n + s.late, 0), not_started: 0 },
    bottleneck: peak && peak.here > 0 ? { stage: peak.key } : null,
    stages: out,
    milestones: [...ms.values()].sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.sort - b.sort)
      .map(({ sort, ...m }) => m),
  };
}
