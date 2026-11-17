// R2b «إيقاف المرحلة للدفعة» (docs/ops/2026-11-17-تصور-محرر-رحلة-الدفعة-v1.md): الموقوفة لا نافذة لها ويُزاح ما بعدها،
// وتسقط من رحلة المشارك مع بنودها، و«بعد مراحل» تنتظرها يُحذف شرطها (القرار 22)، ومرجع «تبدأ مع» والمحمية لا تُوقف،
// ومعالمها تُستبعد من الدفعة ومن الدرجة (القرار 15)، والأثر يسمي من ينتقل ومن تجاوز مرحلة تعود (القرار 12)، والإشعار (القرار 13).
import { describe, expect, it } from 'vitest';
import { cohortPlan, planDaysOnly, planOffKeys, planRules } from '../../supabase/functions/leaders-api/stage-windows.js';
import { buildJourney, cleanScheduleReport, cohortDefinition, milestoneStatuses, milestoneSummary } from '../../supabase/functions/leaders-api/logic.js';
import { cohortMilestones, milestoneOff } from '../../supabase/functions/leaders-api/milestones.js';
import { journeyMap } from '../../supabase/functions/leaders-api/journey-map.js';
import { journeyTimeline } from '../../supabase/functions/leaders-api/journey-timeline.js';
import {
  impactLines, impactSummary, planEdit, planImpact, planNotice, planOffBlock, planRestartBlock, planUpgradeBlock, suggestDays,
} from '../../supabase/functions/leaders-api/cohort-plan.js';
import { cohortTimeline, historyRows, journeyKpis, journeyLanes, planBody, planDraft } from '../../admin-app/src/cohort-journey.js';

const S = (key, sort, days, extra = {}) => ({ key, sort, title_ar: key, duration_days: days, phase: 'qualification', active: true, ...extra });
const STAGES = [
  S('profile', 1, 0, { phase: 'admission', title_ar: 'الملف' }),
  S('training', 2, 14, { title_ar: 'التدريب' }),
  S('ojt', 3, 7, { title_ar: 'التوجيه', rules: { unlock: 'with', with: 'training' } }),
  S('consulting', 4, 21, { title_ar: 'الاستشارة' }),
  S('project', 5, 14, { title_ar: 'المشروع', rules: { unlock: 'stages', after: ['consulting', 'training'] } }),
  S('evaluation', 6, 7, { phase: 'impact', title_ar: 'التقييم' }),
];
const REQS = [
  { id: 'r1', stage_key: 'profile', code: 'P-INFO', kind: 'form', title_ar: 'بيانات الملف', required: true, sort: 1, active: true },
  { id: 'r2', stage_key: 'training', code: 'T-1', kind: 'check', required: true, sort: 1, active: true },
  { id: 'r3', stage_key: 'ojt', code: 'O-1', kind: 'check', required: true, sort: 1, active: true },
  { id: 'r4', stage_key: 'consulting', code: 'C-1', kind: 'coaching', required: true, sort: 1, active: true },
  { id: 'r5', stage_key: 'project', code: 'J-1', kind: 'check', required: true, sort: 1, active: true },
  { id: 'r6', stage_key: 'evaluation', code: 'E-POST', kind: 'auto', title_ar: 'القياس البعدي', required: true, sort: 1, active: true },
];
const START = '2027-01-04';

describe('cohortPlan: الموقوفة لا نافذة لها ولا تأخذ يومًا، وما بعدها يُزاح', () => {
  it('الاستشارة موقوفة: المشروع يبدأ في مكانها، والنهاية تتقدم بمدتها', () => {
    const on = cohortPlan(STAGES, { starts_on: START });
    const p = cohortPlan(STAGES, { starts_on: START, schedule: { consulting: { off: true } } });
    expect(p.byKey.consulting).toMatchObject({ off: true, source: 'off', from: null, to: null, days: 0, program_days: 21 });
    expect(p.windows.consulting).toBeUndefined();
    expect(p.byKey.project.from).toBe(on.byKey.consulting.from);
    expect(p.end).toBe('2027-02-07');
    expect(on.end).toBe('2027-02-28');
    // الخطة كلها مؤرخة ما دامت كل مرحلة عاملة مؤرخة، والموقوفة في مكانها بترتيب المراحل وتُعد تعديلًا
    expect(p.dated).toBe(true);
    expect(p.stages.map((x) => x.key)).toEqual(STAGES.map((s) => s.key));
    expect(p.off).toEqual(['consulting']);
    expect(p.changed).toBe(1);
  });
  it('الإيقاف يبقي المدة الخاصة، فتعود بها بنقرة', () => {
    const p = cohortPlan(STAGES, { starts_on: START, schedule: { consulting: { off: true, days: 10 } } });
    expect(p.byKey.consulting).toMatchObject({ off: true, own_days: 10, from: null });
    const back = cohortPlan(STAGES, { starts_on: START, schedule: { consulting: { days: 10 } } });
    expect(back.byKey.consulting).toMatchObject({ days: 10, source: 'cohort' });
  });
  it('الدفعة المفتوحة تملك الإيقاف بلا تواريخ (القرار 21)، والمنظف يحفظه', () => {
    expect(planDaysOnly({ consulting: { off: true, start: '2027-01-01' }, training: { days: 3 } })).toEqual({ consulting: { off: true }, training: { days: 3 } });
    const p = cohortPlan(STAGES, { is_default: true, starts_on: START, schedule: { consulting: { off: true } } });
    expect(p.byKey.consulting.off).toBe(true);
    expect(p.windows).toEqual({});
    expect(cleanScheduleReport({ consulting: { off: true } }, STAGES.map((s) => s.key)).schedule).toEqual({ consulting: { off: true } });
  });
});

describe('تعريف الدفعة: الموقوفة تسقط ومعها بنودها، و«بعد مراحل» يُعاد كتابته (القرار 22)', () => {
  const live = { stages: STAGES, requirements: REQS };
  it('الاستشارة موقوفة: لا مرحلة ولا بند، والمشروع ينتظر التدريب وحده، وstages_off يسميها', () => {
    const def = cohortDefinition({ live, version: null, cohort: { schedule: { consulting: { off: true } } } });
    expect(def.stages.map((s) => s.key)).not.toContain('consulting');
    expect(def.requirements.map((r) => r.code)).not.toContain('C-1');
    expect(def.stages.find((s) => s.key === 'project').rules).toEqual({ unlock: 'stages', after: ['training'] });
    expect(def.stages_off).toEqual([{ key: 'consulting', title_ar: 'الاستشارة', phase: 'qualification', sort: 4 }]);
    expect(def.rule_rewrites).toEqual([{ key: 'project', title: 'المشروع', dropped: ['consulting'], to: 'stages', rule: 'stages' }]);
  });
  it('إن فرغ شرط «بعد مراحل» صار «بعد السابقة»، و«تبدأ مع» موقوفة (نسخة رُقّيت بعدها) لا تقفل للأبد', () => {
    const r = planRules([S('a', 1, 1, { rules: { unlock: 'stages', after: ['x'], mode: 'optional' } }), S('b', 2, 1, { rules: { unlock: 'with', with: 'x' } })], new Set(['x']));
    expect(r.stages[0].rules).toEqual({ mode: 'optional' });
    expect(r.stages[1].rules).toEqual({});
    expect(r.rewrites.map((x) => [x.to, x.rule])).toEqual([['previous', 'stages'], ['previous', 'with']]);
    expect(planRules(STAGES, new Set()).stages).toBe(STAGES);
  });
  it('تعريف اللوحة (بلا دفعة) يبقي الموقوفة، فتُعرض باهتة وتعود بنقرة', () => {
    expect(cohortDefinition({ live, version: null, cohort: null }).stages.map((s) => s.key)).toContain('consulting');
  });
});

describe('رحلة المشارك مع الإيقاف (البند 4.5): الانتقال للأمام، وإعادة التشغيل، والبوابات، والقياس البعدي', () => {
  const run = (schedule, progress, overrides = {}) => {
    const def = cohortDefinition({ live: { stages: STAGES, requirements: REQS }, version: null, cohort: { schedule } });
    return Object.fromEntries(buildJourney({ stages: def.stages, requirements: def.requirements, progress, levels: {}, state: { profileCompleted: true },
      overrides, cohortStart: START, today: new Date('2027-02-01T00:00:00Z') }).map((s) => [s.key, s.status]));
  };
  const trained = { r2: { status: 'done' }, r3: { status: 'done' } };
  it('من يقف في الاستشارة ينتقل إلى ما بعدها حين تُوقف، والمشروع لا يُقفل للأبد', () => {
    expect(run({}, trained)).toMatchObject({ consulting: 'active', project: 'locked', evaluation: 'locked' });
    const off = run({ consulting: { off: true } }, trained);
    expect(off.consulting).toBeUndefined();
    expect(off.project).toBe('active');
  });
  it('المنجز لا يُمس، والتقدم في الموقوفة محفوظ: إعادتها بعد إكمال بندها تعود مكتملة', () => {
    const done = { ...trained, r4: { status: 'done' } };
    expect(run({}, done).consulting).toBe('done');
    expect(run({ consulting: { off: true } }, done).consulting).toBeUndefined();
    expect(run({}, done).consulting).toBe('done');
  });
  it('إعادة التشغيل بعد التجاوز: نشطة على من لم يكملها وتقفل ما بعدها، والإعفاء (skip) يبقي طريقه مفتوحًا (القرار 12)', () => {
    const passed = { ...trained, r5: { status: 'done' } };
    expect(run({ consulting: { off: true } }, passed)).toMatchObject({ project: 'done', evaluation: 'active' });
    expect(run({}, passed)).toMatchObject({ consulting: 'active', evaluation: 'locked' });
    expect(run({}, passed, { consulting: 'skip' })).toMatchObject({ consulting: 'done', evaluation: 'active' });
  });
  it('القياس البعدي لا يُفتح قبل موعده: مرحلته محمية، وإيقاف ما قبلها لا يفتحه قبل اكتمال ما بقي', () => {
    expect(planOffBlock(STAGES[5], { stages: STAGES, requirements: REQS })?.code).toBe('protected');
    expect(run({ consulting: { off: true } }, trained).evaluation).toBe('locked');
  });
});

describe('الحراس (البند 4.6): المحمية ومرجع «تبدأ مع» لا تُوقف، و«بعد مراحل» لا تمنع', () => {
  const edit = (off, schedule = {}) => planEdit({ stages: STAGES, schedule, edit: { off }, cohort: { starts_on: START }, requirements: REQS });
  it('بوابة القبول والمرحلة التي فيها بند يحسمه النظام', () => {
    const r = edit({ profile: true, evaluation: true });
    expect(r.errors.map((e) => [e.stage, e.code])).toEqual([['profile', 'protected'], ['evaluation', 'protected']]);
    expect(r.errors[1].msg).toContain('القياس البعدي');
    for (const k of ['assessment', 'approval']) expect(planOffBlock(S(k, 1, 1), { stages: [], requirements: [] })?.code).toBe('protected');
  });
  it('مرجع «تبدأ مع» لمرحلة تعمل يُرفض حتى يُنقل، ويمر إن أُوقف تابعه في التعديل نفسه', () => {
    const r = edit({ training: true });
    expect(r.errors).toEqual([{ stage: 'training', code: 'with_target', msg: '«التوجيه» تبدأ مع «التدريب»: أوقف أولًا ما يسير معها أو انقله' }]);
    expect(edit({ training: true, ojt: true }).errors).toEqual([]);
    expect(edit({ training: true }, { ojt: { off: true } }).errors).toEqual([]);
  });
  it('وإعادة تابع «تبدأ مع» ومرجعه يبقى موقوفًا تُرفض، وتمر إن أُعيد مرجعه معه (القرار 22)', () => {
    const both = { training: { off: true }, ojt: { off: true } };
    const r = edit({ ojt: false }, both);
    expect(r.errors).toEqual([{ stage: 'ojt', code: 'with_target_off', msg: '«التوجيه» تبدأ مع «التدريب» وهي موقوفة: أعد «التدريب» معها أو انقلها' }]);
    expect(edit({ ojt: false, training: false }, both)).toMatchObject({ errors: [], schedule: {} });
    expect(edit({ training: false }, both).errors).toEqual([]);
    expect(planRestartBlock(STAGES[2], { stages: STAGES, schedule: { training: { off: true } } })?.code).toBe('with_target_off');
    expect(planRestartBlock(STAGES[2], { stages: STAGES, schedule: {} })).toBeNull();
  });
  it('ترقية النسخة: موقوفة تصير محمية في النسخة الهدف تمنع الترقية بسببها', () => {
    const to = [...REQS, { id: 'r9', stage_key: 'consulting', code: 'E-POST', kind: 'auto', title_ar: 'القياس البعدي', required: true, sort: 2, active: true }];
    expect(planUpgradeBlock({ stages: STAGES, requirements: to, schedule: { consulting: { off: true } } })).toContain('أعدها من تبويب «الرحلة» ثم رقِّ النسخة');
    expect(planUpgradeBlock({ stages: STAGES, requirements: REQS, schedule: { consulting: { off: true } } })).toBe('');
  });
  it('المنتظَرة بـ«بعد مراحل» تُوقف، والإعادة تحذف off وحده وتبقي المدة', () => {
    const r = edit({ consulting: true }, { consulting: { days: 10 } });
    expect(r.errors).toEqual([]);
    expect(r.schedule).toEqual({ consulting: { days: 10, off: true } });
    expect(edit({ consulting: false }, r.schedule).schedule).toEqual({ consulting: { days: 10 } });
    expect(edit({ consulting: false }, { consulting: { off: true } }).schedule).toEqual({});
    expect(edit({ nope: true }).errors[0].code).toBe('unknown');
    expect(edit({ consulting: 'yes' }).errors[0].code).toBe('off_value');
  });
  it('«اقترح مددًا» لا يعطي الموقوفة شيئًا', () => {
    const sug = suggestDays(STAGES, START, '2027-02-28', { consulting: { off: true } });
    expect(sug.consulting).toBeUndefined();
    expect(Object.keys(sug).length).toBeGreaterThan(0);
  });
});

describe('المعالم: معالم الموقوفة تُستبعد من الدفعة ومن الدرجة ولا تُرسل (القرار 15)', () => {
  const ms = [
    { id: 'm1', stage_key: 'consulting', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, title_ar: 'نهاية الاستشارة' },
    { id: 'm2', stage_key: 'training', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, title_ar: 'نهاية التدريب' },
    { id: 'm3', stage_key: 'consulting', anchor: 'cohort_end', offset_days: 0, complete: 'stage', active: true, title_ar: 'يكتمل بالاستشارة' },
    { id: 'm4', stage_key: null, anchor: 'cohort_end', offset_days: 0, complete: 'manual', active: true, title_ar: 'نهاية الدفعة' },
  ];
  const cohort = { starts_on: START, ends_on: '2027-03-31', schedule: { consulting: { off: true } } };
  it('milestoneOff: المرتبط ببداية الموقوفة أو نهايتها أو يكتمل باكتمالها', () => {
    const off = planOffKeys(cohort.schedule);
    expect(ms.map((m) => milestoneOff(m, off))).toEqual([true, false, true, false]);
    expect(cohortMilestones(ms, cohort).map((m) => m.id)).toEqual(['m2', 'm4']);
  });
  it('رحلة المشارك لا تراها ولا تُعد في الملخص (درجة المعالم)', () => {
    const def = cohortDefinition({ live: { stages: STAGES, requirements: REQS }, version: null, cohort });
    const list = milestoneStatuses(ms, { cohort, stages: def.stages, stagesDone: new Set(['training']), today: '2027-04-10' });
    expect(list.map((m) => m.id).sort()).toEqual(['m2', 'm4']);
    expect(milestoneSummary(list)).toMatchObject({ total: 2, done: 1 });
  });
});

describe('الأثر قبل الحفظ: الموقوفة ومن ينتقل والقواعد والمعالم المستبعدة والإعادة والجلسات', () => {
  const ms = [
    { id: 'm1', stage_key: 'consulting', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, title_ar: 'نهاية الاستشارة' },
    { id: 'm2', stage_key: 'evaluation', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, title_ar: 'نهاية التقييم' },
  ];
  const cohort = { starts_on: START, ends_on: '2027-03-31' };
  const people = [
    { id: 'p1', at: 'consulting', stagesDone: ['profile', 'training', 'ojt'], open: ['profile', 'training', 'ojt', 'consulting'], records: {} },
    { id: 'p2', at: 'training', stagesDone: ['profile'], open: ['profile', 'training', 'ojt'], records: {} },
    { id: 'p3', at: null, stagesDone: STAGES.map((s) => s.key), open: STAGES.map((s) => s.key), records: {} },
  ];
  it('الإيقاف: سطر المرحلة، ومن فيها ينتقل، والمشروع لا ينتظرها، ومعلمها يُستبعد، والجلسات المحجوزة تُسمى', () => {
    const imp = planImpact({ stages: STAGES, before: {}, after: { consulting: { off: true } }, cohort, milestones: ms, people, today: '2027-01-20', booked: { consulting: 2 } });
    expect(imp.stopped).toEqual(['consulting']);
    expect(imp.changes[0]).toMatchObject({ key: 'consulting', off: 'stop' });
    expect(imp.end.shift).toBe(-21);
    expect(imp.moving).toEqual([{ key: 'consulting', title: 'الاستشارة', here: 1 }]);
    expect(imp.rewrites.map((r) => [r.key, r.dropped_titles])).toEqual([['project', ['الاستشارة']]]);
    expect(imp.excluded.map((m) => m.id)).toEqual(['m1']);
    expect(imp.milestones.map((m) => m.id)).toEqual(['m2']);
    expect(imp.booked).toEqual([{ key: 'consulting', title: 'الاستشارة', sessions: 2 }]);
    expect(imp.notify).toEqual({ members: 2 });
    const lines = impactLines(imp);
    const text = lines.map((x) => x.text).join('\n');
    expect(text).toContain('الاستشارة: تُوقف لهذه الدفعة');
    expect(text).toContain('مشارك واحد في «الاستشارة» الآن ينتقل إلى ما بعدها، وما أنجزه فيها محفوظ');
    expect(text).toContain('«المشروع» كانت تُفتح بعد اكتمال «الاستشارة»، فصار فتحها في هذه الدفعة لا ينتظرها');
    // «تبدأ مع» مرجعًا موقوفًا (نسخة رُقّيت بعده) بكلماتها: لم تكن تنتظر اكتماله
    const rw = impactLines(planImpact({ stages: STAGES, before: {}, after: { training: { off: true } }, cohort, milestones: [], people: null })).find((x) => x.key === 'rw-ojt');
    expect(rw.text).toBe('«التوجيه» كانت تبدأ مع «التدريب»، فصارت في هذه الدفعة تُفتح بعد ما قبلها');
    expect(text).toContain('«نهاية الاستشارة»');
    expect(text).toContain('جلستان محجوزتان في «الاستشارة» ستُحجب عن أصحابها');
    expect(text).toContain('البريد: لن يُرسل شيء الآن');
    expect(impactLines(imp, (d) => d, { notify: true }).find((x) => x.key === 'mail').text).toContain('يصل مشاركان في الرحلة إشعار «تغيّرت مواعيد رحلتك»');
    expect(impactSummary(imp)).toMatchObject({ stopped: ['consulting'], started: [], excluded: 1 });
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
  it('الإعادة: معلمها يعود بموعده، ومن تجاوزها وهي موقوفة ويصير فيها نشطًا يُعد (القرار 12)', () => {
    // p1 تجاوزها إلى المشروع وهي موقوفة، وp4 جديد في الملف والمشروع مفتوح عليه بلا شرط تقدم: لا يُعد متجاوزًا
    const back = [...people, { id: 'p4', at: 'profile', stagesDone: [], open: ['profile', 'project'], records: {} }]
      .map((p) => ({ ...p, at: p.id === 'p1' ? 'project' : p.at, after: { consulting: p.id === 'p1' || p.id === 'p4' ? 'active' : p.id === 'p2' ? 'locked' : 'done' }, open: p.id === 'p1' ? ['training', 'project'] : p.open }));
    const imp = planImpact({ stages: STAGES, before: { consulting: { off: true } }, after: {}, cohort, milestones: ms, people: back, today: '2027-01-20' });
    expect(imp.started).toEqual(['consulting']);
    expect(imp.restored.map((m) => m.id)).toEqual(['m1']);
    expect(imp.reenabled).toEqual([{ key: 'consulting', title: 'الاستشارة', passed: 1, ids: ['p1'] }]);
    const line = impactLines(imp).find((x) => x.kind === 'reenable');
    expect(line).toMatchObject({ stage: 'consulting', passed: 1 });
    expect(impactLines(imp).find((x) => x.off === 'start').text).toContain('تعود إلى رحلة هذه الدفعة');
  });
  it('الإشعار: نص واحد يسمي ما تغيّر بلا أسماء ولا أرقام نسخ', () => {
    const imp = planImpact({ stages: STAGES, before: {}, after: { consulting: { off: true } }, cohort, milestones: ms, people });
    const n = planNotice(imp, (d) => d);
    expect(n.title).toBe('تغيّرت مواعيد رحلتك');
    expect(n.body).toContain('لم تعد «الاستشارة» ضمن رحلة دفعتك، وما أنجزته فيها محفوظ.');
    expect(n.body).toContain('وتنتهي رحلتك الآن 2027-02-07.');
    expect(n.body).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('العرض: الخريطة والخط وتبويب الرحلة يظهر الموقوفة «موقوفة لهذه الدفعة»', () => {
  const cohort = { id: 'c', starts_on: START, ends_on: '2027-03-31', schedule: { consulting: { off: true } } };
  it('خريطة ملف الدفعة: الموقوفة في مكانها بلا أعداد', () => {
    const def = cohortDefinition({ live: { stages: STAGES, requirements: REQS }, version: null, cohort });
    const m = journeyMap({ stages: def.stages, people: [], cohort, off: def.stages_off });
    expect(m.stages.map((s) => s.key)).toEqual(['profile', 'training', 'ojt', 'consulting', 'project', 'evaluation']);
    expect(m.stages[3]).toMatchObject({ off: true, here: 0, done: 0, window: null });
    expect(m.bottleneck).toBeNull();
  });
  it('الخط الزمني يسقطها، والبطاقة باهتة في محورها بمعالمها المستبعدة', () => {
    expect(journeyTimeline({ stages: STAGES, requirements: REQS }, { cohort }).stages.map((s) => s.key)).not.toContain('consulting');
    const def = { stages: STAGES, requirements: REQS };
    const model = cohortTimeline(def, cohort, new Date('2027-01-10T00:00:00Z'));
    const ms = [{ id: 'm1', stage_key: 'consulting', anchor: 'stage_end', offset_days: 0, complete: 'stage', active: true, title_ar: 'نهاية الاستشارة' }];
    const lanes = journeyLanes(model, { def, cohort, milestones: ms });
    const q = lanes.phases.find((p) => p.key === 'qualification');
    const card = q.groups.flatMap((g) => g.stages).find((s) => s.key === 'consulting');
    expect(card).toMatchObject({ off: true, status_ar: 'موقوفة لهذه الدفعة' });
    expect(card.milestones[0]).toMatchObject({ excluded: true, due_ar: 'مستبعد لهذه الدفعة' });
    // بترتيبها: بعد مجموعة التدريب وقبل المشروع
    expect(q.groups.map((g) => g.stages[0].key)).toEqual(['training', 'consulting', 'project']);
    expect(lanes.cohort_milestones).toEqual([]);
    expect(lanes.counts).toMatchObject({ off: 1, milestones: 0 });
    expect(journeyKpis(model, lanes).find((k) => k.key === 'stages').value).toContain('وواحدة موقوفة');
  });
  it('المسودة: المفتاح وسبب قفله، والإيقاف تعديل، والجسم يحمل off وخيارات الحفظ', () => {
    const def = { stages: STAGES, requirements: REQS };
    const d = planDraft({ def, cohort: { ...cohort, schedule: {} }, edit: { off: { consulting: true } } });
    expect(d.rows.consulting).toMatchObject({ off: true, edited: true, was_ar: 'كانت تعمل', block: null });
    expect(d.rows.training.block?.code).toBe('with_target');
    expect(d.rows.profile.block?.code).toBe('protected');
    expect(d.rows.ojt.block).toBeNull();
    expect([d.edits, d.off]).toEqual([1, 1]);
    // إيقاف التابع يفتح مفتاح مرجعه في المسودة نفسها
    expect(planDraft({ def, cohort: { ...cohort, schedule: {} }, edit: { off: { ojt: true } } }).rows.training.block).toBeNull();
    // الموقوف التابع لا يُعاد ومرجعه موقوف: مفتاحه مقفل بسببه، ويُفتح حين يُعاد مرجعه في المسودة
    const both = { training: { off: true }, ojt: { off: true } };
    expect(planDraft({ def, cohort: { ...cohort, schedule: both } }).rows.ojt.block?.code).toBe('with_target_off');
    expect(planDraft({ def, cohort: { ...cohort, schedule: both } }).rows.training.block).toBeNull();
    expect(planDraft({ def, cohort: { ...cohort, schedule: both }, edit: { off: { training: false } } }).rows.ojt.block).toBeNull();
    expect(planBody({ id: 'c', updated_at: 'u' }, { days: {}, off: { consulting: true } }, 'save', { notify: true, reenable: 'apply' }))
      .toEqual({ cohort_id: 'c', op: 'save', days: {}, off: { consulting: true }, notify: true, reenable: 'apply', base_updated_at: 'u' });
    expect(planBody({ id: 'c' }, { days: {}, off: {} }, 'preview', { notify: true })).toEqual({ cohort_id: 'c', op: 'preview', days: {} });
  });
  it('السجل يقول ما أُوقف وما أُعيد', () => {
    const rows = historyRows([{ id: 1, action: 'cohort.plan', at: 'x', summary: { changes: [{ key: 'consulting', before: 21, after: 0, off: 'stop' }], stopped: ['consulting'], started: [] } }]);
    expect(rows[0].text).toBe('أُوقفت مرحلة');
  });
});
