// R0 «تاريخ واحد» (docs/ops/2026-11-17-تصور-محرر-رحلة-الدفعة-v1.md): المعالم تُؤرَّخ بنافذة مرحلتها حين يغيب الجدول،
// و«متأخر» في الخريطة من نافذة الدفعة، والمدة في فرق النسخ، وحارس بريد المعالم التي صارت مؤرخة بهذا التغيير.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cutoffFrom, lateNoticeAllowed, milestoneDue, milestoneDueInfo, milestoneStatuses, programDiff, R0_DATED_SINCE, STAGE_DIFF_FIELDS } from '../../supabase/functions/leaders-api/logic.js';
import { journeyMap, stageWindows } from '../../supabase/functions/leaders-api/journey-map.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const STAGES = [
  { key: 'approval', title_ar: 'اعتماد المستوى', phase: 'admission', duration_days: 2, sort: 1 },
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', duration_days: 14, sort: 2 },
  { key: 'ojt', title_ar: 'التوجيه', phase: 'qualification', duration_days: 28, sort: 3, rules: { unlock: 'with', with: 'training' } },
  { key: 'support', title_ar: 'الدعم', phase: 'impact', duration_days: 30, sort: 4 },
];
const MS = [
  { id: 'end-training', title_ar: 'نهاية التدريب', stage_key: 'training', anchor: 'stage_end', offset_days: 0, complete: 'stage' },
  { id: 'start-ojt', title_ar: 'بداية التوجيه', stage_key: 'ojt', anchor: 'stage_start', offset_days: 1, complete: 'stage' },
  { id: 'end-support', title_ar: 'نهاية الدعم', stage_key: 'support', anchor: 'stage_end', offset_days: -2, complete: 'manual' },
];

describe('R0: المعلم يُؤرَّخ بنافذة مرحلته حين يغيب الجدول', () => {
  it('بلا جدول: الموعد من stageWindows نفسها التي تعرضها الخريطة، ومصدره window', () => {
    const cohort = { starts_on: '2026-12-01' };
    const w = stageWindows(STAGES, cohort);
    // النهاية شاملة (القرار 18، R2a): 14 يومًا من 3 ديسمبر تنتهي 16 ديسمبر
    expect(w.training).toEqual({ from: '2026-12-03', to: '2026-12-16' });
    const r = Object.fromEntries(milestoneStatuses(MS, { cohort, stages: STAGES, today: '2026-11-20' }).map((m) => [m.id, m]));
    expect(r['end-training']).toMatchObject({ due: w.training.to, due_source: 'window', status: 'on_time' });
    expect(r['start-ojt']).toMatchObject({ due: '2026-12-04', due_source: 'window' });
    // الدعم في اليوم التالي لنهاية أطول المجموعة (التوجيه 28 يومًا من 3 ديسمبر ينتهي 30 ديسمبر)، والإزاحة سالبة
    expect(w.support).toEqual({ from: '2026-12-31', to: '2027-01-29' });
    expect(r['end-support'].due).toBe('2027-01-27');
  });
  it('الجدول المكتوب يبقى أولًا، والمرحلة بلا جدول تأخذ نافذتها، وبلا بداية دفعة يبقى «بلا موعد بعد»', () => {
    const cohort = { starts_on: '2026-12-01', schedule: { training: { start: '2026-12-05', end: '2026-12-20' } } };
    const r = Object.fromEntries(milestoneStatuses(MS, { cohort, stages: STAGES, today: '2026-11-20' }).map((m) => [m.id, m]));
    expect(r['end-training']).toMatchObject({ due: '2026-12-20', due_source: 'schedule' });
    expect(r['start-ojt'].due_source).toBe('window');
    const open = milestoneStatuses(MS, { cohort: {}, stages: STAGES, today: '2026-11-20' });
    expect(open.every((m) => m.status === 'unscheduled' && m.due_source === null)).toBe(true);
    // بلا مراحل (المستدعي القديم) يبقى الحساب من الجدول وحده كما كان
    expect(milestoneDue(MS[0], { schedule: {} })).toBeNull();
    expect(milestoneDueInfo(MS[0], { windows: { training: { from: '2026-12-03', to: '2026-12-17' } } })).toEqual({ due: '2026-12-17', source: 'window' });
  });
  it('بداية مكتوبة بلا نهاية: «نهاية X» من البداية بمدة المرحلة، لا يوم البداية', () => {
    const st = [{ key: 'a', title_ar: 'أ', duration_days: 7, sort: 1 }, { key: 'b', title_ar: 'ب', duration_days: 14, sort: 2 }];
    const cohort = { starts_on: '2026-11-01', schedule: { b: { start: '2026-11-10' } } };
    expect(stageWindows(st, cohort).b).toEqual({ from: '2026-11-10', to: '2026-11-23' });
    const [m] = milestoneStatuses([{ id: 'end-b', stage_key: 'b', anchor: 'stage_end', offset_days: 0, complete: 'manual' }], { cohort, stages: st, today: '2026-11-20' });
    expect(m).toMatchObject({ due: '2026-11-23', due_source: 'window', status: 'due_soon' });
    // والخريطة لا تعد من في «ب» متأخرًا بعد ثلاثة أيام من بدايتها
    const people = [{ id: 'p', name: 'م', created_at: '2026-11-01T00:00:00Z', journey: [
      { key: 'a', stage_mode: 'required', status: 'done', items: [{ title_ar: 'بند', status: 'done', completed_at: '2026-11-08T09:00:00Z', required: true }] },
      { key: 'b', stage_mode: 'required', status: 'active', items: [{ title_ar: 'بند', status: 'pending', required: true }] }] }];
    expect(journeyMap({ stages: st, people, cohort, today: new Date('2026-11-20T10:00:00Z') }).stages[1]).toMatchObject({ here: 1, late: 0 });
  });
  it('الدفعة المفتوحة (is_default) لا تُؤرَّخ معالمها بنافذة ولو كان لها starts_on، و«متأخر» فيها من الدخول بالمدة', () => {
    const cohort = { name: 'المفتوحة', is_default: true, starts_on: '2026-01-01' };
    const r = milestoneStatuses(MS, { cohort, stages: STAGES, today: '2026-11-20' });
    expect(r.every((m) => m.status === 'unscheduled' && m.due_source === null)).toBe(true);
    const item = { title_ar: 'بند', status: 'pending', required: true };
    const people = [{ id: 'a', name: 'أ', created_at: '2026-11-18T00:00:00Z', journey: STAGES.map((s, i) => ({ key: s.key, stage_mode: 'required', status: i === 0 ? 'active' : 'locked', items: [item] })) }];
    const m = journeyMap({ stages: STAGES, people, cohort, today: new Date('2026-11-20T10:00:00Z') });
    expect(m.stages[0]).toMatchObject({ here: 1, late: 0 });
    expect(m.cohort.is_default).toBe(true);
  });
  it('التمديد لمشارك يبقى أعلى من النافذة، ومصدره override', () => {
    const r = milestoneStatuses([MS[0]], { cohort: { starts_on: '2026-12-01' }, stages: STAGES, records: { 'end-training': { due_override: '2027-01-05' } }, today: '2026-11-20' });
    expect(r[0]).toMatchObject({ due: '2027-01-05', due_source: 'override', extended: true });
  });
  // نافذة «الجدول» أُزيلت في R2a (القرار 23): الموعد المحسوب بعلامته يُعرض في تبويب «الرحلة» (cohort-journey.js)
  it('رحلة المشارك تمرر مراحل تعريف الدفعة، وتبويب الرحلة يعرض المحسوب بعلامته', () => {
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/cohort: def\.cohort \|\| \{\},\n.*\n\s+stages: def\.stages,/);
    expect(read('admin-app/src/cohort-journey.js')).toContain('محسوب من مدد المراحل');
  });
});

describe('R0: «متأخر» في الخريطة من نافذة الدفعة', () => {
  const item = (status, completed_at = null) => ({ title_ar: 'بند', status, completed_at, required: true });
  const at = (idx, doneOn) => STAGES.map((s, i) => ({ key: s.key, stage_mode: 'required', status: i < idx ? 'done' : i === idx ? 'active' : 'locked',
    items: [item(i < idx ? 'done' : 'pending', i < idx ? `${doneOn}T09:00:00Z` : null)] }));
  const cohort = { name: 'دفعة', starts_on: '2026-10-01' };
  // نافذة التدريب: 3 إلى 16 أكتوبر شاملة (القرار 18)، فمن يقف فيه بعد 19 أكتوبر متأخر أيًا كان يوم دخوله
  it('من دخل التدريب أمس متأخر إن تجاوز اليوم نهاية نافذته بعد المهلة، ومن هو داخلها لا', () => {
    const people = [{ id: 'a', name: 'أ', created_at: '2026-09-01T00:00:00Z', journey: at(1, '2026-10-20') }];
    const late = journeyMap({ stages: STAGES, people, cohort, today: new Date('2026-10-21T10:00:00Z'), list: true });
    expect(late.stages.find((s) => s.key === 'training')).toMatchObject({ here: 1, late: 1 });
    expect(late.stages.find((s) => s.key === 'training').people[0]).toMatchObject({ days: 1, late: true });
    const edge = journeyMap({ stages: STAGES, people, cohort, today: new Date('2026-10-19T10:00:00Z') });
    expect(edge.stages.find((s) => s.key === 'training').late).toBe(0);
  });
  it('بلا بداية للدفعة يبقى الحساب من الدخول بالمدة', () => {
    const people = [{ id: 'a', name: 'أ', created_at: '2026-09-01T00:00:00Z', journey: at(1, '2026-10-20') }];
    const m = journeyMap({ stages: STAGES, people, cohort: { name: 'مفتوحة' }, today: new Date('2026-10-21T10:00:00Z') });
    expect(m.stages.find((s) => s.key === 'training').late).toBe(0);
    const old = journeyMap({ stages: STAGES, people, cohort: { name: 'مفتوحة' }, today: new Date('2026-11-10T10:00:00Z') });
    expect(old.stages.find((s) => s.key === 'training').late).toBe(1);
  });
  it('نافذة بلا مدة ولا جدول لا تُعد موعدًا', () => {
    const zero = [{ key: 'profile', title_ar: 'الملف', phase: 'admission', duration_days: 0, sort: 1 }, ...STAGES.map((s) => ({ ...s, sort: s.sort + 1 }))];
    const people = [{ id: 'a', name: 'أ', created_at: '2026-09-01T00:00:00Z', journey: zero.map((s, i) => ({ key: s.key, stage_mode: 'required', status: i === 0 ? 'active' : 'locked', items: [item('pending')] })) }];
    const m = journeyMap({ stages: zero, people, cohort, today: new Date('2026-10-21T10:00:00Z') });
    expect(m.stages[0]).toMatchObject({ here: 1, late: 0 });
  });
});

describe('R0: المدة ونص المدة في فرق النسخ', () => {
  it('STAGE_DIFF_FIELDS يضم duration_days وactive وduration_label', () => {
    expect(STAGE_DIFF_FIELDS).toEqual(expect.arrayContaining(['duration_days', 'active', 'duration_label']));
    const a = { stages: [{ key: 'training', title_ar: 'التدريب', sort: 1, duration_days: 4, duration_label: '{days:T-ATTEND} أيام' }], requirements: [] };
    expect(programDiff(a, { ...a, stages: [{ ...a.stages[0], duration_days: 14 }] }).stages.changed).toEqual([{ key: 'training', title: 'التدريب' }]);
    expect(programDiff(a, { ...a, stages: [{ ...a.stages[0], duration_label: '{duration}' }] }).stages.changed).toHaveLength(1);
    expect(programDiff(a, a).stages.changed).toEqual([]);
  });
});

describe('R0: حارس بريد المعالم التي صارت مؤرخة (القرار 19)', () => {
  const late = (due, due_source, late_days = 10) => ({ status: 'late', late_days, due, due_source });
  it('مؤرخ بالنافذة وتأخر قبل النشر: لا بريد أبدًا، ولو بعد المهلة', () => {
    expect(R0_DATED_SINCE).toBe('2026-11-17');
    expect(lateNoticeAllowed(late('2026-10-01', 'window', 47))).toBe(false);
    expect(lateNoticeAllowed(late('2026-11-16', 'window', 30))).toBe(false);
  });
  it('مؤرخ بالنافذة وموعده من يوم النشر فما بعد: يُرسل بعد المهلة كالمعتاد', () => {
    expect(lateNoticeAllowed(late('2026-11-17', 'window', 4))).toBe(true);
    expect(lateNoticeAllowed(late('2026-12-01', 'window', 3))).toBe(false);
    expect(lateNoticeAllowed(late('2026-12-01', 'window', 5))).toBe(true);
  });
  it('ما كان مؤرخًا قبل R0 (جدول مكتوب، تاريخ ثابت، تمديد، بداية الدفعة) لا يمسه الحارس', () => {
    for (const src of ['schedule', 'date', 'override', 'cohort']) expect(lateNoticeAllowed(late('2026-10-01', src)), src).toBe(true);
    expect(lateNoticeAllowed({ status: 'due_soon', late_days: 0, due: '2026-12-01', due_source: 'window' })).toBe(false);
  });
  it('ويبقى المتأخر ظاهرًا في رحلة المشارك: الحارس للبريد وحده', () => {
    const [m] = milestoneStatuses([MS[0]], { cohort: { starts_on: '2026-09-01' }, stages: STAGES, today: '2026-11-17' });
    expect(m).toMatchObject({ status: 'late', due_source: 'window' });
    expect(lateNoticeAllowed(m)).toBe(false);
    const admin = read('supabase/functions/leaders-api/admin.ts');
    // ومعه يوم آخر حفظ لخطة الدفعة (R2a، planCutoff): ما صار متأخرًا بتقصير مدة لا يُرسل عنه
    expect(admin).toContain('.filter((x: any) => lateNoticeAllowed(x, MILESTONE_GRACE_DAYS, since))');
    expect(admin).toContain("const since = planCutoff(cutoff, planDay[j?.def?.cohort?.id || '']);");
    expect(admin).toContain("const cutoff = cutoffFrom(Deno.env.get('MILESTONE_R0_CUTOFF'));");
  });
  it('يوم الحارس يتأخر بالبيئة إن تأخر النشر، ولا يتقدم عن R0_DATED_SINCE بخطأ إعداد', () => {
    expect(cutoffFrom(undefined)).toBe(R0_DATED_SINCE);
    expect(cutoffFrom('2026-11-01')).toBe(R0_DATED_SINCE);
    expect(cutoffFrom('غير تاريخ')).toBe(R0_DATED_SINCE);
    expect(cutoffFrom(' 2026-11-24 ')).toBe('2026-11-24');
    // نُشر يوم 24: ما استحق بين 17 و24 وتأخر قبل النشر لا يُرسل عنه، وما استحق من 24 يُرسل
    expect(lateNoticeAllowed(late('2026-11-18', 'window', 9), 3, '2026-11-24')).toBe(false);
    expect(lateNoticeAllowed(late('2026-11-24', 'window', 4), 3, '2026-11-24')).toBe(true);
    expect(lateNoticeAllowed(late('2026-11-18', 'schedule', 9), 3, '2026-11-24')).toBe(true);
  });
});

describe('R0: خريطة الرحلة في ملف الدفعة', () => {
  it('الإجراء قراءة بمنطق org-journey: أعضاء الدفعة بـpickCohort، ورحلاتهم من journeyFor، وتعريف الدفعة نفسها', () => {
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toContain("'admin.cohort-journey': C.adminCohortJourney,");
    const c = read('supabase/functions/leaders-api/coordinator.ts');
    expect(c).toContain('export async function adminCohortJourney(a: Admin, b: Body)');
    expect(c).toContain('journeyDefinition({}, m.cohort)');
    expect(c).toContain("cohort: def.cohort, program, list: true, activity: true,");
    expect(read('supabase/functions/leaders-api/programs.ts')).toContain('export async function cohortMemberIds(cohortId: string)');
    // منذ R1 الخريطة في تبويب «الرحلة» بملف الدفعة (CohortJourney.jsx)، والتبويب في CohortPage
    expect(read('admin-app/src/screens/Programs.jsx')).toContain('<CohortJourney c={c} canWrite={canWrite} on={on} onSaved={on.reload} />');
    const ui = read('admin-app/src/screens/CohortJourney.jsx');
    expect(ui).toContain("L('admin.cohort-journey', { cohort_id: c.id }).then((r) => { if (live) setMap(r); })");
    expect(ui).toContain('const auto = !c.is_default && (Number(c.members) || 0) <= JOURNEY_AUTO_MAX;');
    // الخريطة بلا مراحل تظهر رسالتها (الخادم لا يرجع null بل stages فارغة)، والدفعة المفتوحة أو الكبيرة تُقرأ بطلب
    expect(ui).toContain('!jm?.stages?.length ?');
    expect(ui).toContain('اعرض خريطة الرحلة');
    expect(c).toContain('if (m.ids.length > COHORT_JOURNEY_MAX)');
  });
});
