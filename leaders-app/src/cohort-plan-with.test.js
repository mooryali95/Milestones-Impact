// R3a «التوازي بإزاحة ومدة (تخطيطًا)» (docs/ops/2026-11-17-تصور-محرر-رحلة-الدفعة-v1.md): «تسير مع» مرجعها وتبدأ بعد إزاحة من
// بدايته وتمتد بمدتها، والمجموعة تنتهي بأطول أعضائها وما بعدها يُزاح منها. الإزاحة على البرنامج (rules.offset) وعلى الدفعة
// (with وoffset في خطتها)، والفتح يبقى مع بداية المرجع (القرار 6)، والحراس (مرجع سابق في المحور يعمل، والإزاحة إلى مدته)،
// وتنبيه التجاوز، والأثر، والخط الزمني بممراته، والتوزيع.
import { describe, expect, it } from 'vitest';
import { cohortPlan, planDaysOnly, planWithOf, planWithRules } from '../../supabase/functions/leaders-api/stage-windows.js';
import {
  buildJourney, cleanScheduleReport, cleanStageRules, cohortDefinition, distributeSchedule, stageRules, stageRulesIssues, stageRuleSummary,
} from '../../supabase/functions/leaders-api/logic.js';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import {
  impactLines, impactSummary, planEdit, planImpact, planNotice, planOffBlock, planWithCandidates, planWithIssues, planWithLock, suggestDays,
} from '../../supabase/functions/leaders-api/cohort-plan.js';
import { formToStage, stageFields, stageToForm } from '../../admin-app/src/methodology.js';
import { historyRows, planBody, planDraft } from '../../admin-app/src/cohort-journey.js';

const S = (key, sort, days, extra = {}) => ({ key, sort, title_ar: key, duration_days: days, phase: 'qualification', active: true, ...extra });
const STAGES = [
  S('profile', 1, 0, { phase: 'admission', title_ar: 'الملف' }),
  S('training', 2, 14, { title_ar: 'التدريب' }),
  S('ojt', 3, 7, { title_ar: 'التوجيه', rules: { unlock: 'with', with: 'training' } }),
  S('consulting', 4, 21, { title_ar: 'الاستشارة' }),
  S('dayrule', 5, 7, { title_ar: 'اللقاء', rules: { unlock: 'day', day: 60 } }),
  S('evaluation', 6, 7, { phase: 'impact', title_ar: 'التقييم' }),
];
const START = '2027-01-04';
const plan = (schedule, extra = {}) => cohortPlan(STAGES, { starts_on: START, schedule, ...extra });

describe('cohortPlan: «تسير مع» بإزاحة ومدة', () => {
  it('التوجيه يسير مع التدريب بعد أسبوع لمدة أسبوعين: يبدأ 11 يناير وينتهي 24 يناير، وما بعدهما يبدأ 25 يناير', () => {
    const p = plan({ ojt: { offset: 7, days: 14 } });
    expect(p.byKey.training).toMatchObject({ from: '2027-01-04', to: '2027-01-17' });
    expect(p.byKey.ojt).toMatchObject({ from: '2027-01-11', to: '2027-01-24', days: 14, with: 'training', offset: 7, par_source: 'cohort', source: 'cohort' });
    expect(p.byKey.consulting.from).toBe('2027-01-25');
    // تنبيه التجاوز: مسموح، ويطول المحور بقدره
    const over = p.issues.find((x) => x.code === 'with_over');
    expect(over).toMatchObject({ stage: 'ojt', over: 7, extends: 7 });
    expect(over.msg).toBe('«التوجيه» تنتهي بعد «التدريب» بـسبعة أيام، فيطول محور «التأهيل» سبعة أيام');
    expect(p.changed).toBe(1);
  });
  it('بلا إزاحة كما كان: التوجيه من بداية التدريب، والمجموعة بطول أطولها، ولا تنبيه', () => {
    const p = plan({});
    expect(p.byKey.ojt).toMatchObject({ from: '2027-01-04', to: '2027-01-10', with: 'training', offset: 0, par_source: 'program' });
    expect(p.byKey.consulting.from).toBe('2027-01-18');
    expect(p.issues.filter((x) => x.code === 'with_over')).toEqual([]);
  });
  it('إزاحة داخل مدة المرجع لا تطيل المجموعة', () => {
    const p = plan({ ojt: { offset: 7 } });
    expect(p.byKey.ojt).toMatchObject({ from: '2027-01-11', to: '2027-01-17' });
    expect(p.byKey.consulting.from).toBe('2027-01-18');
    expect(p.issues.some((x) => x.code === 'with_over')).toBe(false);
  });
  it('قاعدة النسخة (rules.offset) حين لا يكون للدفعة توازٍ، وإزاحة الدفعة فوقها', () => {
    const st = STAGES.map((s) => (s.key === 'ojt' ? { ...s, rules: { unlock: 'with', with: 'training', offset: 3 } } : s));
    expect(cohortPlan(st, { starts_on: START }).byKey.ojt).toMatchObject({ from: '2027-01-07', offset: 3, par_source: 'program' });
    expect(cohortPlan(st, { starts_on: START, schedule: { ojt: { offset: 0 } } }).byKey.ojt).toMatchObject({ from: '2027-01-04', offset: 0, par_source: 'cohort' });
  });
  it('«لا شيء» (with: false) يجعلها بعد ما قبلها، و«تسير مع» مرحلة أخرى تنضم إلى مجموعتها', () => {
    const p = plan({ ojt: { with: false } });
    expect(p.byKey.ojt).toMatchObject({ from: '2027-01-18', to: '2027-01-24', with: null });
    const q = plan({ consulting: { with: 'training', offset: 14 } });
    expect(q.byKey.consulting).toMatchObject({ from: '2027-01-18', to: '2027-02-07', with: 'training', offset: 14 });
  });
  it('الإزاحة أكبر من مدة المرجع (قصرت بعد ضبطها) تُحصر في مدته ويُنبَّه', () => {
    const p = plan({ training: { days: 5 }, ojt: { offset: 9 } });
    expect(p.byKey.ojt).toMatchObject({ offset: 5, from: '2027-01-09' });
    expect(p.issues.find((x) => x.code === 'offset_range')?.stage).toBe('ojt');
  });
  it('بلا تاريخ بداية: المدد والإزاحة بلا تواريخ، وتنبيه التجاوز بالأيام النسبية. والمفتوحة تملك التوازي (القاعدة 7)', () => {
    const p = cohortPlan(STAGES, { schedule: { ojt: { offset: 10 } } });
    expect(p.byKey.ojt).toMatchObject({ from: null, offset: 10 });
    expect(p.issues.find((x) => x.code === 'with_over')).toMatchObject({ over: 3, extends: 3 });
    expect(planDaysOnly({ ojt: { with: 'training', offset: 2, start: '2027-01-01' }, a: { with: false, offset: 3 } }))
      .toEqual({ ojt: { with: 'training', offset: 2 }, a: { with: false } });
    const open = cohortPlan(STAGES, { is_default: true, starts_on: START, schedule: { ojt: { offset: 4 } } });
    expect(open.byKey.ojt).toMatchObject({ from: null, offset: 4 });
  });
  it('مرجع خطة الدفعة اللاحق أو من محور آخر أو الغائب يُتجاهل، فتبقى قاعدة النسخة ولا يُقفل أحد', () => {
    const later = planWithRules(STAGES, { training: { with: 'consulting' } });
    expect(stageRules(later.find((s) => s.key === 'training')).unlock).toBe('previous');
    const cross = planWithRules(STAGES, { evaluation: { with: 'consulting' } });
    expect(stageRules(cross.find((s) => s.key === 'evaluation')).unlock).toBe('previous');
    const day = planWithRules(STAGES, { dayrule: { with: 'consulting' } });
    expect(stageRules(day.find((s) => s.key === 'dayrule')).unlock).toBe('day');
    expect(planWithRules(STAGES, {})).toBe(STAGES);
    expect(planWithOf({ with: 'x', offset: 'a' })).toEqual({ with: 'x' });
  });
});

describe('البرنامج: rules.offset في المنظف والفحص والمحرر', () => {
  const list = STAGES.map(({ key, title_ar, sort, active, duration_days }) => ({ key, title_ar, sort, active, duration_days }));
  it('cleanStageRules يقبل إزاحة من 0 إلى مدة المرجع، ويحذف الصفر، ويرفض ما زاد أو لم يكن عددًا صحيحًا', () => {
    expect(cleanStageRules({ unlock: 'with', with: 'training', offset: 7 }, list, 'ojt')).toEqual({ unlock: 'with', with: 'training', offset: 7 });
    expect(cleanStageRules({ unlock: 'with', with: 'training', offset: 0 }, list, 'ojt')).toEqual({ unlock: 'with', with: 'training' });
    expect(cleanStageRules({ unlock: 'with', with: 'training', offset: '' }, list, 'ojt')).toEqual({ unlock: 'with', with: 'training' });
    expect(() => cleanStageRules({ unlock: 'with', with: 'training', offset: 15 }, list, 'ojt')).toThrow('الإزاحة من 0 إلى مدة «التدريب» (14 يومًا)');
    expect(() => cleanStageRules({ unlock: 'with', with: 'training', offset: 1.5 }, list, 'ojt')).toThrow('الإزاحة عدد أيام صحيح');
    // الإزاحة بلا «تبدأ مع» لا تُحفظ
    expect(cleanStageRules({ unlock: 'previous', offset: 3 }, list, 'ojt')).toEqual({});
    // رقم أو نص أرقام وحده (والأرقام العربية كما في خطة الدفعة)، وما سواه يُرفض لا يُحوَّل
    expect(cleanStageRules({ unlock: 'with', with: 'training', offset: '٧' }, list, 'ojt')).toEqual({ unlock: 'with', with: 'training', offset: 7 });
    for (const offset of [true, [4], '0x3', '1e0', {}]) {
      expect(() => cleanStageRules({ unlock: 'with', with: 'training', offset }, list, 'ojt')).toThrow('الإزاحة عدد أيام صحيح من 0 إلى 365');
    }
  });
  it('stageRules يقرأ الإزاحة لـ«تبدأ مع» وحدها، وstageRulesIssues ينبّه إن زادت على مدة المرجع، والجملة تقولها', () => {
    expect(stageRules({ rules: { unlock: 'with', with: 'a', offset: 4 } }).offset).toBe(4);
    expect(stageRules({ rules: { unlock: 'previous', offset: 4 } }).offset).toBe(0);
    const st = STAGES.map((s) => (s.key === 'ojt' ? { ...s, rules: { unlock: 'with', with: 'training', offset: 20 } } : s));
    const w = stageRulesIssues(st).filter((x) => x.rule === 'offset');
    expect(w).toHaveLength(1);
    expect(w[0].level).toBe('warn');
    expect(stageRuleSummary(st[2], st)).toContain('تُفتح مع بداية «التدريب»، ومخطط بعد 20 يومًا من بدايتها');
  });
  it('محرر المنهج: حقل الإزاحة بجانب «تبدأ مع»، ويُجمع في القواعد', () => {
    const f = stageFields([], STAGES, 'ojt').find((x) => x.name === 'rule_offset');
    expect(f.label).toBe('مخطط بعد كم يومًا من بدايتها');
    expect(f.show({ rule_unlock: 'with' })).toBe(true);
    expect(f.show({ rule_unlock: 'previous' })).toBe(false);
    const form = stageToForm({ ...STAGES[2], rules: { unlock: 'with', with: 'training', offset: 5 } });
    expect(form.rule_offset).toBe(5);
    expect(formToStage(form).rules).toMatchObject({ unlock: 'with', with: 'training', offset: 5 });
    expect(formToStage({ ...form, rule_offset: '' }).rules.offset).toBeUndefined();
    expect(formToStage({ ...form, rule_unlock: 'previous' }).rules.offset).toBeUndefined();
  });
});

describe('خطة الدفعة: المنظف والتحرير والحراس', () => {
  const keys = STAGES.map((s) => s.key);
  it('cleanScheduleReport يحفظ with: false بلا إزاحة، ويسقط مرجعًا ليس في التعريف مع إزاحته', () => {
    expect(cleanScheduleReport({ ojt: { with: false, offset: 3 }, consulting: { with: 'ghost', offset: 2, days: 9 } }, keys).schedule)
      .toEqual({ ojt: { with: false }, consulting: { days: 9 } });
    expect(cleanScheduleReport({ ojt: { with: 'training', offset: 7, days: 14 } }, keys).schedule).toEqual({ ojt: { with: 'training', offset: 7, days: 14 } });
  });
  it('planEdit يكتب المرجع والإزاحة، وما يساوي قاعدة النسخة لا يُكتب', () => {
    expect(planEdit({ stages: STAGES, edit: { offset: { ojt: 7 } } }).schedule).toEqual({ ojt: { offset: 7 } });
    expect(planEdit({ stages: STAGES, schedule: { ojt: { offset: 7 } }, edit: { offset: { ojt: 0 } } }).schedule).toEqual({});
    expect(planEdit({ stages: STAGES, edit: { with: { ojt: 'training' } } }).schedule).toEqual({});
    expect(planEdit({ stages: STAGES, edit: { with: { ojt: false } } }).schedule).toEqual({ ojt: { with: false } });
    expect(planEdit({ stages: STAGES, edit: { with: { consulting: 'training' }, offset: { consulting: 7 } } }).schedule).toEqual({ consulting: { with: 'training', offset: 7 } });
    // تغيير المرجع يعيد الإزاحة، و«ارجع لقاعدة البرنامج» يحذف الاثنين
    expect(planEdit({ stages: STAGES, schedule: { ojt: { offset: 7, days: 9 } }, edit: { with: { ojt: null } } }).schedule).toEqual({ ojt: { days: 9 } });
    const r = planEdit({ stages: STAGES, edit: { with: { consulting: 'training' }, offset: { consulting: 0 } } });
    expect(r.schedule).toEqual({ consulting: { with: 'training' } });
    expect(r.errors).toEqual([]);
  });
  it('الحراس: المرجع اللاحق (فلا حلقة)، والموقوف، والبوابة، وقاعدة فتح من البرنامج، والإزاحة فوق مدة المرجع أو بلا مرجع', () => {
    const err = (edit, schedule = {}) => planEdit({ stages: STAGES, schedule, edit }).errors.map((x) => x.code);
    expect(err({ with: { training: 'consulting' } })).toContain('with_order');
    expect(err({ with: { consulting: 'consulting' } })).toContain('with_self');
    expect(err({ with: { consulting: 'training' } }, { training: { off: true } })).toContain('with_off');
    expect(err({ with: { training: 'profile' } })).toContain('with_gate');
    expect(err({ with: { dayrule: 'consulting' } })).toContain('with_rule');
    expect(err({ with: { evaluation: 'consulting' } })).toContain('with_place');
    expect(err({ offset: { ojt: 15 } })).toContain('offset_range');
    expect(err({ offset: { ojt: -1 } })).toContain('offset_range');
    expect(err({ offset: { consulting: 3 } })).toContain('offset_alone');
    expect(err({ with: { ojt: false }, offset: { ojt: 3 } })).toContain('offset_alone');
    // تقصير المرجع تحت إزاحة الدفعة يُرفض باسمه
    expect(planEdit({ stages: STAGES, schedule: { ojt: { offset: 10 } }, edit: { days: { training: 7 } } }).errors[0])
      .toMatchObject({ code: 'offset_range', msg: 'إزاحة «التوجيه» من 0 إلى مدة «التدريب» (سبعة أيام)' });
    // خلل قائم قبل التعديل (نسخة رُقّيت) لا يمنع تعديلًا آخر
    const bad = { training: { with: 'consulting' } };
    expect(planWithIssues({ stages: STAGES, schedule: { ...bad, consulting: { days: 9 } }, before: bad })).toEqual([]);
    expect(planWithIssues({ stages: STAGES, schedule: bad }).map((x) => x.code)).toEqual(['with_order']);
  });
  it('الإزاحة في خطة الدفعة رقم أو نص أرقام وحده: [5] و\'0x3\' و\'1e0\' و[] وtrue تُرفض', () => {
    for (const v of [[5], '0x3', '1e0', [], true]) {
      expect(planEdit({ stages: STAGES, edit: { offset: { ojt: v } } }).errors.map((x) => x.code)).toEqual(['offset_range']);
    }
    expect(planEdit({ stages: STAGES, edit: { offset: { ojt: '٥' } } }).schedule).toEqual({ ojt: { offset: 5 } });
  });
  it('خلل قائم لا يمرر تعديلًا يلمس المرحلة نفسها: مرجع آخر خاطئ بالرمز نفسه يُرفض', () => {
    const st = [...STAGES, S('late1', 7, 3, { title_ar: 'لاحقة1' }), S('late2', 8, 3, { title_ar: 'لاحقة2' })];
    const bad = { training: { with: 'late1' } };
    // قائم قبل التعديل: تعديل مدة غيرها يمر
    expect(planEdit({ stages: st, schedule: bad, edit: { days: { consulting: 9 } } }).errors).toEqual([]);
    // يغيّر مرجعها إلى لاحقة أخرى: with_order جديد ولو تشابه الرمز
    expect(planEdit({ stages: st, schedule: bad, edit: { with: { training: 'late2' } } }).errors.map((x) => x.code)).toContain('with_order');
  });
  it('إزاحة الدفعة على مرجع النسخة إن كان بوابة قبول تُرفض with_gate', () => {
    const st = STAGES.map((s) => (s.key === 'ojt' ? { ...s, rules: { unlock: 'with', with: 'profile' } } : s));
    expect(planEdit({ stages: st, edit: { offset: { ojt: 1 } } }).errors.map((x) => x.code)).toContain('with_gate');
  });
  it('إخراج مرحلة من مجموعة تفصل مرجعًا عن تابعه يُرفض', () => {
    const st = [...STAGES.slice(0, 3), S('x', 3.5, 5, { title_ar: 'الثالثة', rules: { unlock: 'with', with: 'training' } }), ...STAGES.slice(3)];
    expect(planEdit({ stages: st, edit: { with: { ojt: false } } }).errors.map((x) => x.code)).toContain('with_place');
  });
  it('القائمة: مراحل سابقة في المحور تعمل ليست بوابة، وما بينها لا يفصل. وسبب المنع للبوابة وقاعدة اليوم', () => {
    // التوجيه يسير مع التدريب فلا يفصل، وهو نفسه مرجع مقبول (السلسلة تُحل إلى أولها)
    expect(planWithCandidates(STAGES, {}, 'consulting').map((s) => s.key)).toEqual(['training', 'ojt']);
    expect(planWithCandidates(STAGES, {}, 'ojt').map((s) => s.key)).toEqual(['training']);
    expect(planWithCandidates(STAGES, { ojt: { with: false } }, 'consulting').map((s) => s.key)).toEqual(['ojt']);
    expect(planWithCandidates(STAGES, { training: { off: true } }, 'consulting').map((s) => s.key)).toEqual(['ojt']);
    expect(planWithCandidates(STAGES, {}, 'evaluation')).toEqual([]);
    expect(planWithLock(STAGES[0]).code).toBe('with_gate');
    expect(planWithLock(STAGES[4])).toMatchObject({ code: 'with_rule', msg: '«اللقاء» تُفتح بيوم ثابت من بداية الدفعة (قاعدة البرنامج)، فلا تسير مع غيرها في دفعة' });
  });
  it('إيقاف مرجع يسير معه غيره بخطة الدفعة يُمنع (القرار 22)', () => {
    const b = planOffBlock(STAGES[3], { stages: STAGES, schedule: { evaluation: {}, dayrule: {}, ojt: { with: false }, x: {}, ...{ consulting: {} } } });
    expect(b).toBeNull();
    const st = [...STAGES.slice(0, 4), S('rider', 4.5, 3, { title_ar: 'التابعة' }), ...STAGES.slice(4)];
    expect(planOffBlock(st[3], { stages: st, schedule: { rider: { with: 'consulting' } } })?.code).toBe('with_target');
  });
});

describe('رحلة المشارك: الفتح مع بداية المرجع والإزاحة لا تقفل (القرار 6)', () => {
  const REQS = [
    { id: 'r1', stage_key: 'profile', code: 'P-1', kind: 'check', required: true, sort: 1, active: true },
    { id: 'r2', stage_key: 'training', code: 'T-1', kind: 'check', required: true, sort: 1, active: true },
    { id: 'r3', stage_key: 'ojt', code: 'O-1', kind: 'check', required: true, sort: 1, active: true },
    { id: 'r4', stage_key: 'consulting', code: 'C-1', kind: 'check', required: true, sort: 1, active: true },
    { id: 'r6', stage_key: 'evaluation', code: 'E-1', kind: 'check', required: true, sort: 1, active: true },
  ];
  const run = (schedule, progress = { r1: { status: 'done' } }) => {
    const def = cohortDefinition({ live: { stages: STAGES, requirements: REQS }, version: null, cohort: { starts_on: START, schedule } });
    return Object.fromEntries(buildJourney({ stages: def.stages, requirements: def.requirements, progress, levels: {}, state: { profileCompleted: true },
      cohortStart: START, today: new Date('2027-01-05T00:00:00Z') }).map((s) => [s.key, s.status]));
  };
  it('التوجيه بإزاحة أسبوع يُفتح مع التدريب اليوم الثاني من الدفعة، لا بعد أسبوع', () => {
    expect(run({ ojt: { offset: 7 } })).toMatchObject({ training: 'active', ojt: 'active', consulting: 'locked' });
    expect(run({})).toMatchObject({ training: 'active', ojt: 'active' });
  });
  it('«تسير مع» للدفعة تُفتح مع مرجعها، و«لا شيء» تنتظر ما قبلها، والبوابات كما هي', () => {
    expect(run({ consulting: { with: 'training', offset: 14 } })).toMatchObject({ consulting: 'active' });
    expect(run({ ojt: { with: false } })).toMatchObject({ training: 'active', ojt: 'locked' });
    const def = cohortDefinition({ live: { stages: STAGES, requirements: REQS }, version: null, cohort: { schedule: { ojt: { offset: 7 } } } });
    expect(def.stages.find((s) => s.key === 'profile').rules).toBeUndefined();
    expect(def.stages.find((s) => s.key === 'ojt').rules).toEqual({ unlock: 'with', with: 'training', offset: 7 });
  });
});

describe('الأثر والسجل والإشعار', () => {
  const cohort = { starts_on: START, ends_on: '2027-04-30' };
  it('سطر التوازي في نافذة الأثر ومتى تُفتح، والملخص في السجل', () => {
    const im = planImpact({ stages: STAGES, before: {}, after: { ojt: { offset: 7, days: 14 } }, cohort });
    const ojt = im.changes.find((x) => x.key === 'ojt');
    expect(ojt).toMatchObject({ with_changed: true, days_changed: true });
    const lines = impactLines(im);
    expect(lines.find((x) => x.key === 'c-ojt').text).toBe('التوجيه: تسير مع «التدريب» بعد سبعة أيام من بدايتها بدل بدايتها، ومدتها أسبوع إلى أسبوعان، فتصير من 2027-01-11 إلى 2027-01-24');
    expect(lines.find((x) => x.key === 'par-ojt').text).toBe('«التوجيه» تُفتح لأصحابها مع بداية «التدريب»، والإزاحة تخطيط للتواريخ وحدها فلا تقفلها حتى موعدها المخطط');
    expect(im.issues.some((x) => x.code === 'with_over')).toBe(true);
    expect(impactSummary(im).changes.find((x) => x.key === 'ojt')).toMatchObject({ with: ['training', 'training'], offset: [0, 7] });
    expect(historyRows([{ id: 1, at: 'x', action: 'cohort.plan', summary: { changes: [{ key: 'ojt', before: 7, after: 7, with: ['training', 'training'], offset: [0, 7] }] } }])[0].text)
      .toBe('مرحلة واحدة تغيّر توازيها');
  });
  it('«لا شيء» و«تسير مع» مرحلة أخرى بسطورهما، والإشعار يسمي ما تغيّر توقيته', () => {
    const a = impactLines(planImpact({ stages: STAGES, before: {}, after: { ojt: { with: false } }, cohort }));
    expect(a.find((x) => x.key === 'c-ojt').text).toBe('التوجيه: لم تعد تسير مع «التدريب»، فتبدأ بعد ما قبلها، فتصير من 2027-01-18 إلى 2027-01-24');
    expect(a.find((x) => x.key === 'par-ojt').text).toBe('«التوجيه» تُفتح لأصحابها بعد اكتمال الإلزامية قبلها');
    const im = planImpact({ stages: STAGES, before: {}, after: { consulting: { with: 'training' } }, cohort });
    expect(impactLines(im).find((x) => x.key === 'c-consulting').text).toContain('تسير مع «التدريب» من بدايتها');
    expect(planNotice(im, (d) => d).body).toContain('تغيّر توقيت «الاستشارة».');
  });
  it('جسم المعاينة يحمل with وoffset، والمسودة تعطي البطاقة القائمة وحد الإزاحة وتنبيه التجاوز', () => {
    expect(planBody({ id: 'c' }, { days: {}, with: { ojt: 'training' }, offset: { ojt: 7 } }, 'preview')).toMatchObject({ with: { ojt: 'training' }, offset: { ojt: 7 } });
    expect(planBody({ id: 'c' }, { days: {}, with: {}, offset: {} }, 'preview')).not.toHaveProperty('with');
    const d = planDraft({ def: { stages: STAGES, requirements: [] }, cohort: { ...cohort, schedule: {} }, edit: { days: { ojt: 14 }, offset: { ojt: 7 } } });
    expect(d.rows.ojt).toMatchObject({ with: 'training', offset: 7, offset_max: 14, par_source: 'cohort', edited: true });
    expect(d.rows.ojt.with_options.map((o) => o.key)).toEqual(['training']);
    expect(d.rows.ojt.over.code).toBe('with_over');
    expect(d.rows.profile.with_lock.code).toBe('with_gate');
    expect(d.edits).toBe(1);
  });
});

describe('الخط الزمني والتوزيع', () => {
  it('الممر يبدأ بإزاحته داخل الخانة، والبطاقة تقول «تُفتح في …» و«مخطط من …» بلغة واحدة', () => {
    const m = journeyTimeline({ stages: STAGES, requirements: [] }, { cohort: { id: 'c', starts_on: START, schedule: { ojt: { offset: 7 } } }, today: '2027-01-01' });
    const ojt = m.stages.find((s) => s.key === 'ojt');
    expect(ojt.together).toBe(true);
    expect(ojt.lane_at).toBe(50);
    expect(ojt.offset).toBe(7);
    expect(ojt.with_note).toBe('تُفتح مع «التدريب»، ومخطط بعد سبعة أيام من بدايتها');
    expect(ojt.offset_ar).toBe('تُفتح مع «التدريب» في 4 يناير، ومخطط من 11 يناير');
    // «تسير مع» من خطة الدفعة تصنع الممر، و«لا شيء» تخرجها من خانتها
    const n = journeyTimeline({ stages: STAGES, requirements: [] }, { cohort: { id: 'c', starts_on: START, schedule: { consulting: { with: 'training' }, ojt: { with: false } } } });
    expect(n.slots.find((x) => x.key === 'training').stages).toEqual(['training', 'consulting']);
    expect(n.slots.some((x) => x.key === 'ojt')).toBe(true);
    // بلا دفعة (البرنامج): الإزاحة من القاعدة نسبيًا
    const st = STAGES.map((s) => (s.key === 'ojt' ? { ...s, rules: { unlock: 'with', with: 'training', offset: 7 } } : s));
    const p = journeyTimeline({ stages: st, requirements: [] });
    expect(p.stages.find((s) => s.key === 'ojt')).toMatchObject({ lane_at: 50, offset_ar: 'تُفتح مع «التدريب»، ومخطط بعد سبعة أيام من بدايتها' });
  });
  it('distributeSchedule: التابع يبدأ بعد إزاحته من بداية مرجعه، والمجموعة بمدى أبعد أعضائها', () => {
    const st = [S('a', 1, 14), S('b', 2, 14, { rules: { unlock: 'with', with: 'a', offset: 7 } }), S('c', 3, 21)];
    const d = distributeSchedule(st, '2027-01-01', '2027-02-11');
    expect(d.a).toEqual({ start: '2027-01-01', end: '2027-01-14' });
    expect(d.b).toEqual({ start: '2027-01-08', end: '2027-01-21' });
    expect(d.c).toEqual({ start: '2027-01-22', end: '2027-02-11' });
    // بلا إزاحة كما كان
    const z = distributeSchedule([S('a', 1, 14), S('b', 2, 7, { rules: { unlock: 'with', with: 'a' } }), S('c', 3, 14)], '2027-01-01', '2027-01-28');
    expect(z.b.start).toBe('2027-01-01');
  });
  it('suggestDays يحترم توازي الدفعة وإزاحته: الرحلة تنتهي يوم نهاية الدفعة', () => {
    const st = [S('a', 1, 14), S('b', 2, 14), S('c', 3, 21)];
    const schedule = { b: { with: 'a', offset: 7 } };
    const sug = suggestDays(st, '2027-01-01', '2027-02-11', schedule);
    const p = cohortPlan(st, { starts_on: '2027-01-01', schedule: { ...schedule, ...Object.fromEntries(Object.entries(sug).map(([k, n]) => [k, { ...(schedule[k] || {}), days: n }])) } });
    expect(p.end).toBe('2027-02-11');
    expect(p.byKey.b.with).toBe('a');
  });
  it('suggestDays مع تابع تتجاوز إزاحته مرجعه: لا تقصر الرحلة عن نهاية الدفعة (الإزاحة أيام ثابتة لا تتسع بالتوزيع)', () => {
    const st = [S('a', 1, 10), S('b', 2, 5), S('c', 3, 4)];
    for (const offset of [8, 3, 0]) {
      const schedule = { b: { with: 'a', offset } };
      const sug = suggestDays(st, '2026-01-01', '2026-03-01', schedule);
      const p = cohortPlan(st, { starts_on: '2026-01-01', ends_on: '2026-03-01', schedule: { ...schedule, ...Object.fromEntries(Object.entries(sug).map(([k, n]) => [k, { ...(schedule[k] || {}), days: n }])) } });
      expect(p.end).toBe('2026-03-01');
    }
  });
});
