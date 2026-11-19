// ما الذي يفعله نشاط «اختياري» يُضاف إلى مرحلة؟ (تصور تشغيل الدفعة 2026-11-19، المرحلة 4، القرار 5)
// التصور افترض ولم يتحقق أن الوضع الاختياري القائم يخرج النشاط من نسبة التقدم ومن شروط المراحل «في كل الحالات»، وعليه بُني
// المسار الموجّه «أضف نشاط ورش اختياريًا لهذه المرحلة». هذه الاختبارات تثبت السلوك القائم كما هو: الافتراض يصح في اكتمال
// المرحلة «بمتطلباتها الإلزامية» وحده، ولا يصح في ثلاث حالات. لذلك لم يُبنَ المسار الموجّه، وينتظر قرار المالك.
// إن تغيّر أحد هذه التوقعات فقد تغيّر السلوك، فيُعاد النظر في القرار لا في الاختبار وحده.
import { describe, expect, it } from 'vitest';
import { buildJourney, gateSurveys, journeyProgress } from '../../supabase/functions/leaders-api/logic.js';

const stages = (complete) => [
  { key: 'training', title_ar: 'التدريب', sort: 1, active: true, ...(complete ? { rules: { complete } } : {}) },
  { key: 'impact', title_ar: 'الأثر', sort: 2, active: true },
];
const req = (id, o = {}) => ({ id, code: id, stage_key: 'training', kind: 'manual', title_ar: id, required: true, sort: 1, active: true, ...o });
const base = [req('a', { sort: 1 }), req('b', { sort: 2 }), req('z', { stage_key: 'impact' })];
// نشاط الورش الاختياري كما كان المسار الموجّه سيضيفه: kind workshop، required false، بلا جلسات بعد
const optional = req('opt-ws', { kind: 'workshop', required: false, sort: 9, config: { sessions_required: 1, verify: 'qr' } });
const noSessions = { type: 'workshop', done: false, count: 0, total: 1, verify: 'qr', sessions: [] };
const journey = (requirements, progress, o = {}) => buildJourney({ stages: stages(o.complete), requirements, progress, levels: {}, state: {}, activity: o.activity || {} });
const stage = (j, k) => j.find((s) => s.key === k);

describe('النشاط الاختياري واكتمال المرحلة', () => {
  it('يصح الافتراض: مرحلة تكتمل «بمتطلباتها الإلزامية» لا يوقفها نشاط اختياري ناقص، ولا يقفل ما بعدها', () => {
    const done = { a: { status: 'done' }, b: { status: 'done' } };
    const before = journey(base, done);
    const after = journey([...base, optional], done, { activity: { 'opt-ws': noSessions } });
    expect([stage(before, 'training').status, stage(before, 'impact').status]).toEqual(['done', 'active']);
    expect([stage(after, 'training').status, stage(after, 'impact').status]).toEqual(['done', 'active']);
    // ولا يكملها وحده: من لم يتم الإلزامي لا تكتمل مرحلته بحضور الاختياري
    const only = journey([...base, optional], { a: { status: 'done' } }, { activity: { 'opt-ws': { ...noSessions, done: true, count: 1 } } });
    expect(stage(only, 'training').status).toBe('active');
  });

  it('لا يصح: في مرحلة تكتمل «بأي متطلب» حضور الورشة الاختيارية يكملها ويفتح ما بعدها', () => {
    const before = journey(base, {}, { complete: 'any' });
    const after = journey([...base, optional], {}, { complete: 'any', activity: { 'opt-ws': { ...noSessions, done: true, count: 1 } } });
    expect([stage(before, 'training').status, stage(before, 'impact').status]).toEqual(['active', 'locked']);
    expect([stage(after, 'training').status, stage(after, 'impact').status]).toEqual(['done', 'active']);
  });
});

describe('النشاط الاختياري ونسبة التقدم', () => {
  it('لا يصح: إضافته تنقص نسبة تقدم من يقف في المرحلة، لأن المقام عدد بنودها كلها', () => {
    const half = { a: { status: 'done' } };
    const before = journey(base, half);
    const after = journey([...base, optional], half, { activity: { 'opt-ws': noSessions } });
    expect([stage(before, 'training').done, stage(before, 'training').total]).toEqual([1, 2]);
    expect([stage(after, 'training').done, stage(after, 'training').total]).toEqual([1, 3]);
    // مرحلتان إلزاميتان: (1/2)/2 = 25% قبل، و(1/3)/2 = 17% بعد
    expect([journeyProgress(before), journeyProgress(after)]).toEqual([25, 17]);
  });

  it('ومن أتم المرحلة لا تتغير نسبته', () => {
    const done = { a: { status: 'done' }, b: { status: 'done' } };
    expect(journeyProgress(journey([...base, optional], done, { activity: { 'opt-ws': noSessions } }))).toBe(journeyProgress(journey(base, done)));
  });
});

describe('النشاط الاختياري والاستبانة', () => {
  it('لا يصح: استبانة المرحلة غير المرسلة تنتظر أول حضور متى وُجد في المرحلة نشاط ورشة، ولو كان اختياريًا بلا جلسات', () => {
    const survey = req('s', { kind: 'survey', sort: 3 });
    const before = journey([...base, survey], {});
    const after = journey([...base, survey, optional], {}, { activity: { 'opt-ws': noSessions } });
    const item = (j) => stage(j, 'training').items.find((i) => i.id === 's');
    expect(item(before).waits).toBeUndefined();
    expect(item(after).waits).toBeTruthy();
    // القاعدة نفسها بلا رحلة: أي بند من نوع ورشة يكفي، إلزاميًا كان أو اختياريًا
    const gated = gateSurveys([{ kind: 'workshop', required: false, status: 'pending', activity: noSessions }, { kind: 'survey', status: 'pending' }]);
    expect(gated[1].waits).toBeTruthy();
  });
});
