// المسار المستمر (T1، تصور 2026-11-18 ب5.1): التوجيه على رأس العمل يبدأ بعد التدريب بيوم ويمتد حتى نهاية الدفعة بجانب
// المراحل، فلا يؤخر ما بعده ولا يقفله إلا «التقرير النهائي» (due_before)، ولا يُعد في «X من Y» ولا في التقدم، ونهايته
// لكل دفعة (until) بمعاينة الأثر، وحراس القواعد بالعربية.
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cohortPlan, planDaysOnly, planSpanDays, todayStages, trackWindows, withGroups } from '../../supabase/functions/leaders-api/stage-windows.js';
import { cleanStageRules, resolveStages, stageRuleSummary, stageRules, stageRulesIssues, untilOptions, withCandidates } from '../../supabase/functions/leaders-api/journey.js';
import { cleanScheduleReport, distributeSchedule, lateNoticeAllowed, milestoneStatuses } from '../../supabase/functions/leaders-api/milestones.js';
import { impactLines, impactSummary, planEdit, planImpact, planNotice, planWithCandidates, planWithIssues } from '../../supabase/functions/leaders-api/cohort-plan.js';
import { currentStages, journeyMap, positionOf } from '../../supabase/functions/leaders-api/journey-map.js';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { cohortDefinition, journeyProgress } from '../../supabase/functions/leaders-api/logic.js';
import { cohortTimeline, historyRows, journeyHeader, journeyKpis, journeyLanes, planBody, planDraft } from '../../admin-app/src/cohort-journey.js';
import { formToStage, stageFields, stageToForm } from '../../admin-app/src/methodology.js';
import { pathOf } from './screens/Paywall.jsx';
import { heroNow, phaseRail } from './screens/Journey.jsx';
import { MAIL_GUARD_ACTIONS, PLAN_ACTIONS, planCutoffFor, planGuard } from '../../supabase/functions/leaders-api/cohort-plan.js';
import { POST_IN_TRACK_AR, postInTrack } from '../../supabase/functions/leaders-api/journey.js';
import JourneyTimeline from '../../shared/ui/JourneyTimeline.jsx';
import { COHORTS, MILESTONES, REQS, STAGES } from './journey-legacy.cases.js';

// البذرة كما تُضبط من اللوحة بعد قراءة الإنتاج (ب5.1)
const SEED = { lane: 'track', unlock: 'with', with: 'training', offset: 1, until: 'journey_end', due_before: 'report' };
const TRACK = STAGES.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: SEED } : s));
const C = COHORTS.dated; // 2026-11-04 إلى 2027-04-30
const item = (id, status) => ({ id, code: id.toUpperCase(), title_ar: `بند ${id}`, required: true, status });
const journeyOf = (stages, done, overrides = {}) => resolveStages([...stages].sort((a, b) => a.sort - b.sort).map((s) => {
  const items = REQS.filter((r) => r.stage_key === s.key).map((r) => ({ ...item(r.id, done.has(r.id) ? 'done' : 'pending'), required: r.required }));
  return { ...s, items, done: items.filter((i) => i.status === 'done').length, total: items.length };
}), { overrides: { approval: 'complete', ...overrides }, cohortStart: C.starts_on, today: '2026-12-15' });
const ALL_BUT_OJT = new Set(REQS.map((r) => r.id).filter((k) => !k.startsWith('o-') && k !== 'r-get'));

describe('النافذة: من التدريب +1 حتى نهاية الدفعة، والسلسلة كأن المسار ليس فيها', () => {
  const p = cohortPlan(TRACK, C);
  const off = cohortPlan(STAGES, { ...C, schedule: { ojt_coaching: { off: true } } });
  it('يبدأ اليوم التالي لبداية التدريب وينتهي بنهاية الدفعة في ملفها', () => {
    const tr = p.byKey.training, o = p.byKey.ojt_coaching;
    expect(tr.from).toBe('2026-11-06');
    expect([o.lane, o.from, o.to, o.until, o.with, o.offset]).toEqual(['track', '2026-11-07', '2027-04-30', 'journey_end', 'training', 1]);
    expect(o.days).toBe(175);
    expect(p.windows.ojt_coaching).toEqual({ from: '2026-11-07', to: '2027-04-30' });
    expect(p.tracks).toEqual(['ojt_coaching']);
  });
  it('لا يؤخر ما بعده: كل مرحلة متتابعة بتاريخها كما لو لم يكن، والنهاية والمدة من السلسلة وحدها', () => {
    for (const s of STAGES.filter((x) => x.key !== 'ojt_coaching')) expect([s.key, p.byKey[s.key].from, p.byKey[s.key].to]).toEqual([s.key, off.byKey[s.key].from, off.byKey[s.key].to]);
    expect(p.byKey.consulting.from).toBe('2026-12-04');
    expect([p.end, p.total_days]).toEqual([off.end, off.total_days]);
    expect(planSpanDays(TRACK)).toBe(planSpanDays(STAGES.filter((s) => s.key !== 'ojt_coaching')));
  });
  it('خارج المجموعات وموقع اليوم: ليس «مرحلة اليوم» ولا يمد نهاية الرحلة', () => {
    expect(withGroups(TRACK).flat().map((s) => s.key)).not.toContain('ojt_coaching');
    expect(todayStages(TRACK, p.windows, '2026-12-15')).toEqual(['consulting']);
    expect(todayStages(TRACK, p.windows, '2027-04-30')).toEqual(['report']);
    expect(todayStages(TRACK, p.windows, '2027-05-10')).toEqual([]);
  });
  it('بلا تواريخ (المفتوحة أو بلا بداية): ينتهي بنهاية السلسلة بالأيام النسبية', () => {
    const open = cohortPlan(TRACK, { starts_on: '2000-01-02', schedule: {} });
    expect(open.byKey.ojt_coaching.to).toBe(open.end);
    expect(cohortPlan(TRACK, COHORTS.open).byKey.ojt_coaching.from).toBe(null);
  });
  it('بلا تواريخ: المدة نسبية إلى نهاية السلسلة كما يرسمها الخط، لا مدة البرنامج (28)', () => {
    for (const c of [COHORTS.undated, COHORTS.open]) {
      const rel = cohortPlan(TRACK, { starts_on: '2000-01-02', schedule: planDaysOnly(c.schedule) }).byKey.ojt_coaching;
      const x = cohortPlan(TRACK, c).byKey.ojt_coaching;
      expect([x.from, x.to]).toEqual([null, null]);
      expect(x.days).toBe(rel.days);
      expect(x.days).not.toBe(28);
      expect(trackWindows(TRACK, c).ojt_coaching.days).toBe(x.days);
    }
    // والخط يرسم الدفعة بلا تاريخ بالخطة نفسها من بدايته الافتراضية، فالمدة واحدة
    const tl = journeyTimeline({ stages: TRACK, requirements: REQS, cohort: COHORTS.undated });
    expect(tl.tracks[0].label).toBe('6 أشهر');
    expect(cohortPlan(TRACK, COHORTS.undated).byKey.ojt_coaching.days).toBe(166);
    // بنهاية بمدته لا يتغير شيء: مدته هي
    const days = STAGES.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: { ...SEED, until: 'days' } } : s));
    expect(cohortPlan(days, COHORTS.undated).byKey.ojt_coaching.days).toBe(28);
  });
  it('تنبيه واحد chain_end_mismatch إن انتهت السلسلة قبل نهاية الدفعة، وover_end كما هو بعدها', () => {
    const early = cohortPlan(TRACK, { ...C, ends_on: '2027-06-30' });
    expect(early.issues.filter((x) => x.code === 'chain_end_mismatch')).toHaveLength(1);
    expect(early.issues.find((x) => x.code === 'chain_end_mismatch').msg).toContain('يمتد إلى نهاية الدفعة');
    expect(early.byKey.ojt_coaching.to).toBe('2027-06-30');
    expect(p.issues.map((x) => x.code)).toEqual(['over_end']);
  });
  it('نهايات أخرى: مدته، ونهاية طور، ونهاية مرحلة، ومن خطة الدفعة فوق قاعدة النسخة', () => {
    const at = (until, sched = {}) => cohortPlan(STAGES.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: { ...SEED, until } } : s)), { ...C, schedule: sched }).byKey.ojt_coaching;
    expect(at('days').to).toBe('2026-12-04');
    expect(at('phase:qualification').to).toBe(p.byKey.leadership_coaching.to);
    expect(at('stage:support').to).toBe(p.byKey.support.to);
    const own = at('journey_end', { ojt_coaching: { until: 'stage:support' } });
    expect([own.to, own.until_source]).toEqual([p.byKey.support.to, 'cohort']);
  });
  it('trackWindows لرحلة المشارك من الخطة نفسها، و{} لبرنامج بلا مسار', () => {
    expect(trackWindows(TRACK, C).ojt_coaching).toMatchObject({ from: '2026-11-07', to: '2027-04-30', due_before: 'report', with: 'training' });
    expect(trackWindows(STAGES, C)).toEqual({});
  });
  it('التوزيع النسبي لا يعطيه نصيبًا من السلسلة', () => {
    expect(distributeSchedule(TRACK, C.starts_on, C.ends_on).ojt_coaching).toEqual({ start: C.starts_on, end: C.ends_on });
  });
});

describe('الفتح: التقرير وحده ينتظر بنود المسار الإلزامية، والدعم والتقييم لا ينتظران', () => {
  it('أنهى كل شيء إلا التوجيه: الدعم والتقييم مفتوحان، والتقرير مقفل باسمه', () => {
    const j = journeyOf(TRACK, ALL_BUT_OJT);
    const by = Object.fromEntries(j.map((s) => [s.key, s]));
    expect(by.ojt_coaching.status).toBe('active');
    expect(by.ojt_coaching.lane).toBe('track');
    expect(by.support.status).toBe('done');
    expect(by.evaluation.status).toBe('done');
    expect(by.report.status).toBe('locked');
    expect(by.report.lock_reason).toContain('مرحلة ojt_coaching');
  });
  it('في البرنامج القديم (مرحلة متتابعة) كان الدعم ينتظره، وبعد اكتمال بنوده يُفتح التقرير', () => {
    const old = Object.fromEntries(journeyOf(STAGES, ALL_BUT_OJT).map((s) => [s.key, s.status]));
    expect(old.support).toBe('locked');
    const done = new Set([...ALL_BUT_OJT, 'o-mreg', 'o-breg']);
    expect(journeyOf(TRACK, done).find((s) => s.key === 'report').status).toBe('active');
    // المسار المتجاوَز بيد الأدمن يُعد مستوفى
    expect(journeyOf(TRACK, ALL_BUT_OJT, { ojt_coaching: 'skip' }).find((s) => s.key === 'report').status).toBe('active');
  });
  it('مقفل حتى يبدأ التدريب، ومفتوح مع بدايته', () => {
    const j = journeyOf(TRACK, new Set(['p-info']), { approval: null });
    expect(j.find((s) => s.key === 'ojt_coaching').status).toBe('locked');
    const k = journeyOf(TRACK, new Set(['p-info', 'a-done']), { approval: 'complete' });
    expect(k.find((s) => s.key === 'training').status).toBe('active');
    expect(k.find((s) => s.key === 'ojt_coaching').status).toBe('active');
  });
});

describe('«X من Y» والتقدم والموضع لا تعد المسار', () => {
  const j = journeyOf(TRACK, new Set(['p-info', 'a-done', 't-att', 't-hb']), { approval: 'complete' });
  it('الموضع المرحلة المتتابعة الجارية لا المسار، والتقدم بلا المسار', () => {
    expect(j.find((s) => s.key === 'ojt_coaching').status).toBe('active');
    expect(j[positionOf(j)].key).toBe('support');
    expect(currentStages(j).stages.map((s) => s.key)).not.toContain('ojt_coaching');
    const seq = j.filter((s) => s.key !== 'ojt_coaching');
    expect(journeyProgress(j)).toBe(journeyProgress(seq));
  });
  it('شريط الأطوار: التأهيل منجز والمسار فيه جارٍ، والأثر وحده جارٍ', () => {
    // التأهيل بلا مراحل «عند الطلب» (تُعرض متاحة فتضيء طورها كما كانت)، فيُرى أثر المسار وحده
    const plain = TRACK.filter((s) => !['consulting', 'leadership_coaching'].includes(s.key));
    const k = journeyOf(plain, new Set(['p-info', 'a-done', 't-att', 't-hb']), { approval: 'complete' });
    expect(Object.fromEntries(k.map((s) => [s.key, s.status]))).toMatchObject({ training: 'done', ojt_coaching: 'active', support: 'active' });
    const rail = Object.fromEntries(phaseRail(k).map((x) => [x.key, x.state]));
    expect(rail.qualification).toBe('done');
    expect(Object.values(rail).filter((x) => x === 'on')).toHaveLength(1);
    expect(rail.impact).toBe('on');
  });
  it('الرأس: إن لم يبق إلا المسار نشطًا والتقرير ينتظره، فهو ما يُشار إليه', () => {
    const k = journeyOf(TRACK, ALL_BUT_OJT);
    expect(Object.fromEntries(k.map((s) => [s.key, s.status]))).toMatchObject({ ojt_coaching: 'active', report: 'locked' });
    const h = heroNow(k);
    expect([h.now.length, h.tracksNow.map((s) => s.key), h.current?.key]).toEqual([0, ['ojt_coaching'], 'ojt_coaching']);
    // وفي منتصف الرحلة المرحلة الحالية متتابعة كما كانت
    expect(heroNow(j).current.key).toBe('support');
    expect(heroNow(j).tracksNow).toEqual([]);
  });
  it('مسار الدفع: عدد المراحل وأسماؤها بلا المسار، والمدة بلا امتداده', () => {
    const p = pathOf(j);
    expect(p.stages).toBe(9);
    expect(p.titles).not.toContain('مرحلة ojt_coaching');
    expect(p.weeks).toBe(Math.round(planSpanDays(j.filter((s) => s.key !== 'ojt_coaching')) / 7));
  });
  it('الخريطة: من في المسار «هنا» بحالته، ولا يُعد متجاوزًا له قبل اكتماله', () => {
    const m = journeyMap({ stages: TRACK, people: [{ id: 'x', name: 'س', status: 'enrolled', created_at: '2026-11-04', journey: j }], cohort: C, today: new Date('2026-12-15T10:00:00Z') });
    const o = m.stages.find((s) => s.key === 'ojt_coaching');
    expect([o.here, o.done]).toEqual([1, 0]);
    expect(m.cohort.today_stages).not.toContain('ojt_coaching');
  });
});

describe('المعالم: نهاية المسار موعد معلمه، وحارس R0 كما هو', () => {
  it('معلم «نهاية التوجيه» يستحق بنهاية الدفعة لا بعد أربعة أسابيع، ومصدره النافذة', () => {
    const ms = milestoneStatuses(MILESTONES, { cohort: C, stages: TRACK, today: '2026-12-15' });
    const m = ms.find((x) => x.id === 'm-ojt');
    expect([m.due, m.due_source]).toEqual(['2027-05-03', 'window']);
    const sup = ms.find((x) => x.id === 'm-sup');
    const old = milestoneStatuses(MILESTONES, { cohort: { ...C, schedule: { ojt_coaching: { off: true } } }, stages: STAGES, today: '2026-12-15' }).find((x) => x.id === 'm-sup');
    expect(sup.due).toBe(old.due);
  });
  it('حارس البريد يقرأ ترقية الدفعة كحفظ خطة حرّك كل معالمها يومها، وتراجع الخطة لا يقرؤها', () => {
    expect(MAIL_GUARD_ACTIONS).toEqual([...PLAN_ACTIONS, 'cohort.upgrade']);
    expect(PLAN_ACTIONS).not.toContain('cohort.upgrade');
    const g = planGuard([{ created_at: '2026-12-10T09:00:00Z', after: { from: 1, to: 2, affected: 0, dropped: [] } }]);
    expect(g.all).toBe('2026-12-10');
    const cut = planCutoffFor('2026-11-17', g, 'm-sup');
    // موعد صار في الماضي بالترقية لا يُرسل عنه، وما يتأخر بعدها يُرسل كالمعتاد
    expect(lateNoticeAllowed({ status: 'late', late_days: 9, due_source: 'window', due: '2026-12-01' }, 3, cut)).toBe(false);
    expect(lateNoticeAllowed({ status: 'late', late_days: 9, due_source: 'window', due: '2026-12-20' }, 3, cut)).toBe(true);
  });
  it('حارس البريد: معلم نافذة صار متأخرًا قبل يوم R0 لا يُرسل عنه', () => {
    expect(lateNoticeAllowed({ status: 'late', late_days: 9, due_source: 'window', due: '2026-11-01' })).toBe(false);
    expect(lateNoticeAllowed({ status: 'late', late_days: 9, due_source: 'window', due: '2026-12-01' }, 3, '2026-11-17')).toBe(true);
  });
});

describe('القواعد في البرنامج: الحفظ والفحص والجملة', () => {
  it('البذرة تُحفظ كما هي، والافتراضيان يُكتبان صراحة', () => {
    expect(cleanStageRules(SEED, STAGES, 'ojt_coaching')).toEqual(SEED);
    expect(cleanStageRules({ lane: 'track', unlock: 'with', with: 'training' }, STAGES, 'ojt_coaching')).toEqual({ unlock: 'with', with: 'training', lane: 'track', until: 'journey_end', due_before: 'report' });
    // بلا تقرير في البرنامج لا شرط
    const noReport = STAGES.filter((s) => s.key !== 'report');
    expect(cleanStageRules({ lane: 'track', unlock: 'with', with: 'training' }, noReport, 'ojt_coaching').due_before).toBeUndefined();
    // الإزاحة بلا سقف بمدة المرجع، والمرجع من محور آخر
    expect(cleanStageRules({ ...SEED, offset: 60, with: 'approval' }, STAGES, 'ojt_coaching')).toMatchObject({ with: 'approval', offset: 60 });
  });
  it('الرفض برسالة عربية', () => {
    const bad = (r, key = 'ojt_coaching') => { try { cleanStageRules(r, TRACK, key); return null; } catch (e) { return e.message; } };
    expect(bad({ lane: 'track' })).toContain('يبدأ مع مرحلة قبله');
    expect(bad({ ...SEED, until: 'forever' })).toContain('نهاية المسار');
    expect(bad({ ...SEED, until: 'stage:nope' })).toContain('غير موجودة');
    expect(bad({ ...SEED, due_before: 'ojt_coaching' })).toContain('لا يشترط نفسه');
    expect(bad({ ...SEED, due_before: 'profile' })).toContain('بوابات القبول');
    expect(bad({ ...SEED, unlock: 'with', with: 'training' }, 'approval')).toContain('بوابات القبول');
    // الخدمة تُحفظ منذ T2، وتُرفض «تبدأ مع» لها (journey-service.test.js)
    expect(bad({ lane: 'service', unlock: 'with', with: 'training' }, 'consulting')).toContain('الخدمة لا تبدأ مع مرحلة');
    expect(bad({ lane: 'x' })).toContain('طبيعة المرحلة');
    expect(bad({ unlock: 'with', with: 'ojt_coaching' }, 'consulting')).toContain('مسار مستمر');
  });
  it('القياس البعدي لا يكون في مسار مستمر: postInTrack لحفظ النسخة', () => {
    const post = { id: 'x', code: 'E-POST', stage_key: 'evaluation', active: true };
    expect(postInTrack(TRACK, [...REQS, post])).toBe(null);
    expect(postInTrack(TRACK, [...REQS, { ...post, stage_key: 'ojt_coaching' }])).toBe('ojt_coaching');
    expect(postInTrack(TRACK, [...REQS, { ...post, stage_key: 'ojt_coaching', active: false }])).toBe(null);
    expect(postInTrack(STAGES, [...REQS, { ...post, stage_key: 'ojt_coaching' }])).toBe(null);
    expect(POST_IN_TRACK_AR).toContain('القياس البعدي');
  });
  it('الفحص: لا خطأ في البذرة، والحلقة عبر due_before خطأ يمنع النشر', () => {
    expect(stageRulesIssues(TRACK).filter((x) => x.level === 'error')).toEqual([]);
    const loop = TRACK.map((s) => (s.key === 'ojt_coaching' ? { ...s, rules: { ...SEED, due_before: 'training' } } : s));
    const err = stageRulesIssues(loop).find((x) => /حلقة/.test(x.msg));
    expect(err.rule).toBe('due_before');
  });
  it('المراجع والنهايات والجملة', () => {
    expect(withCandidates(TRACK, 'ojt_coaching').map((s) => s.key)).toEqual(['profile', 'assessment', 'approval', 'training']);
    expect(withCandidates(TRACK, 'leadership_coaching').map((s) => s.key)).not.toContain('ojt_coaching');
    expect(Object.keys(untilOptions(TRACK, 'ojt_coaching'))).toEqual(expect.arrayContaining(['journey_end', 'days', 'phase:impact', 'stage:report']));
    expect(stageRuleSummary(TRACK[4], TRACK)).toBe('مسار مستمر · تُفتح مع بداية «مرحلة training»، ومخطط بعد يوم واحد من بدايتها · يمتد حتى نهاية الرحلة · بنوده الإلزامية مطلوبة قبل «مرحلة report» وحدها');
    expect(stageRules(STAGES[4])).not.toHaveProperty('lane');
  });
  it('نموذج المرحلة في اللوحة يضبط الطبيعة والنهاية وما يشترطه', () => {
    const f = stageToForm(TRACK[4]);
    expect([f.rule_lane, f.rule_with_track, f.rule_until, f.rule_due_before]).toEqual(['track', 'training', 'journey_end', 'report']);
    expect(formToStage({ ...f, rule_until: 'stage:support' }).rules).toEqual({ ...SEED, mode: 'required', complete: 'required', until: 'stage:support' });
    const back = formToStage({ ...f, rule_lane: 'stage', rule_unlock: 'previous' }).rules;
    expect(back).toEqual({ mode: 'required', unlock: 'previous', complete: 'required' });
    // العودة إلى «مرحلة متتابعة» بتغيير الطبيعة وحده: قاعدة صالحة يقبلها الخادم، لا «تبدأ مع» بلا مرجع
    const only = formToStage({ ...f, rule_lane: 'stage' }).rules;
    expect(only).toEqual({ mode: 'required', unlock: 'previous', complete: 'required' });
    expect(() => cleanStageRules(only, TRACK, 'ojt_coaching')).not.toThrow();
    // والمرحلة المتتابعة «تبدأ مع» تبقى كما هي
    const w = stageToForm({ ...TRACK[4], rules: { unlock: 'with', with: 'training', offset: 1 } });
    expect([w.rule_lane, w.rule_unlock, w.rule_with]).toEqual(['stage', 'with', 'training']);
    const names = stageFields([], TRACK, 'ojt_coaching').map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['rule_lane', 'rule_with_track', 'rule_until', 'rule_due_before']));
    expect(stageFields([], TRACK, 'profile').find((x) => x.name === 'rule_lane').show({})).toBe(false);
  });
});

describe('خطة الدفعة: نهاية المسار لهذه الدفعة بمعاينة الأثر، والحقول المجهولة مرفوضة', () => {
  const def = cohortDefinition({ live: { stages: TRACK, requirements: REQS }, version: null, cohort: C });
  it('until يُكتب في الخطة، وما يساوي قاعدة النسخة لا يُكتب، وnull يعيدها', () => {
    const r = planEdit({ stages: def.stages, schedule: {}, edit: { until: { ojt_coaching: 'stage:support' } }, cohort: C });
    expect([r.errors, r.schedule]).toEqual([[], { ojt_coaching: { until: 'stage:support' } }]);
    expect(planEdit({ stages: def.stages, schedule: r.schedule, edit: { until: { ojt_coaching: null } }, cohort: C }).schedule).toEqual({});
    expect(planEdit({ stages: def.stages, schedule: {}, edit: { until: { ojt_coaching: 'journey_end' } }, cohort: C }).schedule).toEqual({});
  });
  it('الرفض: until لمرحلة متتابعة، وقيمة مجهولة، و«لا شيء» لمرجع المسار', () => {
    const codes = (edit) => planEdit({ stages: def.stages, schedule: {}, edit, cohort: C }).errors.map((e) => e.code);
    expect(codes({ until: { support: 'journey_end' } })).toEqual(['until_alone']);
    expect(codes({ until: { ojt_coaching: 'forever' } })).toEqual(['until_value']);
    expect(codes({ with: { ojt_coaching: false } })).toEqual(['track_with']);
    expect(planWithIssues({ stages: def.stages, schedule: { support: { until: 'days' } }, cohort: C }).map((x) => x.code)).toEqual(['until_alone']);
    expect(() => cleanScheduleReport({ ojt_coaching: { until: 'nope' } }, ['ojt_coaching'])).toThrow('نهاية المسار');
    expect(cleanScheduleReport({ ojt_coaching: { until: 'stage:ghost', junk: 1 } }, ['ojt_coaching']).schedule).toEqual({});
    expect(cleanScheduleReport({ ojt_coaching: { until: 'phase:impact', offset: 3 } }, ['ojt_coaching']).schedule).toEqual({ ojt_coaching: { offset: 3, until: 'phase:impact' } });
  });
  it('مرجع المسار في الدفعة من أي محور، والإزاحة بلا سقف', () => {
    expect(planWithCandidates(def.stages, {}, 'ojt_coaching').map((s) => s.key)).toEqual(['training']);
    const r = planEdit({ stages: def.stages, schedule: {}, edit: { offset: { ojt_coaching: 40 } }, cohort: C });
    expect(r.errors).toEqual([]);
    expect(cohortPlan(def.stages, { ...C, schedule: r.schedule }).byKey.ojt_coaching.from).toBe('2026-12-16');
  });
  it('الأثر: سطر امتداد المسار بلا «يزيح ما بعده»، ولا تتحرك نهاية الرحلة، والبريد يسميه', () => {
    const after = { ojt_coaching: { until: 'stage:support' } };
    const im = planImpact({ stages: def.stages, before: {}, after, cohort: C, milestones: MILESTONES, people: null, today: '2026-12-15' });
    expect(im.changes.map((x) => [x.key, x.track, x.until_changed])).toEqual([['ojt_coaching', true, true]]);
    expect(im.end.shift).toBe(0);
    expect(im.milestones.map((m) => m.id)).toEqual(['m-ojt']);
    const lines = impactLines(im);
    expect(lines[0].text).toBe('مرحلة ojt_coaching (مسار مستمر): يمتد حتى نهاية «مرحلة support»، فيصير من 2026-11-07 إلى 2027-04-14، بدل «يمتد حتى نهاية الرحلة». لا يؤخر ما بعده');
    expect(planNotice(im, (d) => d).body).toContain('تغيّر امتداد «مرحلة ojt_coaching» الذي يسير معك.');
    expect(impactSummary(im).changes[0]).toMatchObject({ key: 'ojt_coaching', track: true, until: ['journey_end', 'stage:support'] });
    expect(historyRows([{ id: 1, at: 'x', action: 'cohort.plan', summary: impactSummary(im) }])[0].text).toBe('مسار مستمر واحد تغيّر امتداده');
  });
});

describe('العرض في اللوحة: صف «مسارات مستمرة» بجانب السلسلة وبطاقته', () => {
  const model = cohortTimeline({ stages: TRACK, requirements: REQS, sessions: [] }, C, '2026-12-15');
  it('الخط: المسار خارج الخانات والمراحل، بشريط على المقياس نفسه من بدايته إلى نهايته', () => {
    expect(model.stages.map((s) => s.key)).not.toContain('ojt_coaching');
    expect(model.slots.flatMap((x) => x.stages)).not.toContain('ojt_coaching');
    const [t] = model.tracks;
    expect([t.key, t.lane_ar, t.status, t.window.from, t.window.to]).toEqual(['ojt_coaching', 'مسار مستمر', 'active', '2026-11-07', '2027-04-30']);
    expect(t.at).toBeGreaterThan(0);
    expect(t.at + t.width).toBeLessThanOrEqual(100.01);
    expect(t.note_ar).toBe('يبدأ بعد يوم واحد من بداية «مرحلة training»، يمتد حتى نهاية الرحلة، ولا يؤخر ما بعده');
    expect(model.activities.filter((a) => a.stage === 'ojt_coaching').map((a) => a.stage_title)).toEqual(['مرحلة ojt_coaching', 'مرحلة ojt_coaching']);
    expect(model.counts.stages).toBe(9);
  });
  it('البطاقات والمؤشرات والرأس ومعلم نهايته', () => {
    const lanes = journeyLanes(model, { def: { stages: TRACK, requirements: REQS }, cohort: C, milestones: MILESTONES });
    expect(lanes.phases.flatMap((p) => p.groups.flatMap((g) => g.stages.map((s) => s.key)))).not.toContain('ojt_coaching');
    const [c] = lanes.tracks;
    expect([c.key, c.lane, c.until_ar, c.due_ar]).toEqual(['ojt_coaching', 'track', 'يمتد حتى نهاية الرحلة', 'بنوده الإلزامية مطلوبة قبل «مرحلة report» وحدها']);
    expect(c.milestones.map((m) => [m.id, m.due])).toEqual([['m-ojt', '2027-05-03']]);
    expect(journeyKpis(model, lanes).find((k) => k.key === 'tracks').value).toBe('مرحلة ojt_coaching');
    expect(journeyHeader(model, { ...C, ends_on: '2027-06-30' }).gap_ar).toContain('والمسار المستمر يمتد إلى نهايتها');
    expect(journeyHeader(model, C).gap_ar).toBeUndefined();
  });
  it('المسودة: صف المسار بنهايته وخياراتها وإزاحة بلا سقف، وجسم الحفظ يحمل until', () => {
    const d = planDraft({ def: { stages: TRACK, requirements: REQS }, cohort: C, edit: { until: { ojt_coaching: 'phase:impact' } } });
    const r = d.rows.ojt_coaching;
    expect([r.track, r.until, r.until_source, r.program_until, r.offset_max, r.edited]).toEqual([true, 'phase:impact', 'cohort', 'journey_end', 365, true]);
    expect(r.until_options['stage:report']).toBe('نهاية «مرحلة report»');
    expect(planBody({ id: 'c1' }, { until: { ojt_coaching: 'days' } }, 'preview')).toMatchObject({ until: { ojt_coaching: 'days' } });
  });
  it('المكوّن يرسم صف «مسارات مستمرة» على الحاسب والهاتف ومفتاحه', () => {
    const html = renderToStaticMarkup(React.createElement(JourneyTimeline, { model }));
    expect(html).toContain('jt-tracks');
    expect(html).toContain('data-track="ojt_coaching"');
    expect(html).toContain('jt-m-tracks');
    expect(html).toContain('مسار مستمر يسير بجانب المراحل');
    const plain = renderToStaticMarkup(React.createElement(JourneyTimeline, { model: cohortTimeline({ stages: STAGES, requirements: REQS, sessions: [] }, C, '2026-12-15') }));
    expect(plain).not.toContain('jt-tracks');
  });
  it('الخط في البرنامج بلا دفعة: المسار نسبي بالأسابيع حتى نهاية السلسلة', () => {
    const m = journeyTimeline({ stages: TRACK, requirements: REQS });
    expect(m.tracks[0].window).toBe(null);
    expect(m.tracks[0].label).toBeTruthy();
  });
});
