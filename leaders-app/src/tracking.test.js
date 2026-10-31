// متابعة تنفيذ المبادرة وأثرها: الخطة من لقطة الوثيقة، والفعلي من التحديثات
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINTS, cleanUpdate, latestState, periodOf, portfolioOutcomes, realization, trackingPlan, trackingSummary,
} from '../../supabase/functions/leaders-api/tracking.js';

const DAY = 864e5;
const APPROVED = '2026-01-01T00:00:00Z';
const at = (d) => Date.parse(APPROVED) + d * DAY;

const snapshot = {
  meta: { status: 'approved', initiative: 'تحول رقمي', start: '2026-01-01', end: '2026-12-31' },
  sections: [
    { key: 'milestone-register', fields: [{ key: 'milestones', type: 'table',
      columns: ['المعلم', 'النوع (تعاقدي، تقني، حوكمي، قيمة)', 'التاريخ المستهدف', 'القرار عنده', 'صاحب القرار', 'معيار التحقق'],
      value: [['توقيع العقد', 'تعاقدي', '2026-02-01', 'المضي', 'المدير', 'عقد موقع'], ['الإطلاق', 'تقني', '2026-05-01', '', 'المدير', 'منصة تعمل'], ['', '', '', '', '', '']] }] },
    { key: 'benefits-register', fields: [{ key: 'benefits', type: 'table',
      columns: ['المنفعة', 'المؤشر وطريقة القياس', 'خط الأساس', 'المستهدف', 'المالك بعد التسليم', 'معلم القيمة'],
      value: [['رضا المستفيد', 'نسبة الرضا', '60', '80', 'الخدمات', 'الإطلاق'], ['زمن المعاملة', 'بالأيام', '10', '4', 'العمليات', ''], ['ثقافة الفريق', 'وصفي', 'ضعيفة', 'قوية', 'الموارد', '']] }] },
  ],
};
const plan = trackingPlan(snapshot);

describe('الخطة من الوثيقة المعتمدة', () => {
  it('المعالم والمنافع بمفاتيح ثابتة، والصفوف الفارغة لا تُحسب', () => {
    expect(plan.milestones.map((m) => [m.key, m.title, m.due])).toEqual([['m0', 'توقيع العقد', '2026-02-01'], ['m1', 'الإطلاق', '2026-05-01']]);
    expect(plan.milestones[0]).toMatchObject({ type: 'تعاقدي', criterion: 'عقد موقع', owner: 'المدير' });
    expect(plan.benefits.map((b) => [b.key, b.baseline, b.target, b.numeric])).toEqual([['b0', '60', '80', true], ['b1', '10', '4', true], ['b2', 'ضعيفة', 'قوية', false]]);
  });
  it('بلا سجل معالم تُؤخذ من الجدول الزمني', () => {
    const p = trackingPlan({ sections: [{ key: 'schedule', fields: [{ key: 'activities', type: 'table', columns: ['الرمز', 'النشاط أو الحزمة', 'البداية', 'النهاية', 'يعتمد على'], value: [['A1', 'التصميم', '2026-01-01', '2026-02-01', '']] }] }] });
    expect(p.milestones[0]).toMatchObject({ key: 'm0', title: 'التصميم', due: '2026-02-01' });
    expect(trackingPlan(null)).toMatchObject({ milestones: [], benefits: [] });
  });
});

describe('نسبة التحقق', () => {
  it('تصلح للزيادة والخفض وتُقص', () => {
    expect(realization('60', '80', '70')).toBe(0.5);
    expect(realization('10', '4', '7')).toBe(0.5);
    expect(realization('60', '80', '200')).toBe(2);
    expect(realization('ضعيفة', 'قوية', 'متوسطة')).toBeNull();
    expect(realization('5', '5', '6')).toBeNull();
  });
});

describe('الحالة والملخص', () => {
  const u1 = { period: '2026-01', milestones: { m0: { status: 'on_track' } }, benefits: {}, created_at: new Date(at(26)).toISOString() };
  const u2 = { period: '2026-02', milestones: { m0: { status: 'done', date: '2026-02-03' } }, benefits: { b0: { value: '70' } }, created_at: new Date(at(40)).toISOString() };
  it('آخر ما سُجّل يغلب، بترتيب الشهور', () => {
    const s = latestState(plan, [u2, u1]);
    expect(s.milestones[0]).toMatchObject({ status: 'done', actual: '2026-02-03', period: '2026-02' });
    expect(s.benefits[0]).toMatchObject({ value: '70', realization: 0.5 });
    expect(s.benefits[1].value).toBeNull();
  });
  it('قبل أول تحديث: لم تبدأ، ثم بلا تحديث', () => {
    expect(trackingSummary(plan, [], APPROVED, at(10)).health).toBe('pending');
    expect(trackingSummary(plan, [], APPROVED, at(40)).health).toBe('stale');
    expect(trackingSummary(plan, [], APPROVED, at(30)).due.update).toBe(true);
    expect(trackingSummary(plan, [], null)).toBeNull();
  });
  it('على المسار، ثم معلم فات موعده', () => {
    const s = trackingSummary(plan, [u1, u2], APPROVED, at(45));
    expect(s).toMatchObject({ health: 'green', milestones: { done: 1, due: 1, late: 0, on_time: 100 }, benefits: { measured: 1, realization: 50 } });
    const later = trackingSummary(plan, [u1, u2, { period: '2026-05', milestones: {}, benefits: {}, narrative: 'x', created_at: new Date(at(125)).toISOString() }], APPROVED, at(130));
    expect(later.milestones).toMatchObject({ due: 2, late: 1, on_time: 50 });
    expect(later.health).toBe('red');
  });
  it('التحديث مرة في الشهر', () => {
    const s = trackingSummary(plan, [{ ...u2, period: periodOf(at(40)) }], APPROVED, at(40));
    expect(s.due.update).toBe(false);
  });
  it('نقاط المراجعة: تحين، ثم تفوت إن حلّت التي بعدها', () => {
    expect(trackingSummary(plan, [u1], APPROVED, at(91)).due.checkpoint).toBe('d90');
    const s = trackingSummary(plan, [u1], APPROVED, at(181));
    expect(s.checkpoints.map((c) => c.status)).toEqual(['missed', 'due']);
    expect(s.due.checkpoint).toBe('d180');
    const v = trackingSummary(plan, [u1, { period: '2026-04', checkpoint: 'd90', verify_status: 'confirmed', benefits: { b0: { value: '75' } }, milestones: {}, created_at: new Date(at(92)).toISOString() }], APPROVED, at(95));
    expect(v.checkpoints[0]).toMatchObject({ status: 'verified', verify: 'confirmed' });
    expect(v.due.checkpoint).toBeNull();
  });
  it('تنتهي المتابعة بعد ستة أشهر ومراجعة الختام', () => {
    const done = { period: '2026-07', checkpoint: 'd180', verify_status: 'pending', milestones: {}, benefits: {}, created_at: new Date(at(182)).toISOString() };
    const s = trackingSummary(plan, [u1, done], APPROVED, at(200));
    expect(s).toMatchObject({ active: false, health: 'closed', can_update: false });
    expect(CHECKPOINTS.map((c) => c.day)).toEqual([90, 180]);
  });
});

describe('تحديث القائد', () => {
  it('يقبل المعروف ويرفض الناقص', () => {
    const c = cleanUpdate(plan, { milestones: { m0: { status: 'done', date: '2026-02-03' }, mX: { status: 'done' } }, benefits: { b0: { value: ' 70 ' } }, narrative: 'بدأنا' });
    expect(c.milestones).toEqual({ m0: { status: 'done', date: '2026-02-03' } });
    expect(c.benefits).toEqual({ b0: { value: '70' } });
    expect(() => cleanUpdate(plan, { milestones: { m0: { status: 'x' } } })).toThrow();
    expect(() => cleanUpdate(plan, { milestones: { m0: { status: 'dropped' } } })).toThrow('سبب');
    expect(() => cleanUpdate(plan, { benefits: { b0: { value: 'جيد' } } })).toThrow('رقم');
    expect(() => cleanUpdate(plan, { benefits: { b2: { value: 'متوسطة', evidence: 'http://x' } } })).toThrow('https');
    expect(() => cleanUpdate(plan, {})).toThrow();
  });
  it('مراجعة الأثر تقيس كل المنافع بسرد كافٍ', () => {
    const all = { b0: { value: '75' }, b1: { value: '6' }, b2: { value: 'متوسطة' } };
    expect(() => cleanUpdate(plan, { benefits: { b0: { value: '75' } }, narrative: 'x'.repeat(50) }, 'd90')).toThrow('كل المنافع');
    expect(() => cleanUpdate(plan, { benefits: all, narrative: 'قصير' }, 'd90')).toThrow('40');
    expect(cleanUpdate(plan, { benefits: all, narrative: 'تغيّر زمن المعاملة فعلًا بعد الإطلاق، والدليل تقرير النظام الشهري' }, 'd90').benefits.b1).toEqual({ value: '6' });
  });
});

describe('المحفظة', () => {
  it('تجمع المبادرات المتابعة وحدها', () => {
    const s = trackingSummary(plan, [{ period: '2026-02', milestones: { m0: { status: 'done' } }, benefits: { b0: { value: '70' } }, created_at: new Date(at(40)).toISOString() }], APPROVED, at(45));
    const t = portfolioOutcomes([{ summary: s, cost: 1000 }, { summary: null, cost: 500 }]);
    expect(t).toMatchObject({ approved: 1, reporting: 1, health: { green: 1 }, on_time: 100, realization: 50, verified: 0, cost: 1000 });
    expect(portfolioOutcomes([])).toMatchObject({ approved: 0, on_time: null, cost: null });
  });
});

describe('التقرير المطبوع', () => {
  it('الوثيقة المعتمدة تطبع متابعتها، والمسودة لا', async () => {
    const { capstoneReport } = await import('../../src/lib/brand/capstone.js');
    const updates = [{ period: '2026-02', milestones: { m0: { status: 'done' } }, benefits: { b0: { value: '70' } }, narrative: 'أطلقنا <b>المرحلة</b>', created_at: new Date(at(40)).toISOString() }];
    const tracking = { summary: trackingSummary(plan, updates, APPROVED, at(45)), state: latestState(plan, updates), updates, statuses: { done: 'تحقق' }, health: { green: 'على المسار' } };
    const doc = { meta: { status: 'approved', initiative: 'تحول' }, sections: [], tracking };
    const { body } = capstoneReport(doc);
    expect(body).toContain('متابعة التنفيذ والأثر');
    expect(body).toContain('رضا المستفيد');
    expect(body).not.toContain('<b>المرحلة</b>');
    expect(capstoneReport({ ...doc, meta: { status: 'submitted' } }).body).not.toContain('متابعة التنفيذ والأثر');
  });
});
