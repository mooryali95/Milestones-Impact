// التذكير الموحد (P3): المحرك يبني التذكير من الرحلة نفسها، والحد مشترك بين كل المرسلين، والأثر يُقاس من اللقطة
import { describe, expect, it } from 'vitest';
import { gate, groupPreview, lastLine, ledgerSummary, NUDGE_GAP_DAYS, nudgeFor, outcomeOf, stageText } from '../../supabase/functions/leaders-api/nudge.js';
import { onboardingOf } from '../../supabase/functions/leaders-api/onboarding.js';
import { readFileSync } from 'node:fs';

const NOW = '2026-11-16T10:00:00Z';
const ago = (d) => new Date(Date.parse(NOW) - d * 864e5).toISOString();
const person = (o = {}) => ({ id: 'p1', full_name: 'سارة', email: 's@x.com', status: 'enrolled', created_at: ago(60), ...o });
const journey = (o = {}) => [
  { key: 'onboard', title_ar: 'التهيئة', status: 'done', items: [{ id: 'a', title_ar: 'الملف', status: 'done', required: true, completed_at: ago(20) }] },
  { key: 'training', title_ar: 'التدريب', status: 'active', items: [
    { id: 'b', title_ar: 'حضور الورشة', status: 'done', required: true, completed_at: ago(12) },
    { id: 'c', title_ar: 'خطة المبادرة', status: o.returned ? 'returned' : 'pending', required: true, note: o.returned ? 'أضف المؤشرات' : null },
  ] },
  { key: 'capstone', title_ar: 'المبادرة', status: 'locked', items: [] },
];

describe('المحرك: التذكير من الرحلة نفسها', () => {
  it('في البرنامج: المرحلة وخطوتها التالية بالاسم والتقدم ومدة التوقف', () => {
    const n = nudgeFor({ p: person(), journey: journey(), progress: 40, now: NOW });
    expect(n).toMatchObject({ ok: true, kind: 'stage', key: 'stage:training', stage: 'التدريب', step: 'خطة المبادرة', progress: 40, days: 20 });
    expect(n.subject).toBe('خطوتك التالية في «التدريب»');
    expect(n.text).toContain('أنت في مرحلة «التدريب»، وقطعت 40% من رحلتك.');
    expect(n.text).toContain('خطوتك التالية: خطة المبادرة.');
    expect(n.snapshot).toEqual({ key: 'stage:training', done: 1, progress: 40 });
  });
  it('ما أُعيد بملاحظة يتقدم على غيره، ونصه يذكر الملاحظة', () => {
    const n = nudgeFor({ p: person(), journey: journey({ returned: true }), progress: 40, now: NOW });
    expect(n).toMatchObject({ ok: true, kind: 'returned', step: 'خطة المبادرة' });
    expect(n.text).toContain('«أضف المؤشرات»');
  });
  it('قبل الاعتماد: نص التسجيل والقياس نفسه (onboarding.js)', () => {
    const p = person({ status: 'assessing', phone: '05', job_title: 'م', organization_name: 'ج', years_experience: 5 });
    const o = onboardingOf(p, { id: 'x', status: 'in_progress', answered: 42, total: 63, started_at: ago(5) });
    const n = nudgeFor({ p, onboarding: o, now: NOW });
    expect(n).toMatchObject({ ok: true, kind: 'onboarding', key: 'onboarding:assessment_doing', progress: 67 });
    expect(n.text).toContain('أجبت 42 من 63');
  });
  it('لا يُذكَّر من لا خطوة منه: المنسحب والتجريبي ومنتظر الاعتماد ومن أتم ومن مرحلته مقفلة', () => {
    expect(nudgeFor({ p: person({ status: 'withdrawn' }) }).why).toBe('out');
    expect(nudgeFor({ p: person({ is_demo: true }) }).why).toBe('demo');
    expect(nudgeFor({ p: person({ email: '' }) }).why).toBe('no_email');
    expect(nudgeFor({ p: person({ status: 'pending_approval' }) }).why).toBe('approval');
    expect(nudgeFor({ p: person({ status: 'completed' }) }).why).toBe('finished');
    const done = journey().map((s) => ({ ...s, status: 'done' }));
    expect(nudgeFor({ p: person(), journey: done, now: NOW }).why).toBe('finished');
    const locked = [{ key: 'x', title_ar: 'س', status: 'locked', items: [] }];
    expect(nudgeFor({ p: person(), journey: locked, now: NOW }).why).toBe('locked');
  });
  it('النص يتدرج بطول التوقف تحفيزًا لا لومًا', () => {
    expect(stageText({ stage: 'س', need: 'ص', progress: 10, days: 2 })).toContain('أنت على الطريق الصحيح');
    expect(stageText({ stage: 'س', need: 'ص', progress: 10, days: 9 })).toContain('بضع دقائق اليوم');
    expect(stageText({ stage: 'س', need: 'ص', progress: 10, days: 30 })).toContain('مضى على توقفك 30 يومًا');
  });
});

describe('الحد المشترك بين كل المرسلين', () => {
  it(`لا تذكير خلال ${NUDGE_GAP_DAYS} أيام من آخر تذكير من أي مرسل، ويُعرض من ذكّر ومتى`, () => {
    const g = gate({ sender: 'mentor', sender_label: 'المرشد', created_at: ago(2) }, NOW);
    expect(g).toMatchObject({ ok: false, why: 'recent', last: { by: 'المرشد', days: 2 } });
    expect(lastLine(g.last)).toBe('ذكّره المرشد قبل يومين');
    expect(gate({ sender: 'admin', created_at: ago(NUDGE_GAP_DAYS) }, NOW).ok).toBe(true);
    expect(gate(null, NOW)).toEqual({ ok: true });
  });
});

describe('الأثر من لقطة الإرسال', () => {
  const sent = (d, snap) => ({ id: `n${d}`, sender: 'admin', created_at: ago(d), snapshot: snap });
  it('تقدّم إن انتقل أو أنجز، وينتظر أسبوعًا، ثم بلا أثر', () => {
    const now = nudgeFor({ p: person(), journey: journey(), progress: 40, now: NOW });
    expect(outcomeOf(sent(3, { key: 'stage:onboard', done: 0 }), now, NOW)).toBe('progressed');
    expect(outcomeOf(sent(3, { key: 'stage:training', done: 0, progress: 30 }), now, NOW)).toBe('progressed');
    expect(outcomeOf(sent(3, { key: 'stage:training', done: 1, progress: 40 }), now, NOW)).toBe('waiting');
    expect(outcomeOf(sent(9, { key: 'stage:training', done: 1, progress: 40 }), now, NOW)).toBe('none');
    expect(outcomeOf(sent(9, { key: 'onboarding:profile' }), { ok: false, why: 'approval' }, NOW)).toBe('progressed');
  });
  it('الملخص: الأقدم يُقاس بما تلاه، والأحدث بحاله الآن', () => {
    const now = nudgeFor({ p: person(), journey: journey(), progress: 40, now: NOW });
    const s = ledgerSummary([
      sent(2, { key: 'stage:training', done: 1, progress: 40 }),
      sent(10, { key: 'stage:training', done: 0, progress: 30 }),
      sent(20, { key: 'stage:training', done: 0, progress: 30 }),
    ], now, NOW);
    expect(s.rows.map((r) => r.outcome)).toEqual(['waiting', 'progressed', 'none']);
    expect(s).toMatchObject({ total: 3, progressed: 1 });
  });
});

describe('المعاينة الجماعية', () => {
  it('مجمّعة بالمرحلة بنص أولهم، ومن يُتخطى بسببه', () => {
    const a = nudgeFor({ p: person(), journey: journey(), progress: 40, now: NOW });
    const r = groupPreview([
      { id: '1', name: 'أ', nudge: a }, { id: '2', name: 'ب', nudge: a },
      { id: '3', name: 'ج', nudge: { ok: false, why: 'recent' }, last: { by: 'منسق الجهة', days: 1 } },
      { id: '4', name: 'د', nudge: { ok: false, why: 'approval' } },
    ]);
    expect(r.count).toBe(2);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ stage: 'التدريب', people: [{ name: 'أ' }, { name: 'ب' }] });
    expect(r.skipped.map((x) => x.reason)).toEqual(['ذُكِّر قريبًا', 'ينتظر اعتماد الإدارة لا خطوة منه']);
  });
});

describe('مصدر واحد للتذكير', () => {
  const read = (f) => readFileSync(f, 'utf8');
  it('كل إرسال تذكير من nudges.ts وحده: الإدارة والأسبوعي، ولا نص تذكير ثانٍ', () => {
    expect(read('supabase/functions/leaders-api/admin.ts')).toContain('weeklyNudges(');
    expect(read('supabase/functions/leaders-api/nudges.ts')).toMatch(/export async function weeklyNudges[\s\S]*sendNudges\(sender/);
    expect(read('supabase/functions/leaders-api/admin.ts')).not.toMatch(/reminderMail|stuckMail/);
    expect(read('supabase/functions/leaders-api/index.ts')).toMatch(/'admin\.remind-stuck': \(a, b\) => A\.writer\(a, NU\.adminSend, b\)/);
  });
});

// ── P4: المساعد نيابة عن المرشد، ومجموعات المنسق ──
import { weeklyPlan, NUDGE_BANNER_DAYS } from '../../supabase/functions/leaders-api/nudge.js';
import { COORD_NUDGE_DAILY, COORD_NUDGE_GROUPS, inCoordGroup, isStale, PRE_BASELINE, STALE_DAYS } from '../../supabase/functions/leaders-api/coord-groups.js';
import * as coordUi from './coord.js';

describe('التذكير الأسبوعي: المساعد ينوب عن المرشد إلى أن يرد', () => {
  const m1 = { id: 'm1', name: 'خالد العمر' };
  it('من له مرشد يذكّره المساعد باسم مرشده، ومن لا مرشد له التذكير الآلي', () => {
    const plan = weeklyPlan(['a', 'b', 'c'], new Map([['a', m1], ['b', m1]]), new Set());
    expect(plan).toEqual([{ mentor: m1, ids: ['a', 'b'] }, { mentor: null, ids: ['c'] }]);
  });
  it('من ذكّره مرشده بنفسه مؤخرًا لا ينوب عنه المساعد', () => {
    const plan = weeklyPlan(['a', 'b'], new Map([['a', m1], ['b', m1]]), new Set(['a']));
    expect(plan).toEqual([{ mentor: m1, ids: ['b'] }]);
  });
});

describe('تذكير المنسق: مجموعتا «يحتاج تدخلك» من مصدر واحد مع الواجهة', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  it('الواجهة تستعمل القاعدة نفسها التي يختار بها الخادم', () => {
    expect(coordUi.PRE_BASELINE).toBe(PRE_BASELINE);
    expect(coordUi.isStale).toBe(isStale);
    expect(coordUi.STALE_DAYS).toBe(STALE_DAYS);
  });
  it('لم يكمل القياس، والمتوقف أسبوعين ممن لم يخرج', () => {
    expect(inCoordGroup({ status: 'profiled' }, 'baseline', now)).toBe(true);
    expect(inCoordGroup({ status: 'enrolled' }, 'baseline', now)).toBe(false);
    expect(inCoordGroup({ status: 'enrolled', last_login_at: '2026-10-20T00:00:00Z' }, 'stale', now)).toBe(true);
    expect(inCoordGroup({ status: 'withdrawn', last_login_at: '2026-10-20T00:00:00Z' }, 'stale', now)).toBe(false);
    expect(inCoordGroup({ status: 'enrolled', last_login_at: '2026-11-10T00:00:00Z' }, 'stale', now)).toBe(false);
    expect(inCoordGroup({ status: 'profiled' }, 'other', now)).toBe(false);
    expect(Object.keys(COORD_NUDGE_GROUPS)).toEqual(['baseline', 'stale']);
    expect(COORD_NUDGE_DAILY).toBeGreaterThan(0);
    expect(NUDGE_BANNER_DAYS).toBe(14);
  });
});

describe('الحراسة على الخادم', () => {
  const read = (f) => readFileSync(f, 'utf8');
  const nu = read('supabase/functions/leaders-api/nudges.ts');
  it('المرشد يذكّر من يرشدهم وحدهم: إسناد mentor مقبول باسمه', () => {
    expect(nu).toMatch(/async function assignedMentees[\s\S]{0,300}\.eq\('expert_id', e\.id\)\.eq\('role', 'mentor'\)\.eq\('status', 'accepted'\)/);
    expect(nu).toMatch(/if \(!ok\.length\) throw new Fail\('تذكّر من ترشدهم وحدهم', 403/);
  });
  it('المنسق: الخادم يختار من مشاركي جهته وحدها، والإيقاف بيد الإدارة، والحد اليومي للجهة', () => {
    expect(nu).toMatch(/from\('participants'\)\.select\('id, status, last_login_at, is_demo'\)\.eq\('organization_id', org\.id\)/);
    expect(nu).toMatch(/if \(org\.coord_nudges === false\) throw new Fail/);
    expect(nu).toMatch(/eq\('sender', 'coordinator'\)\.eq\('sender_ref', orgId\)/);
    expect(nu).toMatch(/if \(!perms\.list\) throw new Fail/);
    expect(nu).toMatch(/group === 'stale' && !perms\.activity/);
    // المعاينة للمنسق بلا أسماء ولا نص
    const prev = nu.slice(nu.indexOf('export async function coordPreview'), nu.indexOf('export async function coordSend'));
    expect(prev).not.toMatch(/sample|\.text\b|full_name|people:|\.name\b(?!,)|x\.name/);
    expect(prev).toMatch(/stages: \[\.\.\.stages\]\.map\(\(\[stage, n\]\) => \(\{ stage, n \}\)\)/);
  });
});
