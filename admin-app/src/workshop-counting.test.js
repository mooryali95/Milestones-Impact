// وسم الورشة في اللوحة (قرار المالك 2026-11-21، القاعدة في optional.js): حقل الاختيار الصريح بلا قيمة مسبقة، ومتى تُطلب
// المعاينة من الخادم، وسؤال التأكيد بسطور الأثر، وعدّاد بطاقة المرحلة وشارة كل يوم، ونقاط الخط. ومعه مستهلكو القاعدة
// في الخادم الصافي: «ماذا تغيّر»، وورقة المتابعة، وبريد التذكير، وجاهزية الدفعة.
import { describe, expect, it, vi } from 'vitest';
import {
  COUNTING_REQUIRED_AR, countingChip, countingConfirm, countingField, countingValue, EACH_EFFECT_AR, mailConfirm, needsCountingPreview, saveBody, stageWorkshopReqs, workshopDays,
} from './workshop-days.js';
import { cohortTimeline } from './cohort-journey.js';
import { COUNTING_AR, COUNTING_HELP_AR, countingImpactAr, NO_IMPACT, OPTIONAL_NOT_READY_AR, OPTIONAL_PARTICIPANT_AR } from '../../supabase/functions/leaders-api/optional.js';
import { changeFacts } from '../../supabase/functions/leaders-api/cohort-changes.js';
import { journeyMap, needsOf, turnOf } from '../../supabase/functions/leaders-api/journey-map.js';
import { nudgeFor } from '../../supabase/functions/leaders-api/nudge.js';
import { sessionsFor, undatedFor, workshopOf } from '../../supabase/functions/leaders-api/cohort-setup.js';
import { nextSessionAt } from '../../supabase/functions/leaders-api/today-desk.js';
import { cleanConfig, hideBreaksStage, programHours } from '../../supabase/functions/leaders-api/logic.js';
import { MIGRATION_GATES, MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';

const stages = [
  { key: 'training', title_ar: 'التدريب', phase: 'qualification', sort: 1, duration_days: 14, active: true },
  { key: 'apply', title_ar: 'التطبيق', phase: 'qualification', sort: 2, duration_days: 14, active: true },
];
const pool = { id: 'r1', code: 'T-ATTEND', stage_key: 'training', kind: 'workshop', required: true, title_ar: 'حضور الأيام التدريبية', active: true, config: { sessions_required: 2, verify: 'qr' }, sort: 1 };
const each = { id: 'r9', code: 'W-EXTRA-1', stage_key: 'apply', kind: 'workshop', required: true, title_ar: 'ورش إضافية', active: true, config: { sessions_required: 1, verify: 'qr', each: true }, sort: 2 };
const cohort = { id: 'c1', name: 'دفعة نوفمبر', starts_on: '2026-11-02', ends_on: '2026-12-31', schedule: {} };
const NOW = Date.parse('2026-11-16T09:00:00Z');
const day = (id, at, extra = {}) => ({ id, requirement_id: 'r1', cohort_id: 'c1', title_ar: `يوم ${id}`, mode: 'in_person', location_ar: 'القاعة', join_url: null,
  starts_at: `${at}T06:00:00Z`, ends_at: `${at}T12:00:00Z`, active: true, verify: 'qr', expected: 18, attended: 0, ...extra });
const daysFor = (requirements, sessions, key, title) => {
  const def = { stages, requirements, sessions };
  return workshopDays({ def, stage: { key, title }, sessions, model: cohortTimeline(def, cohort, '2026-11-16T09:00:00Z'), cohortId: 'c1', now: NOW });
};

describe('حقل الوسم: اختيار صريح بلا قيمة مسبقة', () => {
  it('اختياران بسطر شرح لكل منهما، ونص خطأ إن لم يُختر', () => {
    const f = countingField();
    expect([f.name, f.type, f.required]).toEqual(['counting', 'choice', COUNTING_REQUIRED_AR]);
    expect(f.options.map((o) => [o.value, o.label, o.help, !!o.disabled])).toEqual([
      ['mandatory', 'إلزامية', COUNTING_HELP_AR.mandatory, false], ['optional', 'اختيارية', COUNTING_HELP_AR.optional, false]]);
    expect(COUNTING_HELP_AR.mandatory).toMatch(/تُحسب في كل شيء/);
    expect(COUNTING_HELP_AR.optional).toMatch(/لا تُحسب في شيء/);
  });
  it('قبل ترحيل العمود: «اختيارية» معطلة بجملتها، و«إلزامية» كما هي', () => {
    const [m, o] = countingField({ ready: false }).options;
    expect([!!m.disabled, o.disabled, o.note]).toEqual([false, true, OPTIONAL_NOT_READY_AR]);
    expect(OPTIONAL_NOT_READY_AR).toBe('غير مفعّلة بعد');
  });
  it('وسم الجلسة القائمة وشارتها: الاختيارية، وأي ورشة في نشاط اختياري في البرنامج', () => {
    expect([countingValue({ optional: true }), countingValue({ optional: false }), countingValue({})]).toEqual(['optional', 'mandatory', 'mandatory']);
    expect(countingChip({ optional: true })).toMatchObject({ optional: true, text: COUNTING_AR.optional });
    expect(countingChip({})).toMatchObject({ optional: false, text: COUNTING_AR.mandatory });
    expect(countingChip({}, { required: false })).toMatchObject({ optional: true, text: 'اختيارية' });
  });
  it('saveBody: تأكيد الوسم بجانب الصف لا فيه، والوسم نفسه في الصف', () => {
    const b = saveBody({ title_ar: 'ورشة', counting: 'optional', counting_confirm: true, invite: true }, { id: 'w1' });
    expect(b).toEqual({ row: { title_ar: 'ورشة', counting: 'optional', id: 'w1' }, invite: true, counting_confirm: true });
    expect('counting_confirm' in saveBody({ title_ar: 'ورشة', counting: 'mandatory' }, {})).toBe(false);
  });
});

describe('متى تُطلب معاينة الأثر من الخادم', () => {
  it('تغيير وسم جلسة قائمة دائمًا، وبقاؤه لا', () => {
    expect(needsCountingPreview({ original: { optional: false }, counting: 'optional' })).toBe(true);
    expect(needsCountingPreview({ original: { optional: true }, counting: 'mandatory' })).toBe(true);
    expect(needsCountingPreview({ original: { optional: false }, counting: 'mandatory' })).toBe(false);
    expect(needsCountingPreview({ original: {}, counting: null })).toBe(false);
  });
  it('ورشة جديدة: الإلزامية في نشاط ورش إضافية أو في مرحلة بلا نشاط حضور وحدها (ترفع المطلوب)', () => {
    expect(needsCountingPreview({ counting: 'mandatory', req: each })).toBe(true);
    expect(needsCountingPreview({ counting: 'mandatory', guided: true })).toBe(true);
    expect(needsCountingPreview({ counting: 'mandatory', req: pool })).toBe(false);
    expect(needsCountingPreview({ counting: 'optional', req: each })).toBe(false);
    expect(needsCountingPreview({ counting: 'optional', guided: true })).toBe(false);
  });
});

describe('سؤال التأكيد بسطور الأثر', () => {
  const body = { row: { id: 'w1', title_ar: 'اليوم 2', counting: 'optional' } };
  it('بلا معاينة: سؤال البريد كما هو، ولا طلب للخادم', async () => {
    const call = vi.fn();
    expect(await countingConfirm(call, body, { base: null })).toBeNull();
    const mail = mailConfirm({ invite: true, title_ar: 'اليوم 2' });
    expect(await countingConfirm(call, body, { base: mail })).toBe(mail);
    expect(call).not.toHaveBeenCalled();
  });
  it('بمعاينة: يطلب الحفظ نفسه بـpreview، ويعرض الأرقام، ويحمل التأكيد إلى الحفظ', async () => {
    const call = vi.fn(async () => ({ success: true, preview: true, impact: { ...NO_IMPACT, members: 22, preserved: 3, progress_down: 2 } }));
    const ask = await countingConfirm(call, body, { preview: true, counting: 'optional', title: 'اليوم 2', changed: true });
    expect(call).toHaveBeenCalledWith('admin.workshop-save', { ...body, preview: true });
    expect(ask.text).toBe('يتغير وسم «اليوم 2» إلى «اختيارية». هذا أثره على أعضاء الدفعة:');
    expect(ask.lines).toEqual(['تنخفض نسبة تقدم مشاركَين.', 'من أتم ما يخصه قبل هذا التغيير (3 مشاركين) يبقى اكتماله محفوظًا: لا يُسحب منه شيء، ولا شهادة تُمس.']);
    expect([ask.ok, ask.patch]).toEqual(['غيّر الوسم', { counting_confirm: true }]);
  });
  it('ومع سؤال بريد: سؤال واحد يجمعهما بزر البريد', async () => {
    const call = async () => ({ success: true, impact: { ...NO_IMPACT, members: 5, required_of: 4, preserved: 1 } });
    const ask = await countingConfirm(call, body, { base: { text: 'تُضاف «ورشة» إلى «التطبيق». متابعة؟', ok: 'أضف وأرسل الدعوة' }, preview: true, counting: 'mandatory' });
    expect(ask.text).toMatch(/^تُضاف «ورشة» إلى «التطبيق»\. متابعة؟\nوأثر وسمها «إلزامية» على أعضاء الدفعة:$/);
    expect([ask.ok, ask.lines[0]]).toEqual(['أضف وأرسل الدعوة', 'تصير مطلوبة من 4 مشاركين لإكمال المرحلة.']);
  });
  it('تعذّر المعاينة يوقف الحفظ برسالته', async () => {
    expect(await countingConfirm(async () => ({ success: false, message: 'الدفعة أكبر من أن يُحسب أثر الوسم' }), body, { preview: true, counting: 'optional' })).toEqual({ error: 'الدفعة أكبر من أن يُحسب أثر الوسم' });
    expect((await countingConfirm(async () => null, body, { preview: true, counting: 'optional' })).error).toMatch(/تعذّرت معاينة أثر الوسم/);
  });
  it('سطور الأثر: بلا أثر جملة واحدة صادقة لكل وسم، والأعداد بمعدودها', () => {
    expect(countingImpactAr(null, 'optional')).toEqual(['لا يتغير تقدم أحد ولا اكتماله: الورشة الاختيارية خارج كل حساب.']);
    expect(countingImpactAr({ members: 9 }, 'mandatory')).toEqual(['لا يتغير تقدم أحد ولا اكتماله الآن: تُحسب لمن يحضرها.']);
    expect(countingImpactAr({ required_of: 1, completes: 11, progress_up: 2 }, 'mandatory')).toEqual(['تصير مطلوبة من مشارك واحد لإكمال المرحلة.', 'يكتمل بها نشاط 11 مشاركًا.', 'ترتفع نسبة تقدم مشاركَين.']);
  });
});

describe('بطاقة المرحلة: العدّاد على ما يُعد وحده، وشارة لكل يوم', () => {
  it('الاختيارية خارج «2 من 2 محددة» وتُذكر وحدها', () => {
    const d = daysFor([pool], [day('a', '2026-11-03'), day('b', '2026-11-10'), day('x', '2026-11-12', { optional: true })], 'training', 'التدريب');
    expect([d.set, d.need, d.count_ar, d.tone]).toEqual([2, 2, '2 من 2 محددة، وورشة اختيارية خارج العد', 'ok']);
    expect(d.rows.map((r) => [r.id, r.counting.text])).toEqual([['a', 'إلزامية'], ['b', 'إلزامية'], ['x', 'اختيارية']]);
    // ولو كانت وحدها مع يوم واحد: النقص يبقى ظاهرًا
    const short = daysFor([pool], [day('a', '2026-11-03'), day('x', '2026-11-12', { optional: true })], 'training', 'التدريب');
    expect([short.count_ar, short.tone]).toEqual(['1 من 2 محددة، وورشة اختيارية خارج العد', 'warn']);
  });
  it('نشاط الورش الإضافية: المطلوب ورشه الإلزامية القائمة، وبلا واحدة «لا ورشة إلزامية»', () => {
    const ws = (id, extra = {}) => day(id, '2026-11-20', { requirement_id: 'r9', ...extra });
    expect(stageWorkshopReqs({ requirements: [pool, each] }, 'apply')).toMatchObject([{ id: 'r9', each: true, optional: false }]);
    const d = daysFor([pool, each], [ws('m1'), ws('m2'), ws('o', { optional: true }), ws('off', { active: false })], 'apply', 'التطبيق');
    expect([d.each_only, d.head_ar, d.need, d.count_ar, d.tone]).toEqual([true, 'ورش التطبيق', 2, 'ورشتان إلزاميتان، وورشة اختيارية خارج العد', 'ok']);
    const none = daysFor([pool, each], [ws('o', { optional: true })], 'apply', 'التطبيق');
    expect([none.need, none.count_ar]).toEqual([0, 'لا ورشة إلزامية، وورشة اختيارية خارج العد']);
  });
  it('نشاط اختياري في البرنامج: كل أيامه اختيارية ولا مطلوب له', () => {
    const opt = { ...pool, required: false };
    const d = daysFor([opt], [day('a', '2026-11-03')], 'training', 'التدريب');
    expect([d.need, d.rows[0].counting.optional, d.count_ar]).toEqual([0, true, 'لا ورشة إلزامية، وورشة اختيارية خارج العد']);
  });
  it('نقاط الخط: الإلزامية ممتلئة والاختيارية مفرغة، ونشاط الورش الإضافية يُعد بورشة إلزامية وحدها', () => {
    const sessions = [day('a', '2026-11-03'), day('x', '2026-11-05', { optional: true }), day('o', '2026-11-20', { requirement_id: 'r9', optional: true })];
    const m = cohortTimeline({ stages, requirements: [pool, each], sessions }, cohort, '2026-11-16T09:00:00Z');
    const act = (id) => m.activities.find((a) => a.requirement_id === id);
    expect(act('r1').dates.map((x) => [x.session, x.required])).toEqual([['a', true], ['x', false]]);
    expect([act('r1').required, act('r9').required, act('r9').dates[0].required]).toEqual([true, false, false]);
    const live = cohortTimeline({ stages, requirements: [pool, each], sessions: [...sessions, day('m', '2026-11-21', { requirement_id: 'r9' })] }, cohort, '2026-11-16T09:00:00Z');
    expect(live.activities.find((a) => a.requirement_id === 'r9').required).toBe(true);
  });
  it('إعداد النشاط يحفظ each، وساعات الشهادة لا تحسب نشاطًا بلا عدد ثابت ولا نشاطًا اختياريًا', () => {
    expect(cleanConfig('workshop', { each: true, sessions_required: 1, verify: 'qr' }, {})).toEqual({ sessions_required: 1, verify: 'qr', each: true });
    expect('each' in cleanConfig('workshop', { sessions_required: 4 }, {})).toBe(false);
    const timed = [{ ...pool, config: { ...pool.config, minutes: 360 } }, { ...each, config: { ...each.config, minutes: 120 } }, { ...pool, id: 'r2', code: 'T-OPT', required: false, config: { sessions_required: 3, minutes: 60 } }];
    expect(programHours(timed)).toMatchObject({ hours: 12, missing: [] });
  });
  it('الترحيل متسامح ومسجل في القائمة المولّدة', () => {
    expect(MIGRATIONS).toContain('20261122100000_leaders_workshop_optional');
    expect(MIGRATION_GATES['20261122100000_leaders_workshop_optional'][0]).toBe('tolerant');
    expect(EACH_EFFECT_AR).toMatch(/من أتم المرحلة قبل إضافتها يبقى مكتملًا/);
    expect(OPTIONAL_PARTICIPANT_AR).toBe('اختيارية، لا تُحسب في تقدمك');
  });
});

// ── مستهلكو القاعدة في الخادم الصافي ──
const item = (o) => ({ id: o.id || o.title_ar, code: o.id || 'X', title_ar: o.title_ar, kind: 'manual', required: true, status: 'pending', ...o });
const wsItem = (o, sessions) => item({ kind: 'workshop', activity: { type: 'workshop', sessions, count: sessions.filter((s) => s.attended && !s.optional).length, total: 2 }, ...o });
const sess = (id, d, o = {}) => ({ id, title: id, starts_at: `2026-11-${d}T06:00:00Z`, ends_at: `2026-11-${d}T12:00:00Z`, attended: false, ...o });

describe('«ماذا تغيّر» وأرقام البريد: الاختياري خارجها', () => {
  it('لا «أنجزوا نشاطًا» لبند اختياري، ولا «حضروا ورشة» لورشة اختيارية ولا لنشاط اختياري', () => {
    const journey = [{ key: 'training', status: 'active', items: [
      item({ title_ar: 'إلزامي', status: 'done', done_at: '2026-11-15T08:00:00Z' }),
      item({ title_ar: 'اختياري', required: false, status: 'done', done_at: '2026-11-15T09:00:00Z' }),
      item({ title_ar: 'اختياري مسلَّم', required: false, status: 'submitted', waiting_at: '2026-11-15T09:00:00Z' }),
      wsItem({ title_ar: 'الحضور' }, [sess('d1', 10, { attended: true, attended_at: '2026-11-10T07:00:00Z' }), sess('x', 12, { optional: true, attended: true, attended_at: '2026-11-12T07:00:00Z' })]),
      wsItem({ title_ar: 'لقاءات', required: false }, [sess('y', 13, { attended: true, attended_at: '2026-11-13T07:00:00Z' })]),
    ] }];
    const f = changeFacts(journey, { now: NOW });
    expect(f.done_at).toEqual(['2026-11-15T08:00:00Z']);
    expect(f.waiting).toEqual([]);
    expect(f.ws.map((x) => x.id)).toEqual(['d1']);
    expect(f.finished_at).toBe('2026-11-15T08:00:00Z');
  });
});

describe('ورقة المتابعة: ما ينقصه ودوره وحضوره', () => {
  it('الاختياري لا يُسمى «ما ينقصه» ولا يُنسب إليه دور، ومرحلة بقي فيها اختياري وحده لا ينقصها شيء', () => {
    const stage = { key: 's', status: 'active', items: [item({ title_ar: 'قراءة اختيارية', required: false }), item({ title_ar: 'ارفع الواجب' })] };
    expect(needsOf(stage)).toBe('ارفع الواجب');
    expect(turnOf(stage, NOW).turn).toBe('participant');
    const rest = { key: 's', status: 'active', items: [item({ title_ar: 'قراءة اختيارية', required: false }), item({ title_ar: 'ارفع الواجب', status: 'done' })] };
    expect([needsOf(rest), turnOf(rest, NOW).turn]).toEqual([null, 'none']);
  });
  it('نشاط حضور بلا ورشة إلزامية قادمة: الدور على الإدارة ولو كانت له ورشة اختيارية قادمة', () => {
    const only = { key: 's', status: 'active', items: [wsItem({ title_ar: 'الحضور' }, [sess('x', 20, { optional: true })])] };
    expect(turnOf(only, NOW)).toEqual({ turn: 'admin', why: 'لا جلسة قادمة له' });
    const ahead = { key: 's', status: 'active', items: [wsItem({ title_ar: 'الحضور' }, [sess('m', 20)])] };
    expect(turnOf(ahead, NOW).turn).toBe('schedule');
  });
  it('«حضر 1 من 1» بلا الورشة الاختيارية ولا النشاط الاختياري، و«لم يحضر آخر ورشة» للإلزامية وحدها', () => {
    const journey = [{ key: 'training', title_ar: 'التدريب', sort: 1, status: 'active', stage_mode: 'required', items: [
      wsItem({ title_ar: 'الحضور' }, [sess('d1', 10, { attended: true }), sess('x', 14, { optional: true })]),
      wsItem({ id: 'opt', title_ar: 'لقاءات', required: false }, [sess('y', 15)]),
    ] }];
    const m = journeyMap({ stages: [{ key: 'training', title_ar: 'التدريب', sort: 1 }], people: [{ id: 'p1', name: 'سارة', status: 'enrolled', journey, milestones: [], dates: [] }], today: new Date(NOW), roster: true });
    expect([m.members[0].attendance, m.members[0].missed_last]).toEqual([{ count: 1, total: 1 }, false]);
  });
});

describe('بريد التذكير وجاهزية الدفعة', () => {
  it('«أنجز N من M» بالبنود التي تُعد، ولا تذكير ببند اختياري أُعيد', () => {
    const journey = [{ key: 'training', title_ar: 'التدريب', sort: 1, status: 'active', stage_mode: 'required', items: [
      item({ title_ar: 'واجب', status: 'done' }), item({ title_ar: 'تمرين' }),
      item({ title_ar: 'قراءة اختيارية', required: false, status: 'done' }), item({ title_ar: 'نشاط اختياري', required: false, status: 'returned', note: 'عدّل' }),
    ] }];
    const n = nudgeFor({ p: { status: 'enrolled', email: 'p@example.sa', created_at: '2026-11-01T00:00:00Z' }, journey, progress: 50, now: NOW });
    expect([n.ok, n.kind, n.step, n.remaining]).toEqual([true, 'stage', 'تمرين', 'أنجز 1 من 2 في هذه المرحلة']);
    expect(n.snapshot.done).toBe(1);
  });
  it('الورشة الاختيارية ليست جلسة للدفعة: لا في جاهزيتها ولا في غير المؤرخ ولا في أقرب جلسة', () => {
    const c = { id: 'c1' };
    const rows = [{ cohort_id: 'c1', active: true, starts_at: '2026-11-20T06:00:00Z', ends_at: '2026-11-20T12:00:00Z', optional: true }, { cohort_id: 'c1', active: true, starts_at: null, ends_at: null, optional: true }];
    expect([workshopOf(c, rows[0]), sessionsFor(c, rows, NOW), undatedFor(c, rows), nextSessionAt(c, { workshops: rows, now: NOW })]).toEqual([false, 0, 0, null]);
    const live = [...rows, { cohort_id: 'c1', active: true, starts_at: '2026-11-25T06:00:00Z', ends_at: '2026-11-25T12:00:00Z', optional: false }];
    expect([sessionsFor(c, live, NOW), nextSessionAt(c, { workshops: live, now: NOW })]).toEqual([1, '2026-11-25T06:00:00Z']);
  });
  it('فحص البرنامج: مرحلة لا يكملها إلا نشاط ورش إضافية أو اختياري تُعد بلا بند يكملها', () => {
    const st = [{ key: 's1', title_ar: 'أ', rules: {} }, { key: 's2', title_ar: 'ب', rules: {} }];
    const reqs = [{ code: 'A', stage_key: 's1', required: true }, { code: 'E', stage_key: 's1', required: true, kind: 'workshop', config: { each: true } }, { code: 'B', stage_key: 's2', required: true }];
    expect(hideBreaksStage(st, reqs, ['A']).map((s) => s.key)).toEqual(['s1']);
    expect(hideBreaksStage(st, reqs, ['E'])).toEqual([]);
  });
});
