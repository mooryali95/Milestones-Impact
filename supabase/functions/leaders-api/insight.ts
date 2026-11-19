// ════════════════════════════════════════════════════════════════
// الرؤية الشاملة للإدارة (admin.insight و admin.changes): قراءة فقط، والحساب في insight.js
// ════════════════════════════════════════════════════════════════
import { all, allFor, db, Fail, must } from './core.ts';
import { baselineProgress } from './admin.ts';
import { onboardingOf } from './onboarding.js';
import { journeyApproved, pickCohort } from './logic.js';
import { areaPrefixes, changeRow, expertLoad, pipelineBy } from './insight.js';
import { listed } from './counting.ts';
import { cohortMemberIds } from './programs.ts';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const tally = (rows: any[] | null, col: string) => {
  const m: Record<string, number> = {};
  for (const x of rows || []) if (x[col]) m[x[col]] = (m[x[col]] || 0) + 1;
  return m;
};

// حِمل خبراء الرحلة الآن (expertLoad): الطلبات المعروضة والمقبولة والجلسات القادمة مقابل ساعاتهم الأسبوعية (weekly_hours).
// القراءة الواحدة لجدول «حِمل الخبراء» في الرؤية الشاملة وتنبيه «خبير فوق طاقته» في مكتب اليوم (today-desk.ts).
// طلبات حسابات العرض وجلساتها لا تُحسب (كالصندوق)، وتعذّر أي قراءة يُفشلها كلها: لا حِمل صفريًا يُخفي خبيرًا فوق طاقته
export async function expertLoadNow() {
  const now = new Date().toISOString();
  const P = 'participants!inner(is_demo)';
  const [experts, reqs, upcoming, roles] = await Promise.all([
    // طاقة خبراء الرحلة وحدهم (journeyApproved): عضو اللجنة بلا دور لا يُحسب فيها
    db.from('experts').select('id, full_name, title, status, roles, weekly_hours').eq('status', 'active').limit(500).then((r) => ((must(r) ?? []) as any[]).filter(journeyApproved)),
    listed(db.from('expert_requests').select(`expert_id, ${P}`).in('status', ['offered', 'accepted']).not('expert_id', 'is', null), 'participants').limit(5000).then((r: any) => (must(r) ?? []) as any[]),
    listed(db.from('coaching_sessions').select(`expert_id, ${P}`).eq('status', 'booked').gte('starts_at', now).not('expert_id', 'is', null), 'participants').limit(5000).then((r: any) => (must(r) ?? []) as any[]),
    listed(db.from('expert_requests').select(`expert_id, participant_id, ${P}`).eq('status', 'accepted').not('expert_id', 'is', null), 'participants').limit(5000).then((r: any) => (must(r) ?? []) as any[]),
  ]);
  const people_by: Record<string, Set<string>> = {};
  for (const r of roles) (people_by[r.expert_id] ||= new Set()).add(r.participant_id);
  return expertLoad(experts, { requests: tally(reqs, 'expert_id'), upcoming: tally(upcoming, 'expert_id'), people: Object.fromEntries(Object.entries(people_by).map(([k, v]) => [k, v.size])) });
}

// أين توقف المشاركون (بالجهة وبالدفعة) وحِمل الخبراء. بلا حسابات العرض، وحسابات الاختبار داخلة كما في قائمة المشاركين
export async function adminInsight() {
  const people = await all((f, t) => listed(db.from('participants')
    .select('id, full_name, phone, job_title, organization_id, organization_name, years_experience, status, last_login_at')).order('id').range(f, t)) as any[];
  const ids = people.map((p) => p.id);
  const [progress, orgs, cohorts, enr, experts] = await Promise.all([
    baselineProgress(ids),
    db.from('organizations').select('id, name').then((r) => (must(r) ?? []) as any[]),
    db.from('cohorts').select('id, name, status, is_default, organization_id, starts_on, ends_on, created_at').then((r) => (must(r) ?? []) as any[]),
    all((f, t) => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('participant_id').order('cohort_id').range(f, t)) as Promise<any[]>,
    expertLoadNow(),
  ]);
  const rows = people.map((p) => ({ ...p, onboarding: onboardingOf(p, progress[p.id]?.id ? progress[p.id] : null) }));
  const orgName = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  const byP = new Map<string, any[]>();
  for (const e of enr) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  const cohortOfRow = (p: any) => pickCohort({ enrollments: byP.get(p.id) || [], cohorts, organizationId: p.organization_id || null }).cohort;
  const by_org = pipelineBy(rows, (p: any) => (p.organization_id ? { key: p.organization_id, name: orgName[p.organization_id] || p.organization_name || 'جهة' } : { key: 'none', name: 'بدون جهة' }));
  const by_cohort = pipelineBy(rows, (p: any) => { const c = cohortOfRow(p); return c ? { key: c.id, name: c.name } : { key: 'none', name: 'بلا دفعة' }; });
  const meta = Object.fromEntries(cohorts.map((c) => [c.id, { status: c.status, starts_on: c.starts_on, ends_on: c.ends_on, is_default: !!c.is_default, org: c.organization_id ? orgName[c.organization_id] || null : null }]));
  return {
    success: true, by_org, by_cohort: { ...by_cohort, groups: by_cohort.groups.map((g: any) => ({ ...g, ...(meta[g.key] || {}) })) },
    experts,
  };
}

// ماذا تغيّر: آخر أحداث سجل التدقيق كله، الأحدث أولًا، بصفحات (before = created_at لآخر صف وصل)
const CHANGES_PAGE = 100;
const COHORT_CHUNK = 40;   // أعضاء في كل طلب: معرّفاتهم وبُرُدهم في شرط واحد، فلا يتجاوز الرابط حده
const quoted = (v: string) => `"${String(v).replace(/[\\"]/g, '\\$&')}"`;
export async function adminChanges(b: Body = {}) {
  const base = () => {
    let q = db.from('audit_log').select('id, actor_type, actor, action, entity, entity_id, after, created_at').order('created_at', { ascending: false }).limit(CHANGES_PAGE + 1);
    if (b.before) q = q.lt('created_at', String(b.before));
    if (['admin', 'participant', 'system', 'coordinator', 'expert'].includes(b.actor_type)) q = q.eq('actor_type', b.actor_type);
    if (b.area && /^[a-z_]{2,30}$/.test(String(b.area))) {
      const prefixes = areaPrefixes(String(b.area));
      q = prefixes.length === 1 ? q.like('action', `${prefixes[0]}.%`) : q.or(prefixes.map((x: string) => `action.like.${x}.%`).join(','));
    }
    if (Number(b.days) > 0) q = q.gte('created_at', new Date(Date.now() - Math.min(365, Number(b.days)) * 864e5).toISOString());
    return q;
  };
  let got: any[];
  if (b.cohort_id) {
    // فلتر الدفعة (تصور تشغيل الدفعة 2026-11-19، 4.6): ما جرى على أعضائها (entity_id) وما فعلوه هم (actor بمعرّف المشارك أو بريده،
    // كما يكتبهما السجل)، وما جرى على الدفعة نفسها وجلسات ورشها. الأعضاء بقاعدة الخريطة نفسها (cohortMemberIds)
    if (!isUuid(b.cohort_id)) throw new Fail('الدفعة غير موجودة', 404);
    const m = await cohortMemberIds(String(b.cohort_id));
    if (!m) throw new Fail('الدفعة غير موجودة', 404);
    const [people, sessions] = await Promise.all([
      // counting-exempt: بُرُد أعضاء الدفعة من cohortMemberIds (listed)، فلا يدخل فلتر الدفعة حساب العرض ولا سجله
      allFor(m.ids, () => db.from('participants').select('id, email').order('id'), 'id') as Promise<any[]>,
      db.from('workshop_sessions').select('id').eq('cohort_id', m.cohort.id).then((r) => (must(r) ?? []) as any[]),
    ]);
    const own = [m.cohort.id, ...sessions.map((x) => x.id)];
    const asks: (() => any)[] = [];
    for (let i = 0; i < own.length; i += 100) asks.push(() => base().in('entity_id', own.slice(i, i + 100)));
    for (let i = 0; i < people.length; i += COHORT_CHUNK) {
      const part = people.slice(i, i + COHORT_CHUNK);
      const ids = part.map((p) => p.id).join(',');
      const actors = [...part.map((p) => p.id), ...part.filter((p) => p.email).map((p) => quoted(p.email))].join(',');
      asks.push(() => base().or(`entity_id.in.(${ids}),actor.in.(${actors})`));
    }
    // كل طلب يعيد أحدث صفحته، فأحدث مئة من مجموعها هي أحدث مئة للدفعة
    const seen = new Map<string, any>();
    for (let i = 0; i < asks.length; i += 6) {
      for (const rows of await Promise.all(asks.slice(i, i + 6).map((f) => f().then((r: any) => (must(r) ?? []) as any[])))) for (const h of rows) seen.set(String(h.id), h);
    }
    got = [...seen.values()].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at) || String(y.created_at).localeCompare(String(x.created_at)));
  } else got = (must(await base()) ?? []) as any[];
  const page = got.slice(0, CHANGES_PAGE);
  const pids = [...new Set(page.filter((h) => h.entity === 'participants' && isUuid(h.entity_id)).map((h) => h.entity_id))] as string[];
  const names: Record<string, string> = {};
  // counting-exempt: أسماء لسطور سجل التغييرات المعروضة، لا عدّ
  if (pids.length) for (const p of (must(await db.from('participants').select('id, full_name').in('id', pids)) ?? []) as any[]) names[p.id] = p.full_name;
  return { success: true, changes: page.map((h) => changeRow(h, names)), more: got.length > CHANGES_PAGE, next: page.length ? page[page.length - 1].created_at : null };
}
