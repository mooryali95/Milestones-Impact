// بنود خطة ملاحظات ما قبل الورشة: الكتيب أيامًا تدريبية، وخطة التطبيق من فصول الوثيقة
import { describe, expect, it } from 'vitest';
import { activityFor, applyDelivery, cleanConfig, cleanDelivery, cohortDefinition } from '../../supabase/functions/leaders-api/logic.js';
import { renderJourney } from '../../supabase/functions/leaders-api/journey.js';

const workshop = { id: 'r1', code: 'T-ATTEND', kind: 'workshop', title_ar: 'حضور الأيام التدريبية ({days:T-ATTEND})', config: { sessions_required: 4, verify: 'qr' } };

describe('الكتيب بديلًا عن الأيام التدريبية', () => {
  it('صيغة الكتيب تحوّل المتطلب نفسه إلى قراءة كل الأبواب باختباراتها، بمعرّفه ورمزه', () => {
    const r = applyDelivery(workshop, { format: 'handbook' });
    expect(r).toMatchObject({ id: 'r1', code: 'T-ATTEND', kind: 'reading', config: { scope: 'all', quiz: true } });
    expect(renderJourney({ stages: [], requirements: [r] }).requirements[0].title_ar).not.toContain('{');
  });
  it('الصيغة الحضورية أو غياب الصيغة يُبقي الحضور كما هو', () => {
    expect(applyDelivery(workshop, { format: 'sessions' }).kind).toBe('workshop');
    expect(applyDelivery(workshop, {}).kind).toBe('workshop');
  });
  it('الحفظ يرفض صيغة مجهولة، ويُسقط «حضوري» لأنه الأصل', () => {
    expect(() => cleanDelivery({ 'T-ATTEND': { format: 'x' } }, [workshop])).toThrow();
    expect(cleanDelivery({ 'T-ATTEND': { format: 'sessions' } }, [workshop])).toEqual({});
    expect(cleanDelivery({ 'T-ATTEND': { format: 'handbook' } }, [workshop])).toEqual({ 'T-ATTEND': { format: 'handbook' } });
  });
  it('الدفعة بالكتيب: يكتمل البند بقراءة الأبواب لا بالحضور', () => {
    const def = cohortDefinition({ live: { stages: [], requirements: [workshop] }, cohort: { delivery: { 'T-ATTEND': { format: 'handbook' } } } });
    const ev = { chapters: [{ id: 'm1', dimension: 'milestone', sort: 1, title_ar: 'ب1' }], reading: {}, quizzes: {} };
    const a = activityFor(def.requirements[0], ev);
    expect(a).toEqual(activityFor({ kind: 'reading', config: { scope: 'all', quiz: true } }, ev));
    expect(a).toMatchObject({ type: 'reading', total: 1, done: false });
  });
});

describe('خطة التطبيق من فصول وثيقة المبادرة', () => {
  const models = { 'milestone-register': { title: 'سجل المعالم', status: 'draft' }, 'theory-of-change': { title: 'نظرية التغيير', status: null }, 'stakeholder-map': { title: 'خريطة أصحاب المصلحة', status: 'submitted' } };
  const req = { kind: 'capstone', config: { sections: ['milestone-register', 'theory-of-change', 'stakeholder-map'] } };
  it('يكتمل حين تُحفظ الفصول كلها، ويعرض ما بقي', () => {
    const a = activityFor(req, { models });
    expect(a).toMatchObject({ type: 'capstone', done: false, saved: 2 });
    expect(a.sections.find((x) => !x.saved).title).toBe('نظرية التغيير');
    expect(activityFor(req, { models: { ...models, 'theory-of-change': { status: 'draft' } } }).done).toBe(true);
  });
  it('الفصل الذي لا يخص المشارك يسقط، ويُقفل قبل اعتماد المسار', () => {
    expect(activityFor({ kind: 'capstone', config: { sections: ['roadmap'] } }, { models }).done).toBe(true);
    expect(activityFor(req, { models, modelsLocked: true })).toMatchObject({ done: false, locked: true });
  });
  it('بلا فصول يبقى يكتمل باعتماد الوثيقة كلها', () => {
    expect(activityFor({ kind: 'capstone', config: {} }, { capstone: { status: 'submitted' } }).done).toBe(false);
  });
  it('الإعداد يقبل مفاتيح نماذج صالحة فقط بلا تكرار', () => {
    expect(cleanConfig('capstone', { sections: ['wbs', 'wbs', 'Bad Key', 'raid'] })).toEqual({ sections: ['wbs', 'raid'] });
    expect(cleanConfig('capstone', { sections: [] })).toEqual({});
  });
});

describe('كيف يكتمل البند (محرر الرحلة)', () => {
  it('آلي، أو بدليل من مكانه، أو يدوي', async () => {
    const { completionSource } = await import('../../supabase/functions/leaders-api/logic.js');
    expect(completionSource({ code: 'T-360', kind: 'check' })).toBe('auto');
    expect(completionSource({ code: 'A-DONE', kind: 'auto' })).toBe('auto');
    expect(completionSource({ code: 'T-REACT', kind: 'survey' })).toBe('evidence');
    expect(completionSource({ code: 'T-PLAN', kind: 'capstone' })).toBe('evidence');
    expect(completionSource({ code: 'S-COP', kind: 'check' })).toBe('manual');
  });
});
