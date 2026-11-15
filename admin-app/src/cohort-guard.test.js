// حراس المشاركين الأحياء: عدّ من ينقلهم فتح دفعة جهة على برنامج آخر، وكشف الإخفاء الذي يكسر مرحلة، وسؤال التأكيد
import { describe, expect, it, vi } from 'vitest';
import { cohortProgressCount, cohortsAfter, hideBreaksStage, moveConfirmText, moveImpact, newlyBroken, orgMoveImpact, programLockedText } from '../../supabase/functions/leaders-api/logic.js';
import { confirmMoveText, MOVE_CANCELLED, saveCohort } from './cohort-guard.js';

const old = { id: 'c1', name: 'سفراء 2026', organization_id: 'o1', program_id: 'pa', status: 'running', starts_on: '2026-09-01' };
const people = [
  { id: 'p1', organization_id: 'o1' }, { id: 'p2', organization_id: 'o1' }, { id: 'p3', organization_id: 'o1' },
  { id: 'p4', organization_id: 'o2' },
];
// p1 وp2 لهما تقدم، وp3 بلا تقدم، وp2 ملحق يدويًا بالدفعة القائمة فيبقى فيها
const world = {
  cohorts: [old, { id: 'c0', is_default: true, program_id: 'pa', status: 'running' }],
  participants: people,
  enrollments: [{ participant_id: 'p2', cohort_id: 'c1', status: 'active', created_at: '2026-09-02' }],
  progress: [{ participant_id: 'p1' }, { participant_id: 'p2' }, { participant_id: 'p4' }],
};

describe('orgMoveImpact', () => {
  it('دفعة جهة أحدث على برنامج آخر تنقل من له تقدم ولم يُلحق يدويًا', () => {
    const next = { id: 'new', name: 'دفعة 2027', organization_id: 'o1', program_id: 'pb', status: 'open', starts_on: '2027-01-01' };
    expect(orgMoveImpact(world, next)).toEqual({ count: 1, from: [{ id: 'c1', name: 'سفراء 2026' }] });
  });
  it('على البرنامج نفسه لا نقل يُعد: معرفات المتطلبات واحدة', () => {
    expect(orgMoveImpact(world, { id: 'new', organization_id: 'o1', program_id: 'pa', status: 'open', starts_on: '2027-01-01' }).count).toBe(0);
  });
  it('دفعة أقدم لا يضعها pickCohort مكان الحالية، ودفعة بلا جهة لا تمس أحدًا', () => {
    expect(orgMoveImpact(world, { id: 'new', organization_id: 'o1', program_id: 'pb', status: 'open', starts_on: '2025-01-01' }).count).toBe(0);
    expect(orgMoveImpact(world, { id: 'new', organization_id: null, program_id: 'pb', status: 'open' }).count).toBe(0);
  });
  it('أول دفعة للجهة تنقل من يتبع الدفعة المفتوحة على برنامج آخر، ومنهم من ضاعت دفعة تسجيله', () => {
    const w = { ...world, cohorts: [world.cohorts[1]] };
    expect(orgMoveImpact(w, { id: 'new', organization_id: 'o1', program_id: 'pb', status: 'open' })).toEqual({ count: 2, from: [{ id: 'c0', name: '' }] });
    expect(orgMoveImpact(w, { id: 'new', organization_id: 'o1', program_id: 'pa', status: 'open' }).count).toBe(0);
  });
});

describe('moveImpact', () => {
  const newer = { id: 'c2', name: 'دفعة 2027', organization_id: 'o1', program_id: 'pb', status: 'running', starts_on: '2027-01-01' };
  const cohorts = [...world.cohorts, newer];
  it('إغلاق دفعة الجهة أو إرجاعها مخططًا لها أو نقلها لجهة أخرى يُخرج أعضاءها إلى برنامج آخر', () => {
    for (const change of [{ status: 'closed' }, { status: 'planned' }, { organization_id: null }]) {
      const r = moveImpact(world, cohorts, cohortsAfter(cohorts, { ...newer, ...change }));
      expect(r.moved).toBe(1);
      expect(r.from).toEqual([{ id: 'c2', name: 'دفعة 2027' }]);
      expect(r.to).toEqual([{ id: 'c1', name: 'سفراء 2026' }]);
    }
  });
  it('نقلها لجهة أخرى يُخرج أعضاء الأولى ويُدخل أعضاء الثانية من الدفعة المفتوحة', () => {
    const r = moveImpact(world, cohorts, cohortsAfter(cohorts, { ...newer, organization_id: 'o2' }));
    expect(r.moved).toBe(2);
    expect(r.from.map((c) => c.id).sort()).toEqual(['c0', 'c2']);
  });
  it('تبكير بداية الدفعة الأحدث حتى تسبقها القديمة يُخرج أعضاءها كذلك', () => {
    expect(moveImpact(world, cohorts, cohortsAfter(cohorts, { ...newer, starts_on: '2025-01-01' })).moved).toBe(1);
  });
  it('تغيير برنامج الدفعة يُعد بقاءً على برنامج آخر، ومنه الدفعة المفتوحة', () => {
    expect(moveImpact(world, cohorts, cohortsAfter(cohorts, { ...newer, program_id: 'pa' }))).toMatchObject({ moved: 0, stay: 1 });
    const def = world.cohorts[1];
    const solo = { ...world, participants: [{ id: 'p1', organization_id: null }] };
    expect(moveImpact(solo, world.cohorts, cohortsAfter(world.cohorts, { ...def, program_id: 'pb' }))).toMatchObject({ moved: 0, stay: 1 });
  });
  it('بلا تغيير ولا تقدم: لا شيء', () => {
    expect(moveImpact(world, cohorts, cohorts)).toEqual({ moved: 0, stay: 0, from: [], to: [] });
    expect(moveImpact({ ...world, progress: [] }, cohorts, cohortsAfter(cohorts, { ...newer, status: 'closed' })).moved).toBe(0);
  });
});

describe('cohortProgressCount', () => {
  it('أعضاء الدفعة فعلًا ولهم تقدم', () => {
    expect(cohortProgressCount(world, 'c1')).toBe(2);
    expect(cohortProgressCount({ ...world, progress: [] }, 'c1')).toBe(0);
  });
});

describe('hideBreaksStage', () => {
  const stages = [
    { key: 's1', title_ar: 'التمهيد' },
    { key: 's2', title_ar: 'التطبيق', rules: { complete: 'any' } },
    { key: 's3', title_ar: 'الختام' },
  ];
  const reqs = [
    { code: 'A', stage_key: 's1', required: true }, { code: 'B', stage_key: 's1', required: false },
    { code: 'C', stage_key: 's2', required: true },
    { code: 'D', stage_key: 's3', required: true }, { code: 'E', stage_key: 's3', required: true },
  ];
  it('إخفاء آخر بند إلزامي في مرحلة تكتمل بإلزاميتها يكسرها', () => {
    expect(hideBreaksStage(stages, reqs, ['A'])).toEqual([{ key: 's1', title_ar: 'التمهيد' }]);
    expect(hideBreaksStage(stages, reqs, ['D', 'E']).map((s) => s.key)).toEqual(['s3']);
  });
  it('مرحلة تكتمل بأي بند تنكسر بإخفاء كل بنودها', () => {
    expect(hideBreaksStage(stages, reqs, ['C']).map((s) => s.key)).toEqual(['s2']);
    const more = [...reqs, { code: 'F', stage_key: 's2', required: false }];
    expect(hideBreaksStage(stages, more, ['C'])).toEqual([]);
  });
  it('مرحلة اختيارية لا يقف عليها شيء يُخفى ما فيها، والمسماة في «بعد مراحل» تُحرس', () => {
    const opt = [{ key: 's1', title_ar: 'إثراء', rules: { mode: 'optional' } }, { key: 's2', title_ar: 'التطبيق' }];
    const r = [{ code: 'A', stage_key: 's1', required: true }, { code: 'C', stage_key: 's2', required: true }];
    expect(hideBreaksStage(opt, r, ['A'])).toEqual([]);
    const gated = [opt[0], { key: 's2', title_ar: 'التطبيق', rules: { unlock: 'stages', after: ['s1'] } }];
    expect(hideBreaksStage(gated, r, ['A']).map((s) => s.key)).toEqual(['s1']);
  });
  it('البنود المقيدة بمستوى: إخفاء بند المتقدمين وحده يكسر مرحلتهم ولو بقي بند المبتدئين', () => {
    const lv = [
      { code: 'R1', stage_key: 's1', required: true, dimension: 'milestone', level: 'beginner' },
      { code: 'R2', stage_key: 's1', required: true, dimension: 'milestone', level: 'advanced' },
    ];
    expect(hideBreaksStage([stages[0]], lv, ['R2']).map((s) => s.key)).toEqual(['s1']);
    // بند عام إلزامي ظاهر يكمل المرحلة للجميع
    expect(hideBreaksStage([stages[0]], [...lv, { code: 'G', stage_key: 's1', required: true }], ['R2'])).toEqual([]);
  });
  it('newlyBroken: ما كان مكسورًا قبل الحفظ لا يُحتسب', () => {
    expect(newlyBroken([{ key: 's1' }, { key: 's2' }], [{ key: 's1' }])).toEqual([{ key: 's2' }]);
    expect(newlyBroken([{ key: 's1' }], [{ key: 's1' }])).toEqual([]);
  });
  it('يبقى بند إلزامي ظاهر، أو البند اختياري: لا كسر', () => {
    expect(hideBreaksStage(stages, reqs, ['D'])).toEqual([]);
    expect(hideBreaksStage(stages, reqs, ['B'])).toEqual([]);
    expect(hideBreaksStage(stages, reqs, [])).toEqual([]);
  });
});

describe('saveCohort', () => {
  it('confirm_move يُعرض بعدده، ولا يُرسل التأكيد إلا بالموافقة', async () => {
    const refused = { success: false, code: 'confirm_move', affected: 3, from: [{ id: 'c1', name: 'سفراء 2026' }] };
    const call = vi.fn().mockResolvedValueOnce(refused).mockResolvedValueOnce({ success: true });
    const confirm = vi.fn().mockResolvedValue(true);
    expect(await saveCohort({ name: 'د' }, confirm, call)).toEqual({ success: true });
    expect(confirm.mock.calls[0][0]).toBe(confirmMoveText(refused));
    expect(confirm.mock.calls[0][0]).toContain('3 مشاركين');
    expect(confirm.mock.calls[0][0]).toContain('«سفراء 2026»');
    expect(call.mock.calls[1][1]).toEqual({ name: 'د', confirm_move: true });
  });
  it('الرفض يبقي الدفعة بلا حفظ، وأي رد آخر يمر كما هو', async () => {
    const call = vi.fn().mockResolvedValue({ success: false, code: 'confirm_move', affected: 1 });
    expect(await saveCohort({}, vi.fn().mockResolvedValue(false), call)).toEqual({ success: false, message: MOVE_CANCELLED });
    expect(call).toHaveBeenCalledTimes(1);
    const other = vi.fn().mockResolvedValue({ success: false, message: 'خطأ' });
    const ask = vi.fn();
    expect(await saveCohort({}, ask, other)).toEqual({ success: false, message: 'خطأ' });
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('صياغة العدد', () => {
  it('المفرد والمثنى والجمع والتمييز، في السؤال ورفض تغيير البرنامج', () => {
    const t = (n) => moveConfirmText({ affected: n, from: [{ id: 'c1', name: 'أ' }], to: [{ id: 'c2', name: 'ب' }] });
    expect(t(1)).toContain('ينتقل تلقائيًا مشارك واحد من «أ» إلى «ب»');
    expect(t(1)).toContain('ويفقد ما أنجزه');
    expect(t(2)).toContain('مشاركان');
    expect(t(7)).toContain('7 مشاركين');
    expect(t(11)).toContain('11 مشاركًا');
    expect(moveConfirmText({ affected: 3, from: [{ id: 'c1', name: 'أ' }], to: [{ id: null, name: '' }] })).toContain('إلى بلا دفعة');
    expect(programLockedText(1)).toContain('فيها مشارك واحد');
    expect(programLockedText(4)).toContain('فيها 4 مشاركين');
    expect(t(5)).not.toMatch(/[\u2013\u2014]/);
  });
});

import { enrollCohort, ENROLL_CANCELLED } from './cohort-guard.js';
describe('الإلحاق بدفعة بحارس النقل (enrollCohort)', () => {
  it('confirm_move يُسأل عنه، والموافقة تعيد الإرسال بالتأكيد على admin.cohort-enroll', async () => {
    const call = vi.fn().mockResolvedValueOnce({ success: false, code: 'confirm_move', affected: 1, from: [{ id: 'c1', name: 'سفراء' }], to: [{ id: 'c2', name: 'أفراد' }] }).mockResolvedValueOnce({ success: true, enrolled: 1 });
    const ask = vi.fn().mockResolvedValue(true);
    const r = await enrollCohort({ cohort_id: 'c2', participant_ids: ['p1'] }, ask, call);
    expect(r).toEqual({ success: true, enrolled: 1 });
    expect(ask.mock.calls[0][0]).toMatch(/مشارك واحد من «سفراء» إلى «أفراد»/);
    expect(call.mock.calls[1]).toEqual(['admin.cohort-enroll', { cohort_id: 'c2', participant_ids: ['p1'], confirm_move: true }]);
  });
  it('الرفض لا يرسل شيئًا ويقول لم يُنقل أحد', async () => {
    const call = vi.fn().mockResolvedValue({ success: false, code: 'confirm_move', affected: 2 });
    expect(await enrollCohort({ cohort_id: 'c2', participant_ids: ['p1'] }, async () => false, call)).toEqual({ success: false, message: ENROLL_CANCELLED });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

import { enrollImpact } from '../../supabase/functions/leaders-api/logic.js';
describe('أثر الإلحاق (enrollImpact)', () => {
  const cohorts = [
    { id: 'c1', name: 'سفراء', organization_id: 'o1', program_id: 'A', status: 'running', created_at: '2026-09-01' },
    { id: 'c2', name: 'أفراد ب', organization_id: null, program_id: 'B', status: 'open', created_at: '2026-10-01' },
    { id: 'c3', name: 'أفراد أ', organization_id: null, program_id: 'A', status: 'open', created_at: '2026-10-01' },
  ];
  const world = { cohorts, participants: [{ id: 'p1', organization_id: 'o1' }, { id: 'p2', organization_id: 'o1' }], enrollments: [], progress: [{ participant_id: 'p1' }] };
  it('يُعد من له تقدم ويتغير برنامجه وحده، والبرنامج نفسه لا يُعد', () => {
    expect(enrollImpact(world, cohorts[1])).toEqual({ moved: 1, from: [{ id: 'c1', name: 'سفراء' }], to: [{ id: 'c2', name: 'أفراد ب' }] });
    expect(enrollImpact(world, cohorts[2]).moved).toBe(0);
    expect(enrollImpact(world, cohorts[0]).moved).toBe(0);
  });
});
