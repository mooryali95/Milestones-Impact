// الخدمة (T2، تصور 2026-11-18 ب5.2): الاستشارة «خاصية لمن يريد، وليست مرحلة تأتي بعد شيء». تُتاح من بعد اعتماد المستوى
// حتى نهاية الرحلة، فلا نافذة لها في خطة الدفعة ولا أيام، ولا تقفل شيئًا، ولا تُعد في «X من Y» ولا في التقدم، ولا يُشترط
// اكتمالها. وتبقى في الرحلة بحقل lane فيجدها الحجز وفتح الجلسات. وحد الجلسات max_sessions يخفي زر الحجز عند بلوغه.
import { describe, expect, it } from 'vitest';
import { cohortPlan, planSpanDays, todayStages, withGroups } from '../../supabase/functions/leaders-api/stage-windows.js';
import {
  cleanStageRules, isService, postInService, resolveStages, serviceAvailAr, sessionsMaxAr, stageRuleSummary, stageRules, stageRulesIssues, untilOptions, withCandidates,
} from '../../supabase/functions/leaders-api/journey.js';
import { distributeSchedule, milestoneStatuses } from '../../supabase/functions/leaders-api/milestones.js';
import { planEdit, planImpact, planWithCandidates, suggestDays } from '../../supabase/functions/leaders-api/cohort-plan.js';
import { currentStages, journeyMap, positionOf, serviceUsed } from '../../supabase/functions/leaders-api/journey-map.js';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { bookingOverMax, cleanConfig, coachingStatus, cohortDefinition, journeyProgress, sessionsMax } from '../../supabase/functions/leaders-api/logic.js';
import { cohortTimeline, dropToEdit, journeyKpis, journeyLanes, planDraft } from '../../admin-app/src/cohort-journey.js';
import { formToStage, reqFields, stageFields, stageToForm } from '../../admin-app/src/methodology.js';
import { pathOf } from './screens/Paywall.jsx';
import { phaseRail, serviceLineAr } from './screens/Journey.jsx';
import { COHORTS, MILESTONES, REQS, STAGES } from './journey-legacy.cases.js';

// البذرة الموصى بها للاستشارة: خدمة من بعد اعتماد المستوى (لا unlock:'approval')
const SEED = { lane: 'service', mode: 'on_demand', unlock: 'stages', after: ['approval'] };
const SVC = STAGES.map((s) => (s.key === 'consulting' ? { ...s, rules: SEED } : s));
const C = COHORTS.dated;
const item = (id, status, extra = {}) => ({ id, code: id.toUpperCase(), title_ar: `بند ${id}`, required: true, status, ...extra });
const journeyOf = (stages, done, { overrides = { approval: 'complete' }, activity = {} } = {}) => resolveStages([...stages].sort((a, b) => a.sort - b.sort).map((s) => {
  const items = REQS.filter((r) => r.stage_key === s.key).map((r) => ({ ...item(r.id, done.has(r.id) ? 'done' : 'pending', activity[r.id] ? { activity: activity[r.id] } : {}), required: r.required }));
  return { ...s, items, done: items.filter((i) => i.status === 'done').length, total: items.length };
}), { overrides, cohortStart: C.starts_on, today: '2026-12-15' });

describe('القواعد: «خدمة» تُحفظ منذ T2 بإتاحتها، وتُرفض حيث تصير إلزامية بلا اسمها', () => {
  it('البذرة تُحفظ كما هي، والنمط «عند الحاجة» دائمًا', () => {
    expect(cleanStageRules(SEED, STAGES, 'consulting')).toEqual({ mode: 'on_demand', unlock: 'stages', after: ['approval'], lane: 'service' });
    expect(cleanStageRules({ lane: 'service', mode: 'required', unlock: 'always' }, STAGES, 'consulting')).toEqual({ mode: 'on_demand', unlock: 'always', lane: 'service' });
    expect(cleanStageRules({ lane: 'service', mode: 'optional', unlock: 'always' }, STAGES, 'consulting').mode).toBe('optional');
    expect(stageRules({ rules: { lane: 'service', mode: 'required' } }).mode).toBe('on_demand');
    expect(isService(SVC.find((s) => s.key === 'consulting'))).toBe(true);
  });
  it('الرفض برسالة عربية', () => {
    const bad = (r, key = 'consulting', list = STAGES) => { try { cleanStageRules(r, list, key); return null; } catch (e) { return e.message; } };
    expect(bad({ lane: 'service', unlock: 'with', with: 'training' })).toContain('الخدمة لا تبدأ مع مرحلة');
    expect(bad({ lane: 'service', unlock: 'always' }, 'approval')).toContain('بوابات القبول');
    // لا يُشترط اكتمالها لفتح غيرها، ولا يبدأ معها شيء، ولا ينتهي بها مسار ولا تُشترط قبلها بنوده
    expect(bad({ unlock: 'stages', after: ['consulting'] }, 'support', SVC)).toContain('خدمة لمن يريد');
    expect(bad({ unlock: 'with', with: 'consulting' }, 'leadership_coaching', SVC)).toContain('خدمة لمن يريد');
    expect(bad({ lane: 'track', unlock: 'with', with: 'training', until: 'stage:consulting' }, 'ojt_coaching', SVC)).toContain('خدمة');
    expect(bad({ lane: 'track', unlock: 'with', with: 'training', due_before: 'consulting' }, 'ojt_coaching', SVC)).toContain('خدمة');
  });
  it('الفحص على البرنامج كله: البذرة نظيفة، و«بعد خدمة» خطأ يمنع الحفظ والنشر', () => {
    expect(stageRulesIssues(SVC).filter((x) => x.level === 'error')).toEqual([]);
    const after = SVC.map((s) => (s.key === 'support' ? { ...s, rules: { unlock: 'stages', after: ['consulting'] } } : s));
    expect(stageRulesIssues(after).find((x) => x.stage === 'support')).toMatchObject({ level: 'error', rule: 'lane' });
    const gate = SVC.map((s) => (s.key === 'approval' ? { ...s, rules: { lane: 'service', unlock: 'always' } } : s));
    expect(stageRulesIssues(gate).find((x) => x.stage === 'approval')).toMatchObject({ level: 'error', rule: 'lane' });
  });
  it('خارج المراجع: لا «تسير مع» خدمة، ولا نهاية مسار بها', () => {
    expect(withCandidates(SVC, 'leadership_coaching').map((s) => s.key)).not.toContain('consulting');
    expect(Object.keys(untilOptions(SVC, 'ojt_coaching'))).not.toContain('stage:consulting');
    expect(planWithCandidates(SVC, {}, 'leadership_coaching').map((s) => s.key)).not.toContain('consulting');
    expect(planWithCandidates(SVC, {}, 'consulting')).toEqual([]);
  });
  it('إتاحة بعد أيام بالمعدود العربي', () => {
    expect(serviceAvailAr({ rules: { lane: 'service', unlock: 'day', day: 3 } })).toBe('تُتاح بعد ثلاثة أيام من بداية الدفعة حتى نهاية الرحلة');
    expect(serviceAvailAr({ rules: { lane: 'service', unlock: 'day', day: 2 } })).toBe('تُتاح بعد يومين من بداية الدفعة حتى نهاية الرحلة');
    expect(serviceAvailAr({ rules: { lane: 'service', unlock: 'day', day: 30 } })).toBe('تُتاح بعد 30 يومًا من بداية الدفعة حتى نهاية الرحلة');
  });
  it('الجملة على البطاقة', () => {
    const s = SVC.find((x) => x.key === 'consulting');
    expect(stageRuleSummary(s, SVC)).toBe('خدمة عند الحاجة · تُتاح بعد اكتمال «مرحلة approval» حتى نهاية الرحلة · لا تأخذ من الرحلة أيامًا ولا تُحسب في التقدم ولا يُشترط اكتمالها');
    expect(serviceAvailAr({ rules: { lane: 'service', unlock: 'always' } })).toBe('متاحة من بداية الرحلة حتى نهاية الرحلة');
    expect([sessionsMaxAr(1), sessionsMaxAr(2), sessionsMaxAr(3), sessionsMaxAr(null)]).toEqual(['حتى جلسة واحدة للمشارك', 'حتى جلستين للمشارك', 'حتى 3 جلسات للمشارك', '']);
  });
  it('القياس البعدي لا يكون في خدمة: postInService لحفظ النسخة', () => {
    const post = { id: 'x', code: 'E-POST', stage_key: 'consulting', active: true };
    expect(postInService(SVC, [...REQS, post])).toBe('consulting');
    expect(postInService(STAGES, [...REQS, post])).toBe(null);
    expect(postInService(SVC, [...REQS, { ...post, active: false }])).toBe(null);
  });
});

describe('الخطة: لا نافذة للخدمة ولا أيام، والسلسلة كأنها موقوفة', () => {
  const p = cohortPlan(SVC, C);
  const off = cohortPlan(STAGES, { ...C, schedule: { consulting: { off: true } } });
  it('صفها بلا تواريخ ولا أيام، وخارج النوافذ', () => {
    expect(p.byKey.consulting).toMatchObject({ lane: 'service', days: 0, from: null, to: null, next: null });
    expect(p.windows.consulting).toBeUndefined();
    expect(p.services).toEqual(['consulting']);
    expect(p.dated).toBe(true);
    expect(p.changed).toBe(0);
  });
  it('لا تؤخر ما بعدها: كل مرحلة بتاريخها كما لو كانت موقوفة، والنهاية والمدة من السلسلة وحدها', () => {
    for (const s of STAGES.filter((x) => x.key !== 'consulting')) expect([s.key, p.byKey[s.key].from, p.byKey[s.key].to]).toEqual([s.key, off.byKey[s.key].from, off.byKey[s.key].to]);
    expect([p.end, p.total_days, p.over]).toEqual([off.end, off.total_days, off.over]);
    expect(planSpanDays(SVC)).toBe(planSpanDays(STAGES.filter((s) => s.key !== 'consulting')));
    // وتنبيه «تنتهي الرحلة بعد نهاية الدفعة» لا تصنعه الخدمة
    const short = { ...C, ends_on: off.end };
    expect(cohortPlan(SVC, short).issues.filter((x) => x.code === 'over_end')).toEqual([]);
  });
  it('خارج المجموعات وموقع اليوم والتوزيع والاقتراح', () => {
    expect(withGroups(SVC).flat().map((s) => s.key)).not.toContain('consulting');
    expect(todayStages(SVC, p.windows, '2026-12-15')).not.toContain('consulting');
    expect(distributeSchedule(SVC, '2026-11-04', '2027-04-30').consulting).toBeUndefined();
    expect(Object.keys(suggestDays(SVC, '2026-11-04', '2027-04-30', {}))).not.toContain('consulting');
    expect(suggestDays(SVC, '2026-11-04', '2027-04-30', {})).toEqual(suggestDays(STAGES.filter((s) => s.key !== 'consulting'), '2026-11-04', '2027-04-30', {}));
  });
  it('لا مدة تُكتب لها في الدفعة، ولا تسير مع شيء، والإيقاف يعمل', () => {
    const r = planEdit({ stages: SVC, schedule: {}, edit: { days: { consulting: 10 } }, cohort: C, requirements: REQS });
    expect(r.errors.map((x) => x.code)).toEqual(['service_days']);
    const w = planEdit({ stages: SVC, schedule: {}, edit: { with: { consulting: 'training' } }, cohort: C, requirements: REQS });
    expect(w.errors.map((x) => x.code)).toContain('with_service');
    const o = planEdit({ stages: SVC, schedule: {}, edit: { off: { consulting: true } }, cohort: C, requirements: REQS });
    expect(o.errors).toEqual([]);
    expect(o.schedule.consulting).toEqual({ off: true });
  });
  it('الأثر: الخدمة لا تظهر تغييرًا، وتعديل مدة غيرها لا يحركها', () => {
    const pi = planImpact({ stages: SVC, before: {}, after: { training: { days: 21 } }, cohort: C, milestones: MILESTONES });
    expect(pi.changes.map((x) => x.key)).not.toContain('consulting');
  });
  it('معلم على نهايتها بلا موعد، وما سواه كما لو كانت موقوفة', () => {
    const ms = [...MILESTONES, { id: 'm-c', title_ar: 'معلم الاستشارة', stage_key: 'consulting', anchor: 'stage_end', offset_days: 0, complete: 'manual', active: true, sort: 1 }];
    const a = milestoneStatuses(ms, { stagesDone: new Set(), records: {}, cohort: C, stages: SVC, today: '2026-12-15' });
    expect(a.find((m) => m.id === 'm-c').due).toBe(null);
  });
});

describe('الفتح والعد: متاحة لمن يريد بعد الاعتماد، ولا تُعد ولا تقفل', () => {
  const PRE = new Set(['p-info', 'a-done']);
  it('تبقى في الرحلة بحقل lane، ومقفلة قبل الاعتماد ومتاحة بعده', () => {
    const before = journeyOf(SVC, PRE, { overrides: {} });
    const c0 = before.find((s) => s.key === 'consulting');
    expect([c0.lane, c0.status, c0.stage_mode]).toEqual(['service', 'locked', 'on_demand']);
    expect(c0.lock_reason).toContain('مرحلة approval');
    const j = journeyOf(SVC, PRE);
    const c = j.find((s) => s.key === 'consulting');
    expect([c.lane, c.status]).toEqual(['service', 'available']);
  });
  it('ما بعدها لا ينتظرها، والتقدم والموضع كما لو لم تكن', () => {
    const done = new Set(['p-info', 'a-done', 't-att', 't-hb', 'o-mreg', 'o-breg']);
    const j = journeyOf(SVC, done);
    const base = journeyOf(STAGES.filter((s) => s.key !== 'consulting'), done);
    for (const s of base) expect([s.key, j.find((x) => x.key === s.key).status]).toEqual([s.key, s.status]);
    expect(journeyProgress(j)).toBe(journeyProgress(base));
    expect(j[positionOf(j)].key).toBe(base[positionOf(base)].key);
    expect(currentStages(j).stages.map((s) => s.key)).not.toContain('consulting');
    // ولو استفاد منها لا تزيد نسبته: الخدمة خارج العد
    const all = new Set([...done, 'c-meet']);
    expect(journeyProgress(journeyOf(SVC, all))).toBe(journeyProgress(journeyOf(SVC, done)));
  });
  it('عند المشارك: خارج شريط الأطوار وعدد المراحل في الدفع', () => {
    const j = journeyOf(SVC, PRE);
    expect(pathOf(j).titles).not.toContain('مرحلة consulting');
    expect(pathOf(j).stages).toBe(pathOf(journeyOf(STAGES.filter((s) => s.key !== 'consulting'), PRE)).stages);
    expect(phaseRail(j)).toEqual(phaseRail(journeyOf(STAGES.filter((s) => s.key !== 'consulting'), PRE)));
    expect(serviceLineAr(j.find((s) => s.key === 'consulting'))).toBe('متاحة لك حتى نهاية رحلتك');
  });
});

describe('حد الجلسات max_sessions: sessions_required للاكتمال، والحد للحجز', () => {
  const s = (status) => ({ id: status + Math.random(), status, starts_at: '2026-12-01T09:00:00Z', ends_at: '2026-12-01T10:00:00Z' });
  it('يُنظَّف في cleanConfig ولا يقل عن المطلوب', () => {
    expect(cleanConfig('coaching', { sessions_required: 1, max_sessions: '٢' }).max_sessions).toBe(2);
    expect(cleanConfig('coaching', { sessions_required: 1, max_sessions: '' }).max_sessions).toBeUndefined();
    expect(cleanConfig('coaching', { sessions_required: 1 })).not.toHaveProperty('max_sessions');
    expect(() => cleanConfig('coaching', { sessions_required: 3, max_sessions: 2 })).toThrow('أقل من المطلوب');
    expect(() => cleanConfig('coaching', { max_sessions: 31 })).toThrow('من 1 إلى 30');
    expect(() => cleanConfig('coaching', { max_sessions: 1.5 })).toThrow('عدد صحيح');
    expect([sessionsMax({ max_sessions: 2 }), sessionsMax({}), sessionsMax({ max_sessions: 0 })]).toEqual([2, null, null]);
  });
  it('زر الحجز يختفي عند الحد، والاكتمال بالمطلوب', () => {
    const cfg = { sessions_required: 1, max_sessions: 2 };
    expect(coachingStatus(cfg, [])).toMatchObject({ can_book: true, max: 2, used: 0, at_max: false, done: false });
    expect(coachingStatus(cfg, [s('attended')])).toMatchObject({ can_book: true, used: 1, at_max: false, done: true });
    expect(coachingStatus(cfg, [s('attended'), s('booked')])).toMatchObject({ can_book: false, used: 2, at_max: true, done: true });
    // الملغاة لا تُعد
    expect(coachingStatus(cfg, [s('attended'), s('cancelled')]).can_book).toBe(true);
  });
  it('بلا حد: كما كان حرفًا (الحجز حتى المطلوب)', () => {
    const one = [s('booked')];
    expect(coachingStatus({ sessions_required: 1 }, one)).toEqual({ type: 'coaching', done: false, count: 0, total: 1, can_book: false, sessions: coachingStatus({ sessions_required: 1 }, one).sessions });
    expect(coachingStatus({ sessions_required: 2 }, [s('attended')])).not.toHaveProperty('max');
  });
  it('الحجز الزائد من منصة الحجز يُعلَّم ولا يُرفض', () => {
    const cfg = { sessions_required: 1, max_sessions: 2 };
    expect(bookingOverMax(cfg, [s('attended'), s('booked')])).toEqual({ over: false, count: 2, max: 2 });
    expect(bookingOverMax(cfg, [s('attended'), s('booked'), s('booked')])).toEqual({ over: true, count: 3, max: 2 });
    expect(bookingOverMax(cfg, [s('attended'), s('booked'), s('cancelled')]).over).toBe(false);
    expect(bookingOverMax({ sessions_required: 1 }, [s('booked'), s('booked')]).over).toBe(false);
  });
  it('سطر الخدمة عند المشارك يقول ما بقي', () => {
    const st = (act) => ({ status: 'available', items: [{ id: 'c', activity: act }] });
    expect(serviceLineAr(st(coachingStatus({ sessions_required: 1, max_sessions: 2 }, [s('booked')])))).toBe('متاحة لك حتى نهاية رحلتك، حجزت 1 من جلستين');
    expect(serviceLineAr(st(coachingStatus({ sessions_required: 1, max_sessions: 1 }, [s('attended')])))).toBe('حجزت جلستك المتاحة');
    expect(serviceLineAr(st(coachingStatus({ sessions_required: 1, max_sessions: 2 }, [s('attended'), s('booked')])))).toBe('حجزت كل جلساتك المتاحة (جلستان)');
    expect(serviceLineAr(st(coachingStatus({ sessions_required: 1, max_sessions: 5 }, [])))).toBe('متاحة لك حتى نهاية رحلتك، لم تحجز بعد من 5 جلسات');
  });
});

describe('العرض: صف «الخدمات» في الخط، وبطاقتها بمؤشر الاستخدام، والخريطة', () => {
  const reqs = REQS.map((r) => (r.id === 'c-meet' ? { ...r, kind: 'coaching', config: { sessions_required: 1, max_sessions: 2 } } : r));
  it('الخط: الخدمة خارج الخانات والمحاور، بإتاحتها وحدها', () => {
    const m = journeyTimeline({ stages: SVC, requirements: reqs }, { cohort: C, today: '2026-12-15' });
    expect(m.dated).toBe(true);
    expect(m.stages.map((s) => s.key)).not.toContain('consulting');
    expect(m.slots.flatMap((x) => x.stages)).not.toContain('consulting');
    expect(m.services_ar).toBe('الخدمات');
    expect(m.services.map((s) => [s.key, s.lane_kind, s.avail_ar, s.max_ar, s.window])).toEqual([['consulting', 'service', 'تُتاح بعد اكتمال «مرحلة approval» حتى نهاية الرحلة', 'حتى جلستين للمشارك', null]]);
    const act = m.activities.find((a) => a.stage === 'consulting');
    expect(act.when_ar).toBe('يحجزه المشارك عند الحاجة حتى نهاية الرحلة');
    expect(m.services[0].activities).toEqual([act.id]);
    const base = journeyTimeline({ stages: STAGES.filter((s) => s.key !== 'consulting'), requirements: reqs }, { cohort: C, today: '2026-12-15' });
    expect([m.total_days, m.end, m.phases]).toEqual([base.total_days, base.end, base.phases]);
  });
  it('البرنامج بلا دفعة: الصف نفسه', () => {
    const m = journeyTimeline({ stages: SVC, requirements: reqs }, { today: '2026-12-15' });
    expect(m.services.map((s) => s.key)).toEqual(['consulting']);
  });
  it('الخريطة: «استفاد N من M» بدل «هنا» و«تجاوزوها»', () => {
    const PRE = new Set(['p-info', 'a-done']);
    const used = { 'c-meet': coachingStatus({ sessions_required: 1, max_sessions: 2 }, [{ id: 'x', status: 'booked', starts_at: '2026-12-20T09:00:00Z', ends_at: '2026-12-20T10:00:00Z' }]) };
    const people = [
      { id: 'a', name: 'أ', status: 'enrolled', journey: journeyOf(SVC, PRE, { activity: used }), milestones: [] },
      { id: 'b', name: 'ب', status: 'enrolled', journey: journeyOf(SVC, PRE), milestones: [] },
      { id: 'c', name: 'ج', status: 'enrolled', journey: journeyOf(SVC, new Set(['p-info', 'a-done', 't-att', 't-hb', 'o-mreg', 'o-breg'])), milestones: [] },
    ];
    expect(serviceUsed(people[0].journey.find((s) => s.key === 'consulting'))).toBe(true);
    const map = journeyMap({ stages: SVC, people, cohort: C, today: new Date('2026-12-15T10:00:00Z') });
    const row = map.stages.find((s) => s.key === 'consulting');
    expect([row.service, row.used, row.of, row.usage_ar, row.here, row.done, row.window]).toEqual([true, 1, 3, 'استفاد 1 من 3', 0, 0, null]);
    // ومن تجاوز ما بعدها لا يُعد متجاوزًا لها
    const sup = map.stages.find((s) => s.key === 'training');
    expect(sup.done).toBe(1);
    // البطاقة في تبويب الرحلة
    const model = cohortTimeline({ stages: SVC, requirements: reqs, sessions: [] }, C, '2026-12-15');
    const lanes = journeyLanes(model, { def: { stages: SVC, requirements: reqs }, cohort: C, milestones: MILESTONES, map });
    expect(lanes.services.map((s) => [s.key, s.usage.text, s.max_ar])).toEqual([['consulting', 'استفاد 1 من 3', 'حتى جلستين للمشارك']]);
    expect(lanes.phases.flatMap((p) => p.groups.flatMap((g) => g.stages.map((x) => x.key)))).not.toContain('consulting');
    expect(journeyKpis(model, lanes, map).find((k) => k.key === 'services').value).toBe('مرحلة consulting (استفاد 1 من 3)');
    // ومسودة الخطة لا تعطيها مدة ولا مرجعًا
    const dr = planDraft({ def: { stages: SVC, requirements: reqs }, cohort: C });
    expect([dr.rows.consulting.days, dr.rows.consulting.with_options, dr.rows.consulting.with_lock.code]).toEqual([0, [], 'with_service']);
    // والإفلات في «الخدمات» يُرفض في الدفعة برابط «غيّرها في البرنامج» (D1)، والخدمة بلا شريط فلا تُسحب
    const r = dropToEdit({ scale: model.scale, draft: dr, key: 'training', kind: 'move', pct: 0, over: { zone: 'services', key: null } });
    expect(r.reject).toMatchObject({ code: 'lane', program: true });
    expect(model.scale.spans.consulting).toBeUndefined();
  });
});

describe('الخدمة الموقوفة لهذه الدفعة: في «الخدمات» بعلامتها، لا محطة على المسار ولا مرحلة موقوفة', () => {
  const reqs = REQS.map((r) => (r.id === 'c-meet' ? { ...r, kind: 'coaching', config: { sessions_required: 1, max_sessions: 2 } } : r));
  const OFF = { ...C, schedule: { consulting: { off: true } } };
  it('الخريطة: صفها service وoff، وتعريف الدفعة يحمل قواعدها', () => {
    const def = cohortDefinition({ live: { stages: SVC, requirements: reqs }, cohort: OFF });
    expect(def.stages.map((s) => s.key)).not.toContain('consulting');
    expect(def.stages_off.find((s) => s.key === 'consulting').rules).toEqual(SEED);
    const people = [{ id: 'a', name: 'أ', status: 'enrolled', journey: journeyOf(def.stages, new Set(['p-info'])), milestones: [] }];
    const map = journeyMap({ stages: def.stages, people, cohort: OFF, off: def.stages_off, today: new Date('2026-12-15T10:00:00Z') });
    const row = map.stages.find((s) => s.key === 'consulting');
    expect([row.service, row.off, row.used, row.of, row.usage_ar]).toEqual([true, true, 0, 0, '']);
    expect(map.stages.filter((s) => !s.service).map((s) => s.key)).not.toContain('consulting');
  });
  it('تبويب الرحلة: بطاقتها في «الخدمات» موقوفة، ولا تُعد في المحاور ولا في «موقوفة»', () => {
    const model = cohortTimeline({ stages: SVC, requirements: reqs, sessions: [] }, OFF, '2026-12-15');
    const lanes = journeyLanes(model, { def: { stages: SVC, requirements: reqs }, cohort: OFF, milestones: MILESTONES });
    expect(lanes.services.map((s) => [s.key, s.off, s.lane])).toEqual([['consulting', true, 'service']]);
    expect(lanes.phases.flatMap((p) => p.groups.flatMap((g) => g.stages.map((x) => x.key)))).not.toContain('consulting');
    expect(lanes.counts.off).toBe(0);
  });
});

describe('النموذج في «الرحلة والمتطلبات»: «خدمة» تُختار، وإتاحتها الموصى بها، وحد الجلسات', () => {
  it('«خدمة لمن يريد» في الطبيعة، والنمط مخفي لها', () => {
    const f = stageFields(REQS, SVC, 'consulting');
    expect(f.find((x) => x.name === 'rule_lane').options.service).toBe('خدمة لمن يريد');
    expect(f.find((x) => x.name === 'rule_mode').show({ rule_lane: 'service' })).toBe(false);
    expect(f.find((x) => x.name === 'rule_unlock').label({ rule_lane: 'service' })).toBe('متى تُتاح');
    expect(f.find((x) => x.name === 'rule_unlock').label({ rule_lane: 'stage' })).toBe('متى تُفتح');
    // ولا تُشترط خدمة قبل غيرها
    expect(Object.keys(stageFields(REQS, SVC, 'support').find((x) => x.name === 'rule_after').options)).not.toContain('consulting');
  });
  it('«بعد ما قبلها» تُحفظ للخدمة بالموصى به: بعد اعتماد المستوى، والذهاب والإياب لا يغير شيئًا', () => {
    const v = { ...stageToForm(STAGES.find((s) => s.key === 'consulting')), rule_lane: 'service' };
    const out = formToStage(v).rules;
    expect(out).toEqual({ mode: 'on_demand', unlock: 'stages', complete: 'required', lane: 'service', after: ['approval'] });
    expect(cleanStageRules(out, STAGES, 'consulting')).toEqual(SEED);
    const back = stageToForm({ ...STAGES.find((s) => s.key === 'consulting'), rules: SEED });
    expect([back.rule_lane, back.rule_unlock, back.rule_after]).toEqual(['service', 'stages', ['approval']]);
    expect(formToStage(back).rules).toMatchObject(SEED);
  });
  it('حقل حد الجلسات للتوجيه وحده', () => {
    const f = reqFields(STAGES).find((x) => x.name === 'cfg_max_sessions');
    expect([f.show({ kind: 'coaching' }), f.show({ kind: 'workshop' })]).toEqual([true, false]);
  });
});
