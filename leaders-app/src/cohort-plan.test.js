// R2a «المدة للدفعة» (docs/ops/2026-11-17-تصور-محرر-رحلة-الدفعة-v1.md): cohortPlan المكان الوحيد لتواريخ الدفعة ومددها،
// بالنهاية الشاملة (القرار 18) والمدة الخاصة بالدفعة والمثبت القديم والدفعة المفتوحة، والمنظف والترقية يحفظان الصيغة
// الموسعة، وتحرير الخطة وأثرها وحارس البريد، ورحلة المشارك لا يتغير فتحها بتغيير المدة.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cohortPlan, planDaysOnly, planStages, stageWindows } from '../../supabase/functions/leaders-api/stage-windows.js';
import {
  buildJourney, cleanScheduleReport, cohortDefinition, lateNoticeAllowed, milestoneStatuses, renderJourney, upgradePlan,
} from '../../supabase/functions/leaders-api/logic.js';
import { journeyMap } from '../../supabase/functions/leaders-api/journey-map.js';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import { cohortSetup } from '../../supabase/functions/leaders-api/cohort-setup.js';
import {
  impactLines, planCutoff, planDays, planEdit, planImpact, planLock, sameSchedule, suggestDays,
} from '../../supabase/functions/leaders-api/cohort-plan.js';
import { fromUnit, inUnit, planDraft, stepDays } from '../../admin-app/src/cohort-journey.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const S = (key, sort, days, extra = {}) => ({ key, sort, title_ar: key, duration_days: days, phase: 'qualification', active: true, ...extra });
const STAGES = [
  S('approval', 1, 2, { phase: 'admission' }),
  S('training', 2, 14, { title_ar: 'التدريب' }),
  S('ojt', 3, 7, { title_ar: 'التوجيه', rules: { unlock: 'with', with: 'training' } }),
  S('support', 4, 30, { phase: 'impact', title_ar: 'الدعم' }),
];

describe('cohortPlan: النهاية الشاملة (القرار 18)', () => {
  it('14 يومًا من 4 يناير تنتهي 17 يناير، وما بعدها يبدأ 18 يناير', () => {
    const p = cohortPlan([S('training', 1, 14), S('next', 2, 7)], { starts_on: '2027-01-04' });
    expect(p.byKey.training).toMatchObject({ from: '2027-01-04', to: '2027-01-17', days: 14, source: 'program' });
    expect(p.byKey.next).toMatchObject({ from: '2027-01-18', to: '2027-01-24' });
    expect(p.total_days).toBe(21);
    expect(p.end).toBe('2027-01-24');
    // stageWindows اسمها القديم بشكلها القديم { from, to } وحده
    expect(stageWindows([S('training', 1, 14)], { starts_on: '2027-01-04' })).toEqual({ training: { from: '2027-01-04', to: '2027-01-17' } });
  });
  it('المرحلة بلا مدة نقطة في يومها لا تأخذ من المسار شيئًا', () => {
    const p = cohortPlan([S('profile', 1, 0), S('training', 2, 14)], { starts_on: '2027-01-04' });
    expect(p.byKey.profile).toMatchObject({ from: '2027-01-04', to: '2027-01-04', days: 0 });
    expect(p.byKey.training.from).toBe('2027-01-04');
  });
});

describe('cohortPlan: المدة الخاصة بالدفعة', () => {
  it('days يغلب مدة النسخة ويزيح ما بعدها، ومصدرها cohort ومدة البرنامج معها', () => {
    const p = cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { training: { days: 21 } } });
    expect(p.byKey.training).toMatchObject({ days: 21, program_days: 14, source: 'cohort', from: '2027-01-06', to: '2027-01-26' });
    expect(p.byKey.support.from).toBe('2027-01-27');
    expect(p.changed).toBe(1);
    // المدة نفسها التي في البرنامج ليست تعديلًا
    expect(cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { training: { days: 14 } } }).byKey.training.source).toBe('program');
  });
  it('المجموعة «تبدأ مع»: تطويل التابع يمد المجموعة، وتقصير القائد لا يقصرها ما دام التابع أطول', () => {
    const long = cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { ojt: { days: 28 } } });
    expect(long.byKey.ojt).toMatchObject({ from: '2027-01-06', to: '2027-02-02' });
    expect(long.byKey.support.from).toBe('2027-02-03');
    const short = cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { training: { days: 3 } } });
    expect(short.byKey.ojt).toMatchObject({ from: '2027-01-06', to: '2027-01-12' });
    expect(short.byKey.support.from).toBe('2027-01-13');
  });
  it('planStages يكتب duration_days بالمدة الفعلية، والتطبيق مرتين لا يغير شيئًا', () => {
    const once = planStages(STAGES, { training: { days: 21 } });
    expect(once.find((s) => s.key === 'training').duration_days).toBe(21);
    expect(planStages(once, { training: { days: 21 } })).toEqual(once);
    expect(cohortPlan(once, { starts_on: '2027-01-04', schedule: { training: { days: 21 } } }).windows)
      .toEqual(cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { training: { days: 21 } } }).windows);
  });
});

describe('cohortPlan: المثبت القديم {start,end} يُحترم من اليوم الأول', () => {
  it('المثبت مرساة يُزاح ما بعده منه، ولا يتبع المدة', () => {
    const p = cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { training: { start: '2027-01-10', end: '2027-01-20' } } });
    expect(p.byKey.training).toMatchObject({ from: '2027-01-10', to: '2027-01-20', days: 11, source: 'pinned' });
    expect(p.byKey.support.from).toBe('2027-01-21');
  });
  it('بداية مثبتة بلا نهاية: نهايتها من مدتها، والمدة الخاصة تُحترم معها', () => {
    const p = cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { support: { start: '2027-03-01', days: 10 } } });
    expect(p.byKey.support).toMatchObject({ from: '2027-03-01', to: '2027-03-10', source: 'pinned' });
  });
  it('نهاية مثبتة بلا بداية تزيح ما بعدها (حُسم في R2a)', () => {
    const p = cohortPlan(STAGES, { starts_on: '2027-01-04', schedule: { training: { end: '2027-01-31' } } });
    expect(p.byKey.training).toMatchObject({ from: '2027-01-06', to: '2027-01-31', source: 'pinned', days: 26 });
    expect(p.byKey.support.from).toBe('2027-02-01');
  });
  it('الجدول الموزع قديمًا (distributeSchedule) يتصل بلا فجوة ولا تداخل', () => {
    const p = cohortPlan([S('a', 1, 10), S('b', 2, 10)], { starts_on: '2027-01-01', schedule: { a: { start: '2027-01-01', end: '2027-01-15' }, b: { start: '2027-01-16', end: '2027-01-31' } } });
    expect(p.byKey.b.from).toBe('2027-01-16');
    expect(p.issues).toEqual([]);
  });
});

describe('cohortPlan: الدفعة المفتوحة والدفعة بلا تاريخ', () => {
  it('المفتوحة (is_default) بلا تواريخ ولو ضُبط لها starts_on، والمدد الخاصة تبقى، والمثبت يُتجاهل', () => {
    const p = cohortPlan(STAGES, { is_default: true, starts_on: '2027-01-04', schedule: { training: { days: 21 }, support: { start: '2027-03-01', end: '2027-03-10' } } });
    expect(p.dated).toBe(false);
    expect(p.windows).toEqual({});
    expect(p.byKey.training).toMatchObject({ days: 21, source: 'cohort', from: null });
    expect(p.byKey.support.source).toBe('program');
    expect(planDaysOnly({ a: { days: 3, start: '2027-01-01' }, b: { start: '2027-01-01' } })).toEqual({ a: { days: 3 } });
  });
  it('بلا بداية: المدد بلا تواريخ، والخط الزمني يرسم مدد الدفعة نسبيًا لا مدد البرنامج', () => {
    expect(cohortPlan(STAGES, { schedule: { training: { days: 21 } } }).byKey.training).toMatchObject({ days: 21, from: null });
    const m = journeyTimeline({ stages: STAGES, requirements: [] }, { cohort: { id: 'c', schedule: { training: { days: 21 } } } });
    expect(m.dated).toBe(false);
    expect(m.stages.find((s) => s.key === 'training').days).toBe(21);
  });
  it('تنبيهات الخطة: تجاوز نهاية الدفعة، و«تُفتح يوم N» خارج نافذتها (القرار 20)، والإلزامية بمدة صفر', () => {
    const st = [...STAGES.slice(0, 3), S('support', 4, 30, { rules: { unlock: 'day', day: 5 } })];
    const p = cohortPlan(st, { starts_on: '2027-01-04', ends_on: '2027-02-01', schedule: { training: { days: 0 } } });
    expect(p.issues.map((x) => x.code).sort()).toEqual(['day_rule', 'over_end', 'zero_required']);
    expect(p.over).toBe(daysOver(p.end, '2027-02-01'));
  });
});
const daysOver = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

describe('cleanScheduleReport وupgradePlan يحفظان الصيغة الموسعة (الفجوة 6أ)', () => {
  const keys = ['training', 'ojt', 'support'];
  it('المدة وحدها خطة: لا يُمحى مدخل بلا تاريخ، ويبقى off وwith وoffset للمراحل اللاحقة', () => {
    const raw = { training: { days: 21, junk: 1 }, ojt: { with: 'training', offset: 3, days: 7 }, support: { off: true }, empty: {} };
    const r = cleanScheduleReport(raw, keys);
    expect(r.schedule).toEqual({ training: { days: 21 }, ojt: { with: 'training', offset: 3, days: 7 }, support: { off: true } });
    expect(r.dropped).toEqual([]);
    // جولة كاملة: المنظف على ناتجه لا يغير شيئًا
    expect(cleanScheduleReport(r.schedule, keys).schedule).toEqual(r.schedule);
  });
  it('المرحلة الغائبة تُسقط برسالة، و«تسير مع» مرحلة غائبة تُسقط بإزاحتها، والمدة غير الصالحة ترفض', () => {
    const r = cleanScheduleReport({ gone: { days: 5 }, ojt: { with: 'gone', offset: 2, days: 7 } }, keys, { gone: 'القديمة' });
    expect(r.schedule).toEqual({ ojt: { days: 7 } });
    expect(r.message).toContain('«القديمة»');
    expect(() => cleanScheduleReport({ training: { days: 400 } }, keys)).toThrow('مدة المرحلة');
    expect(() => cleanScheduleReport({ training: { days: 2.5 } }, keys)).toThrow();
    expect(cleanScheduleReport({ training: { days: '٢١' } }, keys).schedule).toEqual({ training: { days: 21 } });
    expect(cleanScheduleReport({ training: { start: '2027-01-01', end: '2027-01-10' } }, keys).schedule).toEqual({ training: { start: '2027-01-01', end: '2027-01-10' } });
  });
  it('الترقية لا تمحو المدد: تبقى لمراحل النسخة الهدف، وتُسقط مرحلة غابت عنها مع اسمها', () => {
    const from = { stages: [S('training', 1, 14), S('old', 2, 7, { title_ar: 'القديمة' })], requirements: [] };
    const to = { stages: [S('training', 1, 10)], requirements: [] };
    const p = upgradePlan({ cohort: { schedule: { training: { days: 21 }, old: { days: 3 } } }, from, to });
    expect(p.patch.schedule).toEqual({ training: { days: 21 } });
    expect(p.dropped.schedule).toEqual(['القديمة']);
  });
});

describe('تعريف الدفعة يطبق المدة: رحلة المشارك والمعالم والخريطة من الخطة نفسها', () => {
  const live = { stages: [S('training', 1, 14, { duration_label: '{duration}' }), S('fixed', 2, 4, { duration_label: 'أربعة أيام' })], requirements: [] };
  it('cohortDefinition يكتب duration_days، فيصح نص {duration} عند المشارك، والنص الثابت لا يُمس', () => {
    const def = cohortDefinition({ live, version: null, cohort: { schedule: { training: { days: 21 }, fixed: { days: 9 } } } });
    const r = renderJourney(def);
    expect(r.stages.find((s) => s.key === 'training').duration_label).toBe('3 أسابيع');
    expect(r.stages.find((s) => s.key === 'fixed').duration_label).toBe('أربعة أيام');
    // وتعريف اللوحة (بلا دفعة) يبقى بمدد البرنامج، والخطة تُحسب فوقه
    expect(cohortDefinition({ live, version: null, cohort: null }).stages[0].duration_days).toBe(14);
  });
  it('موعد «نهاية التدريب» يتبع المدة الخاصة، كما تقرؤه رحلة المشارك (milestoneStatuses)', () => {
    const ms = [{ id: 'm', stage_key: 'training', anchor: 'stage_end', offset_days: 0, complete: 'manual' }];
    const cohort = { starts_on: '2027-01-04', schedule: { training: { days: 21 } } };
    const [m] = milestoneStatuses(ms, { cohort, stages: STAGES, today: '2026-12-01' });
    expect(m).toMatchObject({ due: '2027-01-26', due_source: 'window' });
    const def = cohortDefinition({ live: { stages: STAGES, requirements: [] }, version: null, cohort });
    expect(milestoneStatuses(ms, { cohort, stages: def.stages, today: '2026-12-01' })[0].due).toBe('2027-01-26');
  });
  it('الخريطة: «متأخر» و«المدة المخططة» من المدة الفعلية', () => {
    const cohort = { name: 'د', starts_on: '2027-01-04', schedule: { training: { days: 3 } } };
    const people = [{ id: 'p', name: 'م', created_at: '2026-12-01T00:00:00Z', journey: STAGES.map((s, i) => ({ key: s.key, stage_mode: 'required',
      status: i === 0 ? 'done' : i === 1 ? 'active' : 'locked', items: [{ title_ar: 'بند', status: i === 0 ? 'done' : 'pending', completed_at: i === 0 ? '2027-01-05T00:00:00Z' : null, required: true }] })) }];
    const m = journeyMap({ stages: STAGES, people, cohort, today: new Date('2027-01-12T10:00:00Z') });
    const tr = m.stages.find((s) => s.key === 'training');
    expect(tr).toMatchObject({ duration_days: 3, window: { from: '2027-01-06', to: '2027-01-08' }, late: 1 });
  });
});

describe('رحلة المشارك: تغيير المدة يمس التواريخ لا الفتح (البند 4.5)', () => {
  const stages = [
    { key: 'profile', sort: 1, duration_days: 0 }, { key: 'training', sort: 2, duration_days: 14 },
    { key: 'support', sort: 3, duration_days: 30 }, { key: 'evaluation', sort: 4, duration_days: 7, rules: { unlock: 'day', day: 40 } },
  ];
  const reqs = [
    { id: '1', stage_key: 'profile', code: 'P-INFO', kind: 'form', required: true, sort: 1 },
    { id: '2', stage_key: 'training', code: 'T-1', kind: 'check', required: true, sort: 1 },
    { id: '3', stage_key: 'support', code: 'S-1', kind: 'check', required: true, sort: 1 },
    { id: '4', stage_key: 'evaluation', code: 'E-POST', kind: 'auto', required: true, sort: 1 },
  ];
  const run = (schedule, progress, today = new Date('2027-01-20T00:00:00Z')) => {
    const def = cohortDefinition({ live: { stages, requirements: reqs }, version: null, cohort: { schedule } });
    return buildJourney({ stages: def.stages, requirements: def.requirements, progress, levels: {}, state: { profileCompleted: true }, cohortStart: '2027-01-01', today })
      .map((s) => [s.key, s.status]);
  };
  it('الانتقال للأمام بالاكتمال كما هو: تقصير التدريب أو تطويله لا يفتح ولا يقفل شيئًا', () => {
    const progress = { 2: { status: 'done' } };
    expect(run({ training: { days: 3 } }, progress)).toEqual(run({}, progress));
    expect(run({ training: { days: 60 } }, progress)).toEqual(run({}, progress));
    expect(run({}, progress).find(([k]) => k === 'support')[1]).toBe('active');
  });
  it('إعادة الحساب بعد الحفظ والتراجع تعطي الرحلة نفسها، والمنجز يبقى منجزًا', () => {
    const progress = { 2: { status: 'done' }, 3: { status: 'done' } };
    const before = run({}, progress);
    expect(run({ support: { days: 5 } }, progress)).toEqual(before);
    expect(before.filter(([, st]) => st === 'done').map(([k]) => k)).toEqual(['profile', 'training', 'support']);
  });
  it('«تُفتح يوم N» تبقى بتاريخها (القرار 20)، وبوابة القياس البعدي لا تتحرك بالمدد', () => {
    const progress = { 2: { status: 'done' }, 3: { status: 'done' } };
    // يوم 40 من 1 يناير هو 10 فبراير: قبله مقفلة أيًا كانت المدد، وبعده مفتوحة
    expect(run({ training: { days: 1 }, support: { days: 1 } }, progress).find(([k]) => k === 'evaluation')[1]).toBe('locked');
    expect(run({}, progress, new Date('2027-02-12T00:00:00Z')).find(([k]) => k === 'evaluation')[1]).not.toBe('locked');
  });
});

describe('planEdit: تحرير الخطة', () => {
  it('المدة الخاصة تُكتب، وما يساوي البرنامج يُحذف، وnull «ارجع لمدة البرنامج»، ولا يُمس off وwith', () => {
    const r = planEdit({ stages: STAGES, schedule: { ojt: { off: true } }, edit: { days: { training: 21, support: 30 } } });
    expect(r.schedule).toEqual({ ojt: { off: true }, training: { days: 21 } });
    expect(r.errors).toEqual([]);
    expect(planEdit({ stages: STAGES, schedule: r.schedule, edit: { days: { training: null } } }).schedule).toEqual({ ojt: { off: true } });
  });
  it('الحدود: الإلزامية من 1 إلى 365 يومًا، والاختيارية من 0، والمرحلة الغريبة ترفض', () => {
    const st = [...STAGES, S('extra', 9, 5, { rules: { mode: 'optional' } })];
    const bad = planEdit({ stages: st, edit: { days: { training: 0, support: 400, nope: 3 } } });
    expect(bad.errors.map((e) => e.code)).toEqual(['range', 'range', 'unknown']);
    expect(planEdit({ stages: st, edit: { days: { extra: 0 } } }).schedule).toEqual({ extra: { days: 0 } });
  });
  it('المثبت بتاريخين لا تُعدَّل مدته، و«حرّر التواريخ لتتبع المدد» يحوله مدة بطوله الحالي', () => {
    const cohort = { starts_on: '2027-01-04' };
    const schedule = { approval: { start: '2027-01-04', end: '2027-01-05' }, training: { start: '2027-01-06', end: '2027-01-25' } };
    expect(planEdit({ stages: STAGES, schedule, cohort, edit: { days: { training: 10 } } }).errors[0].code).toBe('pinned');
    const f = planEdit({ stages: STAGES, schedule, cohort, edit: { follow: true } });
    expect(f.schedule).toEqual({ training: { days: 20 } });
    // التواريخ نفسها بعد التحرير، فلا يتحرك شيء إلا ما تغيّرت مدته بعده
    expect(cohortPlan(STAGES, { ...cohort, schedule: f.schedule }).windows).toEqual(cohortPlan(STAGES, { ...cohort, schedule }).windows);
    const both = planEdit({ stages: STAGES, schedule, cohort, edit: { follow: true, days: { training: 10 } } });
    expect(both.schedule).toEqual({ training: { days: 10 } });
  });
  it('اقترح مددًا تملأ مدة الدفعة: مدد للإلزامية لا تواريخ', () => {
    const d = suggestDays(STAGES, '2027-01-01', '2027-03-31');
    expect(Object.keys(d)).toEqual(['approval', 'training', 'ojt', 'support']);
    expect(Object.values(d).every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  });
  it('planLock: المغلقة للقراءة، والمفتوحة غير المثبتة لا تُعدَّل (القرار 21)، والمثبتة تُعدَّل', () => {
    expect(planLock({ status: 'closed' }).code).toBe('cohort_closed');
    expect(planLock({ is_default: true, program_version_id: null }).code).toBe('open_unpinned');
    expect(planLock({ is_default: true, program_version_id: 'v1' })).toBeNull();
    expect(sameSchedule({ a: { days: 1, start: 'x' } }, { a: { start: 'x', days: 1 } })).toBe(true);
  });
});

describe('planImpact: الأثر قبل الحفظ وحارس البريد', () => {
  const cohort = { starts_on: '2027-01-04' };
  const ms = [
    { id: 'm1', title_ar: 'نهاية التدريب', stage_key: 'training', anchor: 'stage_end', offset_days: 0, complete: 'manual', active: true },
    { id: 'm2', title_ar: 'بداية الدعم', stage_key: 'support', anchor: 'stage_start', offset_days: 0, complete: 'manual', active: true },
  ];
  const people = [{ id: 'p1', at: 'training', stagesDone: ['approval'], records: {} }, { id: 'p2', at: 'training', stagesDone: ['approval'], records: { m1: { done_at: '2027-01-10' } } }];
  it('تقصير التدريب: ما تغيّر، ونهاية الرحلة، ومن يقف فيه، والمعالم المتأخرة، والبريد المحجوب', () => {
    const imp = planImpact({ stages: STAGES, before: {}, after: { training: { days: 7 } }, cohort, milestones: ms, people, today: '2027-01-20T09:00:00Z', cutoff: '2026-11-17' });
    // التوجيه (7 أيام) يسير مع التدريب فصار مثله، فتتقدم المجموعة كلها والدعم بعدها أسبوعًا
    expect(imp.changes.map((x) => x.key)).toEqual(['training', 'support']);
    expect(imp.changes[0]).toMatchObject({ before: { days: 14, to: '2027-01-19' }, after: { days: 7, to: '2027-01-12' }, days_changed: true });
    expect(imp.changes[1]).toMatchObject({ before: { from: '2027-01-20' }, after: { from: '2027-01-13' }, days_changed: false });
    expect(imp.end.shift).toBe(-7);
    expect(imp.milestones.map((x) => [x.id, x.before, x.after])).toEqual([['m1', '2027-01-19', '2027-01-12'], ['m2', '2027-01-20', '2027-01-13']]);
    expect(imp.people).toMatchObject({ total: 2, by_stage: [{ key: 'training', here: 2 }] });
    // «بداية الدعم» تنقلب متأخرة للاثنين. و«نهاية التدريب» متأخرة يومًا للأول قبل التعديل (داخل المهلة) فلا تُعد انقلابًا،
    // لكنها تصير ثمانية أيام فوق المهلة: مع «بداية الدعم» للاثنين ثلاث رسائل كانت ستُرسل في التشغيلة التالية، فيحجبها حارس الخطة
    expect(imp.late).toEqual({ milestones: 2, people: 2, cleared: 0 });
    expect(imp.mail).toEqual({ send: 0, held: 3 });
    const text = impactLines(imp).map((x) => x.text).join(' | ');
    expect(text).toContain('التدريب: أسبوعان إلى أسبوع، فتصير من 2027-01-06 إلى 2027-01-12');
    expect(text).toContain('الدعم: بمدتها نفسها، وتصير من 2027-01-13');
    expect(text).toContain('تتقدم نهاية الرحلة سبعة أيام');
    expect(text).toContain('معلمان يصيران متأخرين على أصحابها (عدد من يتأثر: 2)');
    expect(text).toContain('البريد: لن يُرسل شيء الآن. 3 رسائل «معلم متأخر»');
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
  it('تطويل يزيح ما بعده ويؤخر النهاية، و«تُفتح يوم N» تُسمى، وبلا أعضاء محسوبين يُقال ذلك', () => {
    const st = STAGES.map((s) => (s.key === 'support' ? { ...s, rules: { unlock: 'day', day: 30 } } : s));
    const imp = planImpact({ stages: st, before: {}, after: { training: { days: 21 } }, cohort, milestones: ms, people: null });
    expect(imp.end.shift).toBe(7);
    expect(imp.day_rules).toEqual(['الدعم']);
    expect(imp.people).toBeNull();
    const lines = impactLines(imp).map((x) => x.text);
    expect(lines).toContain('تتأخر نهاية الرحلة سبعة أيام، فتنتهي 2027-02-25');
    expect(lines.some((t) => t.includes('لم يُحسب أثره على كل عضو'))).toBe(true);
  });
  it('حارس البريد: يوم آخر حفظ للخطة يمنع ما صار متأخرًا بالتعديل، وما يحل بعده يُرسل', () => {
    const days = planDays([{ entity_id: 'c1', created_at: '2027-01-20T08:00:00Z' }, { entity_id: 'c1', created_at: '2027-01-02T08:00:00Z' }]);
    expect(days).toEqual({ c1: '2027-01-20' });
    const since = planCutoff('2026-11-17', days.c1);
    expect(since).toBe('2027-01-20');
    expect(planCutoff('2027-02-01', '2027-01-20')).toBe('2027-02-01');
    const late = (due, late_days) => ({ status: 'late', due, due_source: 'window', late_days });
    expect(lateNoticeAllowed(late('2027-01-12', 8), 3, since)).toBe(false);
    expect(lateNoticeAllowed(late('2027-01-21', 5), 3, since)).toBe(true);
    expect(lateNoticeAllowed(late('2027-01-12', 8), 3, '2026-11-17')).toBe(true);
  });
});

describe('اللوحة: المسودة والعداد بلا حساب تاريخ', () => {
  const def = { stages: STAGES };
  it('planDraft: المسودة من planEdit وتواريخها من cohortPlan، والتعديلات تُعد', () => {
    const cohort = { id: 'c1', starts_on: '2027-01-04', schedule: {} };
    const d = planDraft({ def, cohort, edit: { days: { training: 21 } } });
    expect(d.edits).toBe(1);
    expect(d.rows.training).toMatchObject({ days: 21, source: 'cohort', edited: true, source_ar: 'معدّلة: البرنامج أسبوعان', was_ar: 'كانت أسبوعان', days_ar: '3 أسابيع' });
    expect(d.cohort.schedule).toEqual({ training: { days: 21 } });
    expect(planDraft({ def, cohort }).edits).toBe(0);
  });
  it('العداد: خطوة يوم أو أسبوع تام، ولا ينزل عن حد المرحلة، والحقل بوحدته', () => {
    expect(stepDays(14, 'days', 1)).toBe(15);
    expect(stepDays(10, 'weeks', 1)).toBe(14);
    expect(stepDays(10, 'weeks', -1)).toBe(7);
    expect(stepDays(14, 'weeks', -1)).toBe(7);
    expect(stepDays(1, 'days', -1, 1)).toBe(1);
    expect(stepDays(365, 'weeks', 1)).toBe(365);
    expect(inUnit(14, 'weeks')).toBe(2);
    expect(inUnit(10, 'weeks')).toBe(1.4);
    expect(fromUnit('3', 'weeks')).toBe(21);
    expect(fromUnit('٢١', 'days')).toBe(21);
    expect(fromUnit('x', 'days')).toBeNull();
  });
});

describe('جاهزية الدفعة وكاتب الخطة الوحيد (القرار 23)', () => {
  it('بند «خطة المراحل» يُعاد تعريفه: تاريخ البداية لا عدد المفاتيح، ويسمي المثبت', () => {
    const it0 = (cohort) => cohortSetup({ cohort }).find((x) => x.key === 'schedule');
    expect(it0({ starts_on: null, schedule: { a: { start: '2027-01-01' } } }).ok).toBe(false);
    expect(it0({ starts_on: '2027-01-01', schedule: {} })).toMatchObject({ ok: true, where: 'journey', pinned: 0 });
    expect(it0({ starts_on: '2027-01-01', schedule: { a: { start: '2027-01-01', end: '2027-01-09' } } }).pinned).toBe(1);
  });
  it('نافذة «الجدول» أُزيلت، وadmin.cohort-save يرفض schedule وdistribute، والإجراء الجديد بغلاف الكاتب للحفظ', () => {
    expect(read('admin-app/src/screens/Milestones.jsx')).not.toContain('CohortSchedule');
    expect(read('admin-app/src/screens/Programs.jsx')).not.toContain('CohortSchedule');
    const programs = read('supabase/functions/leaders-api/programs.ts');
    expect(programs).toContain("if ('schedule' in b || 'distribute' in b) {");
    expect(programs).not.toContain('distributeSchedule(');
    const index = read('supabase/functions/leaders-api/index.ts');
    expect(index).toContain("'admin.cohort-plan': (a, b) => (b?.op === 'preview' || b?.op === 'history' ? CP.cohortPlanAction(a, b) : A.writer(a, CP.cohortPlanAction, b)),");
  });
});
