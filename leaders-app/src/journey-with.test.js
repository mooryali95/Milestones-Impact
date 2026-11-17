// المراحل المتوازية P1: قاعدة «تبدأ مع» (rules.unlock='with' وrules.with) في المحرك والجداول والمحرر.
// غياب المفتاح يعني «بعد السابقة» كما اليوم، فالبرامج المتتابعة لا يتغير سلوكها.
import { describe, expect, it } from 'vitest';
import { buildJourney, cleanStageRules, distributeSchedule, journeyCoherence, resolveStages, stageRuleSummary, stageRules, stageRulesIssues } from '../../supabase/functions/leaders-api/logic.js';
import { stageWindows, todayStage } from '../../supabase/functions/leaders-api/journey-map.js';
import { STAGE_UNLOCK_AR } from '../../supabase/functions/leaders-api/labels.js';
import { formToStage, stageFields, stageToForm, withOptions } from '../../admin-app/src/methodology.js';

// التأهيل كما اختاره المالك: التوجيه والاستشارة والتوجيه القيادي تبدأ مع بداية التدريب، والأثر ينتظرها كلها
const W = (k) => ({ unlock: 'with', with: k });
const STAGES = [
  { key: 'intro', sort: 1, title_ar: 'الورشة التعريفية', duration_days: 1 },
  { key: 'training', sort: 2, title_ar: 'التدريب', duration_days: 14 },
  { key: 'otj', sort: 3, title_ar: 'التوجيه على رأس العمل', duration_days: 28, rules: W('training') },
  { key: 'consult', sort: 4, title_ar: 'الاستشارة', duration_days: 21, rules: W('training') },
  { key: 'coaching', sort: 5, title_ar: 'التوجيه القيادي', duration_days: 28, rules: W('training') },
  { key: 'impact', sort: 6, title_ar: 'الأثر', duration_days: 30 },
];
const reqsOf = (stages) => stages.map((s, i) => ({ id: `r${i}`, stage_key: s.key, code: `C${i}`, kind: 'check', required: true, sort: 1 }));
const run = (stages, done = [], extra = {}) => buildJourney({
  stages, requirements: reqsOf(stages), levels: {}, state: {},
  progress: Object.fromEntries(done.map((k) => [`r${stages.findIndex((s) => s.key === k)}`, { status: 'done' }])), ...extra,
});
const st = (j) => Object.fromEntries(j.map((s) => [s.key, s.status]));
const plain = (stages) => stages.map(({ rules: _r, ...s }) => s);
const errors = (stages) => stageRulesIssues(stages).filter((x) => x.level === 'error');

describe('«تبدأ مع»: القراءة والحفظ', () => {
  it('stageRules يقرأ with، وغيابه يبقي «بعد السابقة» حرفيًا', () => {
    expect(stageRules(STAGES[2])).toMatchObject({ unlock: 'with', with: 'training' });
    expect(stageRules(STAGES[1])).toMatchObject({ unlock: 'previous', with: null });
    expect(stageRules({ rules: { with: 'training' } })).toMatchObject({ unlock: 'previous' });
  });

  it('cleanStageRules يقبل مرجعًا ظاهرًا قبلها فقط', () => {
    expect(cleanStageRules(W('training'), STAGES, 'otj')).toEqual({ unlock: 'with', with: 'training' });
    // السلسلة مقبولة (الاستشارة مع التوجيه، والتوجيه مع التدريب)
    expect(cleanStageRules(W('otj'), STAGES, 'consult')).toEqual({ unlock: 'with', with: 'otj' });
    expect(() => cleanStageRules({ unlock: 'with' }, STAGES, 'otj')).toThrow('اختر المرحلة');
    expect(() => cleanStageRules(W('otj'), STAGES, 'otj')).toThrow('نفسها');
    expect(() => cleanStageRules(W('ghost'), STAGES, 'otj')).toThrow('غير موجودة');
    expect(() => cleanStageRules(W('impact'), STAGES, 'otj')).toThrow('بعد هذه المرحلة');
    const hidden = STAGES.map((s) => (s.key === 'training' ? { ...s, active: false } : s));
    expect(() => cleanStageRules(W('training'), hidden, 'otj')).toThrow('مخفية');
  });

  it('cleanStageRules بالمفاتيح وحدها (المستدعي القديم) يفحص الوجود والذات', () => {
    expect(cleanStageRules(W('a'), ['a', 'b'], 'b')).toEqual({ unlock: 'with', with: 'a' });
    expect(() => cleanStageRules(W('x'), ['a', 'b'], 'b')).toThrow('غير موجودة');
    // القواعد الأخرى لا تحمل with ولو أُرسل
    expect(cleanStageRules({ unlock: 'stages', after: ['a'], with: 'a' }, ['a', 'b'], 'b')).toEqual({ unlock: 'stages', after: ['a'] });
  });

  it('التسمية في القائمة وفي جملة القاعدة', () => {
    expect(STAGE_UNLOCK_AR.with).toBe('تبدأ مع مرحلة أختارها');
    expect(stageRuleSummary(STAGES[2], STAGES)).toBe('إلزامية · تُفتح مع بداية «التدريب» · تكتمل بمتطلباتها الإلزامية');
  });
});

describe('«تبدأ مع»: الفتح والالتقاء', () => {
  it('تُفتح المراحل الأربع معًا مع بداية التدريب، والأثر ينتظر اكتمالها كلها', () => {
    expect(st(run(STAGES))).toMatchObject({ intro: 'active', training: 'locked', otj: 'locked', consult: 'locked', coaching: 'locked', impact: 'locked' });
    const locked = run(STAGES).find((s) => s.key === 'otj');
    expect(locked.lock_reason).toBe('تُفتح مع بداية «التدريب»');
    expect(st(run(STAGES, ['intro']))).toMatchObject({ training: 'active', otj: 'active', consult: 'active', coaching: 'active', impact: 'locked' });
    // اكتمال التدريب لا يغلق التوجيه، والأثر ينتظر الباقي
    const j = run(STAGES, ['intro', 'training', 'otj']);
    expect(st(j)).toMatchObject({ training: 'done', otj: 'done', consult: 'active', coaching: 'active', impact: 'locked' });
    expect(j.find((s) => s.key === 'impact').lock_reason).toContain('الاستشارة');
    expect(st(run(STAGES, ['intro', 'training', 'otj', 'consult', 'coaching'])).impact).toBe('active');
  });

  it('المرحلة الموازية تكتمل بمتطلباتها ولو سبقت مرجعها', () => {
    expect(st(run(STAGES, ['intro', 'otj']))).toMatchObject({ training: 'active', otj: 'done' });
  });

  it('السلسلة تُحل إلى أولها، وتدخل الأدمن يعمل كما اليوم', () => {
    const chain = STAGES.map((s) => (s.key === 'consult' ? { ...s, rules: W('otj') } : s));
    expect(st(run(chain, ['intro']))).toMatchObject({ otj: 'active', consult: 'active' });
    expect(st(run(chain))).toMatchObject({ otj: 'locked', consult: 'locked' });
    expect(st(run(STAGES, [], { overrides: { otj: 'open' } })).otj).toBe('active');
    expect(st(run(STAGES, [], { overrides: { training: 'open' } }))).toMatchObject({ training: 'active', otj: 'active' });
    // مرجع مكتمل بالإعفاء غير مقفل، فتُفتح معه
    expect(st(run(STAGES, ['intro'], { overrides: { training: 'skip' } })).otj).toBe('active');
  });

  it('مرجع غير إلزامي (عند الطلب ومتاح) يفتحها كذلك', () => {
    const s = [
      { key: 'a', sort: 1, title_ar: 'أ', rules: { mode: 'on_demand', unlock: 'always' } },
      { key: 'b', sort: 2, title_ar: 'ب', rules: W('a') },
    ];
    expect(st(run(s))).toMatchObject({ a: 'available', b: 'active' });
  });

  it('مرجع لاحق أو مخفي (خارج القائمة) أو محذوف يبقيها مقفلة بسببها', () => {
    const items = (keys) => keys.map((key, i) => ({ key, title_ar: key, sort: i + 1, items: [{ required: true, status: 'pending' }] }));
    const [a, b] = items(['a', 'b']);
    const out = resolveStages([{ ...a, rules: W('b') }, b]);
    expect(out[0]).toMatchObject({ status: 'locked', lock_reason: 'تُفتح مع بداية «b»' });
    expect(resolveStages([{ ...a, rules: W('gone') }])[0].status).toBe('locked');
  });

  it('توافق خلفي: رحلة بلا with هي نفسها قبل التغيير', () => {
    expect(run(plain(STAGES), ['intro']).map((s) => s.status)).toEqual(['done', 'active', 'locked', 'locked', 'locked', 'locked']);
  });
});

describe('«تبدأ مع»: الفحص قبل النشر', () => {
  it('الرحلة المتوازية الصحيحة بلا أخطاء، والسلسلة مقبولة', () => {
    expect(errors(STAGES)).toEqual([]);
    expect(errors(STAGES.map((s) => (s.key === 'consult' ? { ...s, rules: W('otj') } : s)))).toEqual([]);
  });

  it('المرجع الذي صار بعدها بالسحب والإفلات خطأ يمنع النشر', () => {
    const moved = STAGES.map((s) => (s.key === 'training' ? { ...s, sort: 7 } : s));
    const e = errors(moved).filter((x) => x.rule === 'with');
    expect(e.map((x) => x.stage).sort()).toEqual(['coaching', 'consult', 'otj']);
    expect(e[0].msg).toContain('بعدها في الترتيب');
  });

  it('المرجع المخفي أو المحذوف أو الفارغ أو الذاتي خطأ', () => {
    const hidden = STAGES.map((s) => (s.key === 'training' ? { ...s, active: false } : s));
    expect(errors(hidden).find((x) => x.stage === 'otj').msg).toContain('مخفية');
    const deleted = STAGES.filter((s) => s.key !== 'training');
    expect(errors(deleted).find((x) => x.stage === 'otj').msg).toContain('غير موجودة');
    expect(errors([{ key: 'a', sort: 1, title_ar: 'أ', rules: { unlock: 'with' } }])[0]).toMatchObject({ rule: 'with', msg: expect.stringContaining('بلا مرحلة') });
    expect(errors([{ key: 'a', sort: 1, title_ar: 'أ', rules: W('a') }]).some((x) => x.rule === 'with' && x.msg.includes('نفسها'))).toBe(true);
  });

  it('يكشف الحلقة بين «تبدأ مع» وغيرها', () => {
    const loop = [
      { key: 'a', sort: 1, title_ar: 'أ', rules: W('b') },
      { key: 'b', sort: 2, title_ar: 'ب', rules: W('a') },
    ];
    expect(errors(loop).some((x) => x.msg.includes('حلقة'))).toBe(true);
    const mixed = [
      { key: 'a', sort: 1, title_ar: 'أ', rules: { unlock: 'stages', after: ['b'] } },
      { key: 'b', sort: 2, title_ar: 'ب', rules: W('a') },
    ];
    expect(errors(mixed).some((x) => x.msg.includes('حلقة'))).toBe(true);
  });

  it('لوحة اتساق الرحلة تعرض الخطأ نفسه', () => {
    const moved = STAGES.map((s) => (s.key === 'training' ? { ...s, sort: 7 } : s));
    expect(journeyCoherence(moved, reqsOf(moved)).some((x) => x.level === 'error' && x.rule === 'with')).toBe(true);
  });
});

describe('«تبدأ مع»: النوافذ وجدول الدفعة', () => {
  const sorted = [...STAGES].sort((a, b) => a.sort - b.sort);

  // النهاية شاملة (القرار 18، R2a): ما بعد المجموعة يبدأ في اليوم التالي لنهاية أطولها
  it('stageWindows: المجموعة تبدأ ببداية التدريب، والأثر بعد أطولها', () => {
    const w = stageWindows(sorted, { starts_on: '2026-12-01' });
    expect(w.intro).toEqual({ from: '2026-12-01', to: '2026-12-01' });
    expect(w.training).toEqual({ from: '2026-12-02', to: '2026-12-15' });
    expect(w.otj).toEqual({ from: '2026-12-02', to: '2026-12-29' });
    expect(w.consult).toEqual({ from: '2026-12-02', to: '2026-12-22' });
    expect(w.coaching).toEqual({ from: '2026-12-02', to: '2026-12-29' });
    expect(w.impact).toEqual({ from: '2026-12-30', to: '2027-01-28' });
  });

  it('stageWindows: جدول الدفعة يبقى المرجع الأول، والمؤشر لا يرجع إلى الخلف', () => {
    const w = stageWindows(sorted, { starts_on: '2026-12-01', schedule: { consult: { start: '2026-12-05', end: '2027-01-20' } } });
    expect(w.consult).toEqual({ from: '2026-12-05', to: '2027-01-20' });
    expect(w.impact.from).toBe('2027-01-21');
    const short = stageWindows(sorted, { starts_on: '2026-12-01', schedule: { consult: { start: '2026-12-02', end: '2026-12-03' } } });
    expect(short.impact.from).toBe('2026-12-30');
  });

  it('stageWindows: السلسلة تبدأ ببداية أولها، وبلا with متتابعة كما اليوم', () => {
    const chain = sorted.map((s) => (s.key === 'consult' ? { ...s, rules: W('otj') } : s));
    expect(stageWindows(chain, { starts_on: '2026-12-01' }).consult.from).toBe('2026-12-02');
    const seq = stageWindows(plain(sorted), { starts_on: '2026-12-01' });
    expect(seq.otj.from).toBe('2026-12-16');
    expect(seq.impact.from).toBe('2027-03-03');
  });

  it('distributeSchedule: المجموعة نصيب واحد بطول أطولها، وكل مرحلة تبدأ ببدايتها', () => {
    // الأوزان: 1 + max(14، 28، 21، 28) + 30 = 59 يومًا على 59 يومًا
    const s = distributeSchedule(STAGES, '2027-01-01', '2027-02-28');
    expect(s.intro).toEqual({ start: '2027-01-01', end: '2027-01-01' });
    for (const k of ['training', 'otj', 'consult', 'coaching']) expect(s[k].start).toBe('2027-01-02');
    expect(s.otj.end).toBe('2027-01-29');
    expect(s.coaching.end).toBe('2027-01-29');
    expect(s.training.end).toBe('2027-01-15');
    expect(s.consult.end).toBe('2027-01-22');
    expect(s.impact).toEqual({ start: '2027-01-30', end: '2027-02-28' });
  });

  it('distributeSchedule: السلسلة في المجموعة نفسها، وبلا with كما اليوم', () => {
    const chain = STAGES.map((s) => (s.key === 'consult' ? { ...s, rules: W('otj') } : s));
    expect(distributeSchedule(chain, '2027-01-01', '2027-02-28').consult.start).toBe('2027-01-02');
    const seq = distributeSchedule(plain(STAGES), '2027-01-01', '2027-02-28');
    expect(seq.otj.start > seq.training.end).toBe(true);
    expect(seq.impact.end).toBe('2027-02-28');
  });

  it('distributeSchedule: المرحلة الموازية لمرجع عند الطلب تأخذ نصيبها في التتابع', () => {
    const s = distributeSchedule([
      { key: 'a', sort: 1, duration_days: 10, rules: { mode: 'on_demand' } },
      { key: 'b', sort: 2, duration_days: 10, rules: W('a') },
      { key: 'c', sort: 3, duration_days: 10 },
    ], '2027-01-01', '2027-01-20');
    expect(s.a).toEqual({ start: '2027-01-01', end: '2027-01-20' });
    expect(s.b).toEqual({ start: '2027-01-01', end: '2027-01-10' });
    expect(s.c).toEqual({ start: '2027-01-11', end: '2027-01-20' });
  });
});

describe('«تبدأ مع»: محرر المرحلة', () => {
  it('القائمة تعرض المراحل الظاهرة قبلها المجاورة لها فقط', () => {
    const list = STAGES.map((s) => (s.key === 'intro' ? { ...s, active: false } : s));
    expect(Object.keys(withOptions(list, 'consult'))).toEqual(['training', 'otj']);
    expect(withOptions(STAGES, 'intro')).toEqual({});
    // الورشة التعريفية يفصلها عن التوجيه «التدريب» وهو لا يسير معها، فلا تُعرض
    const f = stageFields([], STAGES, 'otj').find((x) => x.name === 'rule_with');
    expect(f.options).toEqual({ training: 'التدريب' });
    expect(f.show({ rule_unlock: 'with' })).toBe(true);
    expect(f.show({ rule_unlock: 'previous' })).toBe(false);
  });

  it('النموذج يحمل with ذهابًا وإيابًا، ولا يحمله لغير «تبدأ مع»', () => {
    const v = stageToForm(STAGES[2]);
    expect(v).toMatchObject({ rule_unlock: 'with', rule_with: 'training' });
    expect(formToStage(v).rules).toMatchObject({ unlock: 'with', with: 'training' });
    expect(formToStage({ ...v, rule_unlock: 'previous' }).rules).not.toHaveProperty('with');
    expect(stageToForm(STAGES[1]).rule_with).toBe('');
  });
});

describe('«تبدأ مع»: إصلاحات المراجعة', () => {
  const S = (key, sort, days, rules, phase = 'qualification') => ({ key, sort, title_ar: key, duration_days: days, phase, ...(rules ? { rules } : {}) });

  it('todayStage: مرحلة قصيرة تسير مع أطول منها وتأتي آخر الترتيب لا تنهي الرحلة', () => {
    const stages = [S('a', 1, 30), S('b', 2, 10, W('a'))];
    const w = stageWindows(stages, { starts_on: '2026-01-01' });
    expect(w.b).toEqual({ from: '2026-01-01', to: '2026-01-10' });
    expect(todayStage(stages, w, '2026-01-20')).toBe('a');
    expect(todayStage(stages, w, '2026-01-05')).toBe('b');
    expect(todayStage(stages, w, '2026-02-02')).toBeNull();
    expect(todayStage(stages, w, '2025-12-30')).toBeNull();
  });

  it('todayStage: المرحلة الجارية بالاحتواء لا بآخر ما بدأ في الترتيب', () => {
    // ترتيب قديم (A ثم C ثم B مع A) يرفضه الفحص اليوم، لكن الحساب لا يخطئ فيه
    const stages = [S('a', 1, 10), S('c', 2, 10), S('b', 3, 30, W('a'))];
    const w = stageWindows(stages, { starts_on: '2026-01-01' });
    expect(todayStage(stages, w, '2026-02-05')).toBe('c');
    expect(todayStage(stages, w, '2026-01-20')).toBe('b');
  });

  it('stageWindows وdistributeSchedule يتفقان: ما بين المرجع وتابعه يبدأ بعد المجموعة كلها', () => {
    const stages = [S('a', 1, 10), S('c', 2, 10), S('b', 3, 30, W('a'))];
    const w = stageWindows(stages, { starts_on: '2026-01-01' });
    expect(w.a).toEqual({ from: '2026-01-01', to: '2026-01-10' });
    expect(w.b).toEqual({ from: '2026-01-01', to: '2026-01-30' });
    expect(w.c).toEqual({ from: '2026-01-31', to: '2026-02-09' });
    const d = distributeSchedule(stages, '2026-01-01', '2026-03-01');
    expect(d.c.start > d.b.end).toBe(true);
    expect(d.b.start).toBe(d.a.start);
  });

  it('الفحص يرفض مرجعًا تفصله عنها مرحلة لا تسير معهما، ويقبل الفاصل الذي يسير معهما', () => {
    const odd = [S('a', 1, 10), S('c', 2, 10), S('b', 3, 30, W('a'))];
    const e = errors(odd).find((x) => x.rule === 'with');
    expect(e).toMatchObject({ stage: 'b', msg: expect.stringContaining('«c» لا تسير معهما') });
    expect(errors([S('a', 1, 10), S('c', 2, 10, W('a')), S('b', 3, 30, W('a'))])).toEqual([]);
    expect(errors([S('a', 1, 10), S('c', 2, 10, W('a')), S('b', 3, 30, W('c'))])).toEqual([]);
  });

  it('الفحص والقائمة يرفضان مرجعًا من محور آخر', () => {
    const cross = [S('p', 1, 3, null, 'admission'), S('t', 2, 14, W('p'))];
    expect(errors(cross).find((x) => x.rule === 'with').msg).toContain('من محور واحد');
    expect(withOptions(cross, 't')).toEqual({});
    expect(withOptions([S('p', 1, 3, null, 'admission'), S('t', 2, 14)], 't')).toEqual({});
  });
});
