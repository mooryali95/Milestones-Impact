// حراس المشاركين الأحياء: عدّ من ينقلهم فتح دفعة جهة على برنامج آخر، وكشف الإخفاء الذي يكسر مرحلة، وسؤال التأكيد
import { describe, expect, it, vi } from 'vitest';
import { cohortProgressCount, hideBreaksStage, orgMoveImpact } from '../../supabase/functions/leaders-api/logic.js';
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
  it('من يتبع الدفعة المفتوحة لا يُحسب: الحارس لدفعة الجهة القائمة وحدها', () => {
    const w = { ...world, cohorts: [world.cohorts[1]] };
    expect(orgMoveImpact(w, { id: 'new', organization_id: 'o1', program_id: 'pb', status: 'open' }).count).toBe(0);
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
  it('يبقى بند إلزامي ظاهر، أو المرحلة تكتمل بأي بند، أو البند اختياري: لا كسر', () => {
    expect(hideBreaksStage(stages, reqs, ['D'])).toEqual([]);
    expect(hideBreaksStage(stages, reqs, ['C'])).toEqual([]);
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
    expect(confirm.mock.calls[0][0]).toContain('3 مشاركًا');
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
