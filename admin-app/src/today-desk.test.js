// مكتب اليوم 3ب: التنبيهات ونبض الدفعات من مصادرها (today-desk.js في الخادم)، والمصدر المتعذر لا يصير «لا شيء»
import { describe, expect, it } from 'vitest';
import { deskOf, isRunning, nextSessionAt, UPCOMING_DAYS } from '../../supabase/functions/leaders-api/today-desk.js';
import { orgReadinessOf } from './org-hub.js';
import { cohortHub, hubSummary } from './cohort-hub.js';

const NOW = Date.parse('2026-11-17T09:00:00Z');
const inDays = (d) => new Date(NOW + d * 864e5).toISOString();
const orgFull = { id: 'o1', name: 'جهة ممتلئة', status: 'active', invite_code: 'X', seats: 10, seats_used: 10, contract_ends: '2027-12-31', logo: null, access: { state: 'active', n: 1 }, stats: { total: 10 } };
const orgReady = { id: 'o2', name: 'جهة جاهزة', status: 'active', invite_code: 'Y', seats: 50, seats_used: 3, contract_ends: '2027-12-31', logo: 'l', access: { state: 'active', n: 1 }, stats: { total: 3 } };
const program = { id: 'p1', name: 'القيادة', requirements: 4, versions: [{ id: 'v1', number: 1 }] };
const running = { id: 'c1', name: 'دفعة الخريف', status: 'running', organization_id: 'o2', program_id: 'p1', program_version_id: 'v1', starts_on: '2026-11-01', ends_on: '2027-01-31', created_at: '2026-10-01', members: 2, upcoming_sessions: 1, schedule: { s1: {} }, advisor_expert_id: 'e1', advisor_name: 'خبير' };
const quiet = { ...running, id: 'c2', name: 'دفعة بلا جلسات', organization_id: null };
const ended = { ...running, id: 'c3', name: 'دفعة انتهت', ends_on: '2026-10-01' };
const src = (over = {}) => ({
  now: NOW,
  orgs: [orgFull, orgReady, { ...orgFull, id: 'o3', status: 'paused' }],
  programs: { cohorts: [running, quiet, ended], organizations: [orgReady], programs: [program] },
  inbox: { items: [{ kind: 'approval', id: 'p1', participant_id: 'p1' }, { kind: 'capstone', id: 'p2' }, { kind: 'approval', id: 'p9', participant_id: 'p9' }, { kind: 'expert_application', id: 'x' }], skipped: [] },
  experts: [{ id: 'e1', name: 'سارة', state: 'over', demand: 5, hours: 3 }, { id: 'e2', name: 'علي', state: 'busy', demand: 2, hours: 2 }],
  sessions: { workshops: [{ cohort_id: 'c1', active: true, starts_at: inDays(3) }, { cohort_id: 'c2', active: true, starts_at: inDays(30) }, { cohort_id: 'c2', active: true, starts_at: null }], coaching: [] },
  members: { p1: 'c1', p2: 'c1', p9: 'c2' },
  skipped: [],
  ...over,
});

describe('الدفعة الجارية وأقرب جلسة', () => {
  it('جارية: بدأت ولم تنتهِ، ولا المغلقة ولا بلا بداية', () => {
    expect(isRunning(running, NOW)).toBe(true);
    expect(isRunning(ended, NOW)).toBe(false);
    expect(isRunning({ ...running, status: 'closed' }, NOW)).toBe(false);
    expect(isRunning({ ...running, starts_on: null }, NOW)).toBe(false);
    expect(isRunning({ ...running, ends_on: null }, NOW)).toBe(true);
  });
  it('أقرب جلسة: ورشة الدفعة أو العامة أو كوتشينغ أحد أعضائها، وغير المؤرخة لا تُحسب', () => {
    const at = nextSessionAt(running, { workshops: [{ cohort_id: null, starts_at: inDays(9) }, { cohort_id: 'c9', starts_at: inDays(1) }, { cohort_id: 'c1', starts_at: null }], coaching: [{ participant_id: 'p1', starts_at: inDays(5) }, { participant_id: 'zz', starts_at: inDays(2) }], members: new Set(['p1']), now: NOW });
    expect(at).toBe(inDays(5));
    expect(nextSessionAt(running, { workshops: [{ cohort_id: 'c1', active: false, starts_at: inDays(1) }], now: NOW })).toBe(null);
    expect(nextSessionAt(running, { workshops: [{ cohort_id: 'c1', starts_at: inDays(-2) }], now: NOW })).toBe(null);
  });
});

describe('التنبيهات', () => {
  it('الأربعة بأهدافها، الممتلئ أولًا، والجهة غير الفعّالة لا تُنبَّه', () => {
    const d = deskOf(src());
    expect(d.alerts.map((a) => a.kind)).toEqual(['seats_full', 'cohort_no_session', 'expert_over', 'org_readiness']);
    expect(d.alerts[0]).toMatchObject({ severity: 'bad', target: { tab: 'orgs', id: 'o1' } });
    expect(d.alerts[0].text).toContain('10 من 10');
    expect(d.alerts[1]).toMatchObject({ target: { tab: 'programs', id: 'c2' } });
    expect(d.alerts[1].text).toContain(`الـ${UPCOMING_DAYS}`);
    expect(d.alerts[2]).toMatchObject({ target: { tab: 'experts', id: 'e1' } });
    expect(d.alerts.some((a) => a.target.id === 'o3')).toBe(false);
    expect(d.unchecked).toEqual([]);
  });
  it('جاهزية الجهة بالقاعدة نفسها التي في ملف الجهة (orgReadinessOf)', () => {
    const d = deskOf(src());
    const a = d.alerts.find((x) => x.kind === 'org_readiness');
    const r = orgReadinessOf(orgFull, '2026-11-17');
    expect(r.items.filter((x) => !x.ok).map((x) => x.key)).toEqual(['contract', 'brand']);
    // بند المقاعد قاله تنبيه المقاعد، فيبقى في سطر الجاهزية ما سواه
    expect(a.text).toContain('هوية الشهادة');
    expect(a.text).not.toContain('العقد والمقاعد');
    expect(a.text).toContain('بقي بند واحد من');
    expect(d.alerts.some((x) => x.kind === 'org_readiness' && x.target.id === 'o2')).toBe(false);
  });
  it('جهة ممتلئة لا ينقصها غير المقاعد: تنبيه واحد لا اثنان', () => {
    const d = deskOf(src({ orgs: [{ ...orgFull, logo: 'l' }] }));
    expect(d.alerts.filter((a) => a.target.id === 'o1').map((a) => a.kind)).toEqual(['seats_full']);
  });
  it('المقاعد المجهولة (seats_used فارغ) لا تُنبَّه، والدفعة بصيغة الكتاب لا تلزمها جلسة', () => {
    const d = deskOf(src({ orgs: [{ ...orgFull, seats_used: null }], programs: { cohorts: [{ ...quiet, delivery: { s1: { format: 'handbook' } } }], organizations: [], programs: [program] } }));
    expect(d.alerts.some((a) => a.kind === 'seats_full' || a.kind === 'cohort_no_session')).toBe(false);
  });
  it('المصدر المتعذر: لا تنبيه منه، ونوعه «لم يُفحص» لا «لا شيء»', () => {
    const d = deskOf(src({ experts: null, sessions: null, skipped: ['experts', 'sessions'] }));
    expect(d.alerts.some((a) => a.kind === 'expert_over' || a.kind === 'cohort_no_session')).toBe(false);
    expect(d.unchecked).toEqual(['cohort_no_session', 'expert_over']);
    expect(d.skipped).toEqual(['experts', 'sessions']);
    expect(d.pulse.every((p) => p.next_at === null)).toBe(true);
  });
});

describe('نبض الدفعات', () => {
  it('سطر لكل دفعة جارية بجاهزيتها من ملف الدفعة نفسه، وأقرب جلسة، وما ينتظر قرارًا لأعضائها', () => {
    const d = deskOf(src());
    expect(d.pulse.map((p) => p.id).sort()).toEqual(['c1', 'c2']);
    const c1 = d.pulse.find((p) => p.id === 'c1');
    const hub = cohortHub({ cohort: running, cohorts: [running, quiet, ended], orgs: [orgReady], programs: [program] });
    expect(c1.readiness).toEqual({ missing: hub.missing, total: hub.items.length, summary: hubSummary(hub) });
    expect(c1).toMatchObject({ org: 'جهة جاهزة', next_at: inDays(3), waiting: 2 });
    expect(d.pulse.find((p) => p.id === 'c2')).toMatchObject({ org: null, waiting: 1, next_at: inDays(30) });
  });
  it('الصندوق أو العضوية متعذران: «ينتظر» مجهول لا صفر، والصندوق الناقص يُعلَّم', () => {
    expect(deskOf(src({ inbox: null, skipped: ['inbox'] })).pulse.every((p) => p.waiting === null)).toBe(true);
    expect(deskOf(src({ inbox: { items: [], skipped: ['model'] } })).waiting_partial).toBe(true);
    const noProg = deskOf(src({ programs: null, skipped: ['programs'] }));
    expect(noProg.pulse).toEqual([]);
    expect(noProg.pulse_known).toBe(false);
  });
});
