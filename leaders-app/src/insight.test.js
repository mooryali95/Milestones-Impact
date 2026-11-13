import { describe, expect, it } from 'vitest';
import { changeRow, expertLoad, PIPELINE, PIPELINE_AR, pipelineBy, pipelineStage, stageFilter } from '../../supabase/functions/leaders-api/insight.js';
import { ONBOARDING_AR } from '../../supabase/functions/leaders-api/onboarding.js';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const ago = (d) => new Date(NOW - d * 864e5).toISOString();
const p = (status, step, org = 'o1', seen = null) => ({ status, onboarding: { step }, organization_id: org, last_login_at: seen });

describe('مراحل الخط', () => {
  it('ما قبل الاعتماد من onboarding.js نفسه بلا تسمية ثانية، وما بعده من الحالة', () => {
    for (const k of ['profile', 'assessment_todo', 'assessment_doing', 'approval']) expect(PIPELINE_AR[k]).toBe(ONBOARDING_AR[k]);
    expect(PIPELINE.every((k) => PIPELINE_AR[k])).toBe(true);
    expect(pipelineStage(p('registered', 'profile'))).toBe('profile');
    expect(pipelineStage(p('pending_approval', 'approval'))).toBe('approval');
    expect(pipelineStage(p('enrolled', 'done'))).toBe('enrolled');
  });
  it('الموقوف والمنسحب خارج الخط أيًّا كانت خطوته', () => {
    expect(pipelineStage(p('withdrawn', 'profile'))).toBe('out');
    expect(pipelineStage(p('suspended', 'done'))).toBe('out');
  });
  it('الخانة تفتح القائمة بالفلتر الذي يعدّها', () => {
    expect(stageFilter('assessment_doing')).toEqual({ step: 'assessment_doing' });
    expect(stageFilter('approval')).toEqual({ status: 'pending_approval' });
    expect(stageFilter('enrolled')).toEqual({ status: 'enrolled' });
    expect(stageFilter('out')).toEqual({ view: 'out' });
  });
});

describe('التوزيع بالمجموعات', () => {
  const rows = [p('registered', 'profile', 'o1', ago(1)), p('profiled', 'assessment_todo', 'o1'), p('pending_approval', 'approval', 'o1', ago(30)),
    p('enrolled', 'done', 'o2', ago(2)), p('completed', 'done', 'o2'), p('withdrawn', 'done', 'o2'), p('placed', 'done', null)];
  const r = pipelineBy(rows, (x) => (x.organization_id ? { key: x.organization_id, name: x.organization_id } : { key: 'none', name: 'بدون جهة' }), NOW);
  it('مجموع الخانات يساوي الإجمالي، والمجموعات بالأكثر أولًا', () => {
    expect(r.total.total).toBe(7);
    expect(Object.values(r.total.stages).reduce((a, n) => a + n, 0)).toBe(7);
    expect(r.groups.map((g) => [g.key, g.total])).toEqual([['o1', 3], ['o2', 3], ['none', 1]]);
    for (const g of r.groups) expect(Object.values(g.stages).reduce((a, n) => a + n, 0)).toBe(g.total);
  });
  it('المتعثر ينتظر نفسه، والمنتظر ينتظر الإدارة', () => {
    const o1 = r.groups.find((g) => g.key === 'o1');
    expect([o1.stuck, o1.waiting, o1.active_week]).toEqual([2, 1, 1]);
  });
  it('النسب من القائمين: المنسحب لا يخفض نسبة من بقي', () => {
    const o2 = r.groups.find((g) => g.key === 'o2');
    expect([o2.approved_pct, o2.completed_pct, o2.active_pct]).toEqual([100, 50, 50]);
  });
  it('من لا مجموعة له يُستثنى، والفارغ لا يكسر', () => {
    expect(pipelineBy(rows, () => null).total.total).toBe(0);
    expect(pipelineBy([], () => ({ key: 'a', name: 'a' })).total.approved_pct).toBe(0);
  });
});

describe('حِمل الخبراء', () => {
  const ex = [{ id: 'a', full_name: 'أحمد', weekly_hours: 4 }, { id: 'b', full_name: 'بدر', weekly_hours: 4 }, { id: 'c', full_name: 'جمال', weekly_hours: 10 },
    { id: 'd', full_name: 'دانة', weekly_hours: 6 }, { id: 'e', full_name: 'إيمان', weekly_hours: null }];
  const r = expertLoad(ex, { requests: { a: 3, b: 2, c: 1, e: 1 }, upcoming: { a: 2, b: 1 }, people: { a: 3 } });
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  it('فوق طاقته، مشغول، لديه متسع، بلا إسناد، وبلا طاقة محددة', () => {
    expect([by.a.state, by.b.state, by.c.state, by.d.state, by.e.state]).toEqual(['over', 'busy', 'free', 'idle', 'none']);
    expect([by.a.demand, by.a.share, by.a.people]).toEqual([5, 125, 3]);
  });
  it('الأثقل حِملًا أولًا', () => {
    expect(r[0].id).toBe('a');
  });
});

describe('ماذا تغيّر', () => {
  it('نص عربي للحدث المعروف، واسم المشارك، والسبب إن وُجد', () => {
    const c = changeRow({ id: 1, action: 'participant.status', actor_type: 'admin', actor: 'a@x.sa', entity: 'participants', entity_id: 'p1', after: { status: 'suspended', reason: 'مخالفة الميثاق' }, created_at: 'T' }, { p1: 'سارة' });
    expect(c).toMatchObject({ area: 'participant', area_ar: 'المشاركون', text: 'تغيّرت حالته', known: true, by: 'a@x.sa', who: 'سارة', participant_id: 'p1', detail: 'مخالفة الميثاق' });
  });
  it('الحدث غير المسمّى يُعلَّم ليُعرض رمزًا لا نصًّا، وغير المشارك بلا رابط', () => {
    const c = changeRow({ id: 2, action: 'zzz.unknown', actor_type: 'system', entity: 'cohorts', entity_id: 'c1' });
    expect(c).toMatchObject({ known: false, text: 'zzz.unknown', by: 'النظام', participant_id: null });
  });
});
