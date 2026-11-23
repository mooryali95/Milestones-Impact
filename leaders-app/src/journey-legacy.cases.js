// برنامج بمراحل متتابعة وحدها (بلا lane): مخرجات الحساب كلها كما كانت قبل المسار المستمر (T1، تصور 2026-11-18 ب5.1).
// journey-legacy.snapshot.json كُتب من هذه الحالات على main قبل T1، ويقارنه journey-legacy.test.js بالمخرجات الآن،
// فأي فرق في دفعة قائمة بلا مسار يُرى حرفًا حرفًا. لا تُحدَّث اللقطة إلا بقرار يسمي ما تغير.
import { cohortPlan, planSpanDays, todayStages, withGroups } from '../../supabase/functions/leaders-api/stage-windows.js';
import { cleanStageRules, resolveStages, stageRuleSummary, stageRules, stageRulesIssues, withCandidates } from '../../supabase/functions/leaders-api/journey.js';
import { cleanScheduleReport, distributeSchedule, milestoneStatuses } from '../../supabase/functions/leaders-api/milestones.js';
import { impactLines, planEdit, planImpact, planNotice, planWithCandidates, suggestDays } from '../../supabase/functions/leaders-api/cohort-plan.js';
import { currentStages, journeyMap, positionOf } from '../../supabase/functions/leaders-api/journey-map.js';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { cohortDefinition, journeyProgress } from '../../supabase/functions/leaders-api/logic.js';
import { cohortTimeline, journeyHeader, journeyLanes, planDraft } from '../../admin-app/src/cohort-journey.js';

const S = (key, sort, days, phase, rules = null) => ({ key, sort, title_ar: `مرحلة ${key}`, duration_days: days, phase, active: true, ...(rules ? { rules } : {}) });
// البرنامج كما في البذرة بترتيبه ومدده، والتوجيه مرحلة متتابعة كما هو اليوم
export const STAGES = [
  S('profile', 1, 0, 'admission'), S('assessment', 2, 0, 'admission'), S('approval', 3, 2, 'admission'),
  S('training', 4, 28, 'qualification'), S('ojt_coaching', 5, 28, 'qualification'),
  S('consulting', 6, 14, 'qualification', { mode: 'on_demand' }), S('leadership_coaching', 7, 28, 'qualification', { mode: 'on_demand' }),
  S('support', 8, 90, 'impact'), S('evaluation', 9, 14, 'impact'), S('report', 10, 7, 'impact'),
];
// والبديل الممكن اليوم (أ2): التوجيه يسير مع التدريب بعد يوم
export const STAGES_WITH = STAGES.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: { unlock: 'with', with: 'training', offset: 1 } } : s));
const R = (id, stage_key, required = true, kind = 'upload') => ({ id, code: id.toUpperCase(), stage_key, kind, required, title_ar: `بند ${id}`, active: true, sort: 1, config: {} });
export const REQS = [
  R('p-info', 'profile', true, 'system'), R('a-done', 'assessment', true, 'system'), R('t-att', 'training', true, 'workshop'), R('t-hb', 'training'),
  R('o-mreg', 'ojt_coaching'), R('o-breg', 'ojt_coaching'), R('c-meet', 'consulting', false, 'meeting'), R('l-plan', 'leadership_coaching'),
  R('s-rep', 'support'), R('e-post', 'evaluation', true, 'system'), R('r-get', 'report', true, 'system'),
];
const M = (id, stage_key, anchor, offset_days = 0, extra = {}) => ({ id, title_ar: `معلم ${id}`, stage_key, anchor, offset_days, complete: stage_key ? 'stage' : 'manual', active: true, sort: 1, ...extra });
export const MILESTONES = [
  M('m-train', 'training', 'stage_end'), M('m-ojt', 'ojt_coaching', 'stage_end', 3), M('m-sup0', 'support', 'stage_start', 7),
  M('m-sup', 'support', 'stage_end'), M('m-rep', 'report', 'stage_end'), M('m-end', null, 'cohort_end', -7), M('m-date', null, 'date', 0, { fixed_date: '2027-01-15' }),
];
export const COHORTS = {
  dated: { id: 'c1', name: 'دفعة', starts_on: '2026-11-04', ends_on: '2027-04-30', schedule: {} },
  edited: { id: 'c2', name: 'دفعة', starts_on: '2026-11-04', ends_on: '2027-04-30', schedule: { training: { days: 21 }, consulting: { off: true }, support: { days: 60 } } },
  par: { id: 'c3', name: 'دفعة', starts_on: '2026-11-04', ends_on: '2027-03-01', schedule: { ojt_coaching: { with: 'training', offset: 1 } } },
  pinned: { id: 'c4', name: 'دفعة', starts_on: '2026-11-04', ends_on: '2027-04-30', schedule: { support: { start: '2027-01-10', end: '2027-03-31' } } },
  open: { id: 'c5', name: 'المفتوحة', is_default: true, starts_on: '2026-11-04', schedule: { training: { days: 14 }, support: { start: '2027-01-01', days: 30 } } },
  undated: { id: 'c6', name: 'بلا تاريخ', schedule: { training: { days: 14 } } },
};
const TODAYS = ['2026-11-01', '2026-11-20', '2026-12-15', '2027-02-01', '2027-06-01'];
const item = (id, status, completed_at = null) => ({ id, code: id.toUpperCase(), title_ar: `بند ${id}`, required: true, status, completed_at });
// تقدم مشارك: المنجز من البنود بمفاتيحها
const PROGRESS = {
  fresh: new Set(['p-info']),
  training: new Set(['p-info', 'a-done']),
  ojt: new Set(['p-info', 'a-done', 't-att', 't-hb']),
  support: new Set(['p-info', 'a-done', 't-att', 't-hb', 'o-mreg', 'o-breg']),
  report: new Set(['p-info', 'a-done', 't-att', 't-hb', 'o-mreg', 'o-breg', 's-rep', 'e-post']),
  done: new Set(REQS.map((r) => r.id)),
};
const withItems = (stages, done) => [...stages].sort((a, b) => a.sort - b.sort).map((s) => {
  const items = REQS.filter((r) => r.stage_key === s.key).map((r) => ({ ...item(r.id, done.has(r.id) ? 'done' : 'pending', done.has(r.id) ? '2026-11-10T09:00:00Z' : null), required: r.required }));
  return { ...s, items, done: items.filter((i) => i.status === 'done').length, total: items.length };
});

export function legacyOutputs() {
  const out = {};
  for (const [pn, stages] of Object.entries({ seq: STAGES, with: STAGES_WITH })) {
    const p = (out[pn] = {});
    p.rules = stages.map((s) => ({ key: s.key, rules: stageRules(s), summary: stageRuleSummary(s, stages), with: withCandidates(stages, s.key).map((x) => x.key) }));
    p.issues = stageRulesIssues(stages);
    p.clean = stages.map((s) => { try { return cleanStageRules(s.rules || {}, stages, s.key); } catch (e) { return { error: e.message }; } });
    p.span = planSpanDays(stages);
    p.groups = withGroups(stages).map((g) => g.map((s) => s.key));
    p.distribute = distributeSchedule(stages, '2026-11-04', '2027-04-30');
    p.suggest = suggestDays(stages, '2026-11-04', '2027-04-30', {});
    p.program_timeline = journeyTimeline({ stages, requirements: REQS }, { today: '2026-12-15' });
    p.cohorts = {};
    for (const [cn, cohort] of Object.entries(COHORTS)) {
      const c = (p.cohorts[cn] = {});
      const def = cohortDefinition({ live: { stages, requirements: REQS }, version: null, cohort });
      c.def_stages = def.stages;
      c.plan = cohortPlan(stages, cohort);
      c.span = planSpanDays(def.stages);
      c.today = TODAYS.map((t) => todayStages(stages, c.plan.windows, t));
      c.with_candidates = stages.map((s) => planWithCandidates(stages, cohort.schedule, s.key).map((x) => x.key));
      c.milestones = TODAYS.map((t) => milestoneStatuses(MILESTONES, { stagesDone: new Set(['profile', 'assessment', 'approval', 'training']), records: {}, cohort, stages, today: t }));
      c.journeys = {};
      for (const [jn, done] of Object.entries(PROGRESS)) {
        const j = resolveStages(withItems(def.stages, done), { overrides: jn === 'support' ? { approval: 'complete' } : {}, cohortStart: cohort.is_default ? null : cohort.starts_on || null, today: '2026-12-15' });
        c.journeys[jn] = { j, progress: journeyProgress(j), pos: positionOf(j), cur: currentStages(j) };
      }
      const people = Object.entries(c.journeys).map(([jn, x], i) => ({ id: `p${i}`, name: `مشارك ${jn}`, status: 'enrolled', created_at: '2026-11-04T00:00:00Z', journey: x.j, milestones: [] }));
      // here_by_group وlate_by_group إضافة (2026-11-23) لعدّ من في مرحلتين تسيران معًا مرة واحدة، لا تغيّر حقلًا قائمًا؛
      // تُفصل عن اللقطة وتُفحص في journey-map-groups.test.js، وكل ما سواها مقفل كما كان
      const full = journeyMap({ stages: def.stages, people, cohort, today: new Date('2026-12-15T10:00:00Z'), list: true, activity: true });
      const { here_by_group: _hg, late_by_group: _lg, ...mapOut } = full;
      c.map = mapOut;
      Object.defineProperty(c, 'mapFull', { value: full, enumerable: false });
      c.timeline = journeyTimeline({ stages, requirements: REQS }, { cohort, today: '2026-12-15' });
      const model = cohortTimeline({ stages, requirements: REQS, sessions: [] }, cohort, '2026-12-15');
      c.lanes = journeyLanes(model, { def: { stages, requirements: REQS }, cohort, milestones: MILESTONES });
      c.header = journeyHeader(model, cohort);
      const edit = { days: { training: 35 }, off: { leadership_coaching: true }, with: {}, offset: {} };
      const dr = planDraft({ def: { stages, requirements: REQS }, cohort, edit });
      c.draft = { schedule: dr.schedule, errors: dr.errors, rows: dr.rows, edits: dr.edits, issues: dr.issues };
      const ed = planEdit({ stages: def.stages, schedule: cohort.schedule, edit, cohort, requirements: REQS });
      c.edit = ed;
      const pi = planImpact({ stages: def.stages, before: cohort.schedule, after: ed.schedule, cohort, milestones: MILESTONES, people: null, today: '2026-12-15' });
      c.impact = pi;
      c.impact_lines = impactLines(pi);
      c.notice = planNotice(pi, (d) => d);
      c.clean_schedule = cleanScheduleReport({ ...cohort.schedule, ghost: { days: 3 }, training: { days: '٢١', junk: 1 } }, stages.map((s) => s.key));
    }
  }
  return out;
}
