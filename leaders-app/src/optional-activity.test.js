// قاعدة «الاختياري لا يُحسب» (قرار المالك 2026-11-21، optional.js).
// هذا الملف كان يثبت السلوك السابق (تصور تشغيل الدفعة 2026-11-19، المرحلة 4): النشاط الاختياري كان ينقص نسبة التقدم، ويحبس
// الاستبانة، ويكمل مرحلة «بأي متطلب». لذلك لم يُبنَ المسار الموجّه حينها. القرار حسم القاعدة: الاختياري خارج كل عدّ،
// فانقلبت التوقعات الثلاثة عمدًا، وبقيت الحالتان اللتان كانتا تصحان كما هما. ومعها الورشة الاختيارية ونشاط الورش الإضافية.
import { describe, expect, it } from 'vitest';
import { buildJourney, gateSurveys, journeyProgress, workshopStatus } from '../../supabase/functions/leaders-api/logic.js';
import { countsItem, countedDef, countedProgress, countedSessions, itemOptional } from '../../supabase/functions/leaders-api/optional.js';

const stages = (complete) => [
  { key: 'training', title_ar: 'التدريب', sort: 1, active: true, ...(complete ? { rules: { complete } } : {}) },
  { key: 'impact', title_ar: 'الأثر', sort: 2, active: true },
];
const req = (id, o = {}) => ({ id, code: id, stage_key: 'training', kind: 'manual', title_ar: id, required: true, sort: 1, active: true, ...o });
const base = [req('a', { sort: 1 }), req('b', { sort: 2 }), req('z', { stage_key: 'impact' })];
// نشاط ورش اختياري في البرنامج: kind workshop، required false، بلا جلسات بعد
const optional = req('opt-ws', { kind: 'workshop', required: false, sort: 9, config: { sessions_required: 1, verify: 'qr' } });
const noSessions = { type: 'workshop', done: false, count: 0, total: 1, verify: 'qr', sessions: [] };
const journey = (requirements, progress, o = {}) => buildJourney({ stages: stages(o.complete), requirements, progress, levels: {}, state: {}, activity: o.activity || {} });
const stage = (j, k) => j.find((s) => s.key === k);

describe('النشاط الاختياري واكتمال المرحلة', () => {
  it('مرحلة تكتمل «بمتطلباتها الإلزامية» لا يوقفها نشاط اختياري ناقص، ولا يقفل ما بعدها', () => {
    const done = { a: { status: 'done' }, b: { status: 'done' } };
    const before = journey(base, done);
    const after = journey([...base, optional], done, { activity: { 'opt-ws': noSessions } });
    expect([stage(before, 'training').status, stage(before, 'impact').status]).toEqual(['done', 'active']);
    expect([stage(after, 'training').status, stage(after, 'impact').status]).toEqual(['done', 'active']);
    // ولا يكملها وحده: من لم يتم الإلزامي لا تكتمل مرحلته بحضور الاختياري
    const only = journey([...base, optional], { a: { status: 'done' } }, { activity: { 'opt-ws': { ...noSessions, done: true, count: 1 } } });
    expect(stage(only, 'training').status).toBe('active');
  });

  it('وفي مرحلة تكتمل «بأي متطلب»: حضور الورشة الاختيارية لا يكملها ولا يفتح ما بعدها (كان يكملها)', () => {
    const before = journey(base, {}, { complete: 'any' });
    const after = journey([...base, optional], {}, { complete: 'any', activity: { 'opt-ws': { ...noSessions, done: true, count: 1 } } });
    expect([stage(before, 'training').status, stage(before, 'impact').status]).toEqual(['active', 'locked']);
    expect([stage(after, 'training').status, stage(after, 'impact').status]).toEqual(['active', 'locked']);
    // والإلزامي يكملها كما كان
    const byRequired = journey([...base, optional], { a: { status: 'done' } }, { complete: 'any', activity: { 'opt-ws': noSessions } });
    expect([stage(byRequired, 'training').status, stage(byRequired, 'impact').status]).toEqual(['done', 'active']);
  });
});

describe('النشاط الاختياري ونسبة التقدم', () => {
  it('إضافته لا تغيّر نسبة من يقف في المرحلة: المقام عدد البنود التي تُعد (كانت تنقص من 25 إلى 17)', () => {
    const half = { a: { status: 'done' } };
    const before = journey(base, half);
    const after = journey([...base, optional], half, { activity: { 'opt-ws': noSessions } });
    expect([stage(before, 'training').done, stage(before, 'training').total]).toEqual([1, 2]);
    expect([stage(after, 'training').done, stage(after, 'training').total]).toEqual([1, 2]);
    expect([journeyProgress(before), journeyProgress(after)]).toEqual([25, 25]);
  });

  it('وإنجازه لا يزيد النسبة: لا يدخل البسط كما لا يدخل المقام', () => {
    const half = { a: { status: 'done' } };
    const attended = journey([...base, optional], half, { activity: { 'opt-ws': { ...noSessions, done: true, count: 1 } } });
    expect([stage(attended, 'training').done, stage(attended, 'training').total]).toEqual([1, 2]);
    expect(journeyProgress(attended)).toBe(25);
  });

  it('ومن أتم المرحلة لا تتغير نسبته', () => {
    const done = { a: { status: 'done' }, b: { status: 'done' } };
    expect(journeyProgress(journey([...base, optional], done, { activity: { 'opt-ws': noSessions } }))).toBe(journeyProgress(journey(base, done)));
  });
});

describe('النشاط الاختياري والاستبانة', () => {
  it('استبانة المرحلة لا تنتظر حضور نشاط ورشة اختياري (كانت تنتظره)', () => {
    const survey = req('s', { kind: 'survey', sort: 3 });
    const before = journey([...base, survey], {});
    const after = journey([...base, survey, optional], {}, { activity: { 'opt-ws': noSessions } });
    const item = (j) => stage(j, 'training').items.find((i) => i.id === 's');
    expect(item(before).waits).toBeUndefined();
    expect(item(after).waits).toBeUndefined();
    const gated = gateSurveys([{ kind: 'workshop', required: false, status: 'pending', activity: noSessions }, { kind: 'survey', status: 'pending' }]);
    expect(gated[1].waits).toBeUndefined();
  });

  it('والورشة الإلزامية تحبسها حتى أول حضور كما كانت', () => {
    const gated = gateSurveys([{ kind: 'workshop', required: true, status: 'pending', activity: noSessions }, { kind: 'survey', status: 'pending' }]);
    expect(gated[1].waits).toBeTruthy();
    // ونشاط اختياري قبل الإلزامي في الترتيب لا يحجبه: البوابة على أول بند حضور يُعد
    const mixed = gateSurveys([
      { kind: 'workshop', required: false, status: 'done', activity: { ...noSessions, count: 1, done: true } },
      { kind: 'workshop', required: true, status: 'pending', activity: noSessions }, { kind: 'survey', status: 'pending' }]);
    expect(mixed[2].waits).toBeTruthy();
  });
});

// ── الورشة الاختيارية (workshop_sessions.optional) ──
const at = (d, h = 9) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;
const ses = (id, d, o = {}) => ({ id, title_ar: id, starts_at: at(d), ends_at: at(d, 12), active: true, mode: 'in_person', ...o });
const NOW = Date.parse(at(20));

describe('الورشة الاختيارية لا تُعد يومًا', () => {
  const cfg = { sessions_required: 2, verify: 'qr' };
  it('حضورها لا يدخل العدّاد ولا يكمل النشاط، وتبقى ظاهرة بوسمها', () => {
    const sessions = [ses('d1', 1), ses('d2', 2), ses('x', 3, { optional: true })];
    const one = workshopStatus(cfg, sessions, new Set(['d1', 'x']), NOW);
    expect([one.count, one.total, one.done]).toEqual([1, 2, false]);
    expect(one.sessions.map((s) => [s.id, !!s.optional, s.attended])).toEqual([['d1', false, true], ['d2', false, false], ['x', true, true]]);
    const two = workshopStatus(cfg, sessions, new Set(['d1', 'd2']), NOW);
    expect([two.count, two.total, two.done]).toEqual([2, 2, true]);
  });

  it('والإلزامية الإضافية تُحسب لمن ينقصه يوم ولا تزيد المطلوب (القرار 6 باقٍ)', () => {
    const sessions = [ses('d1', 1), ses('d2', 2), ses('extra', 3)];
    const r = workshopStatus(cfg, sessions, new Set(['d1', 'extra']), NOW);
    expect([r.count, r.total, r.done]).toEqual([2, 2, true]);
  });

  it('بلا عدد مطلوب في الإعداد: المطلوب عدد الجلسات الإلزامية وحدها', () => {
    const r = workshopStatus({ verify: 'qr' }, [ses('d1', 1), ses('x', 2, { optional: true })], new Set(['d1']), NOW);
    expect([r.count, r.total, r.done]).toEqual([1, 1, true]);
  });

  it('countedSessions: المصدر الواحد لمن يعدّ الجلسات', () => {
    expect(countedSessions([{ id: 1 }, { id: 2, optional: true }, { id: 3, optional: false }]).map((s) => s.id)).toEqual([1, 3]);
    expect(countedSessions(null)).toEqual([]);
  });
});

// ── نشاط «ورش إضافية» (config.each): المسار الموجّه لمرحلة بلا نشاط حضور ──
describe('نشاط الورش الإضافية', () => {
  const each = req('extra-ws', { kind: 'workshop', sort: 9, config: { sessions_required: 1, verify: 'qr', each: true } });
  const act = (sessions, attended = []) => workshopStatus(each.config, sessions, new Set(attended), NOW);

  it('المطلوب كل ورشة إلزامية بعينها، والاختيارية خارجه', () => {
    const r = act([ses('m1', 1), ses('m2', 2), ses('o', 3, { optional: true })], ['m1', 'o']);
    expect([r.count, r.total, r.done, r.each]).toEqual([1, 2, false, true]);
    expect(act([ses('m1', 1), ses('m2', 2)], ['m1', 'm2']).done).toBe(true);
  });

  it('بلا ورشة إلزامية يخمد: خارج المقام والاكتمال والاستبانة، كأنه غير موجود', () => {
    const dormant = act([ses('o', 3, { optional: true })], ['o']);
    expect([dormant.total, dormant.done]).toEqual([0, false]);
    expect(itemOptional(each, dormant)).toBe(true);
    const half = { a: { status: 'done' } };
    const survey = req('s', { kind: 'survey', sort: 3 });
    const before = journey([...base, survey], half);
    const after = journey([...base, survey, each], half, { activity: { 'extra-ws': dormant } });
    expect([stage(after, 'training').done, stage(after, 'training').total]).toEqual([stage(before, 'training').done, stage(before, 'training').total]);
    expect(journeyProgress(after)).toBe(journeyProgress(before));
    expect(stage(after, 'training').items.find((i) => i.id === 'extra-ws').required).toBe(false);
    expect(stage(after, 'training').items.find((i) => i.id === 's').waits).toBeUndefined();
    // ومن أتم الإلزامي تكتمل مرحلته
    const all = journey([...base, each], { a: { status: 'done' }, b: { status: 'done' } }, { activity: { 'extra-ws': dormant } });
    expect(stage(all, 'training').status).toBe('done');
  });

  it('بورشة إلزامية يدخل العد: في المقام، ويوقف اكتمال المرحلة حتى تُحضر', () => {
    const live = act([ses('m1', 1)], []);
    const done = { a: { status: 'done' }, b: { status: 'done' } };
    const j = journey([...base, each], done, { activity: { 'extra-ws': live } });
    expect([stage(j, 'training').status, stage(j, 'training').done, stage(j, 'training').total]).toEqual(['active', 2, 3]);
    expect(stage(j, 'impact').status).toBe('locked');
    const attended = journey([...base, each], done, { activity: { 'extra-ws': act([ses('m1', 1)], ['m1']) } });
    expect(stage(attended, 'training').status).toBe('done');
  });

  it('حفظ الاكتمال: من اعتُمد له النشاط يبقى مكتملًا مع ورشة إلزامية لم يحضرها، ولو خمد النشاط بعدها', () => {
    const done = { a: { status: 'done' }, b: { status: 'done' }, 'extra-ws': { status: 'done', note: 'أتم المرحلة قبل إضافة الورشة' } };
    const j = journey([...base, each], done, { activity: { 'extra-ws': act([ses('m1', 1)], []) } });
    expect([stage(j, 'training').status, stage(j, 'impact').status]).toEqual(['done', 'active']);
    const dormant = journey([...base, each], done, { activity: { 'extra-ws': act([ses('o', 1, { optional: true })], []) } });
    expect(stage(dormant, 'training').status).toBe('done');
    expect(stage(dormant, 'training').items.find((i) => i.id === 'extra-ws').required).toBe(true);
  });

  it('وهو وحده في مرحلة «بمتطلباتها الإلزامية»: خامدًا لا يكملها أحد، وبورشة إلزامية يكملها حضورها', () => {
    const lone = [each, req('z', { stage_key: 'impact' })];
    expect(stage(journey(lone, {}, { activity: { 'extra-ws': act([]) } }), 'training').status).toBe('active');
    expect(stage(journey(lone, {}, { activity: { 'extra-ws': act([ses('m1', 1)], ['m1']) } }), 'training').status).toBe('done');
  });
});

describe('القاعدة نفسها بأسمائها', () => {
  it('countsItem وcountedProgress وcountedDef', () => {
    expect([countsItem({ required: true }), countsItem({ required: false }), countsItem({}), countsItem(null)]).toEqual([true, false, true, false]);
    expect(countedProgress([{ required: true, status: 'done' }, { required: false, status: 'done' }, { required: true, status: 'pending' }])).toEqual({ done: 1, total: 2, optional: 1 });
    expect([countedDef({ required: true, kind: 'workshop', config: {} }), countedDef({ required: false }), countedDef({ required: true, kind: 'workshop', config: { each: true } })]).toEqual([true, false, false]);
  });
});
