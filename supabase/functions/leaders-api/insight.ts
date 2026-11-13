// ════════════════════════════════════════════════════════════════
// الرؤية الشاملة للإدارة (admin.insight و admin.changes): قراءة فقط، والحساب في insight.js
// ════════════════════════════════════════════════════════════════
import { all, db, must } from './core.ts';
import { baselineProgress } from './admin.ts';
import { onboardingOf } from './onboarding.js';
import { pickCohort } from './logic.js';
import { changeRow, expertLoad, pipelineBy } from './insight.js';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));
const tally = (rows: any[] | null, col: string) => {
  const m: Record<string, number> = {};
  for (const x of rows || []) if (x[col]) m[x[col]] = (m[x[col]] || 0) + 1;
  return m;
};

// أين توقف المشاركون (بالجهة وبالدفعة) وحِمل الخبراء. بلا حسابات العرض، وحسابات الاختبار داخلة كما في قائمة المشاركين
export async function adminInsight() {
  const people = await all((f, t) => db.from('participants')
    .select('id, full_name, phone, job_title, organization_id, organization_name, years_experience, status, last_login_at')
    .eq('is_demo', false).order('id').range(f, t)) as any[];
  const ids = people.map((p) => p.id);
  const now = new Date().toISOString();
  const [progress, orgs, cohorts, enr, experts, reqs, upcoming, roles] = await Promise.all([
    baselineProgress(ids),
    db.from('organizations').select('id, name').then((r) => (must(r) ?? []) as any[]),
    db.from('cohorts').select('id, name, status, is_default, organization_id, starts_on, ends_on, created_at').then((r) => (must(r) ?? []) as any[]),
    all((f, t) => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('participant_id').order('cohort_id').range(f, t)) as Promise<any[]>,
    db.from('experts').select('id, full_name, title, roles, weekly_hours').eq('status', 'active').limit(500).then((r) => (must(r) ?? []) as any[]),
    db.from('expert_requests').select('expert_id').in('status', ['offered', 'accepted']).not('expert_id', 'is', null).limit(5000),
    db.from('coaching_sessions').select('expert_id').eq('status', 'booked').gte('starts_at', now).not('expert_id', 'is', null).limit(5000),
    db.from('expert_requests').select('expert_id, participant_id').eq('status', 'accepted').not('expert_id', 'is', null).limit(5000),
  ]);
  const rows = people.map((p) => ({ ...p, onboarding: onboardingOf(p, progress[p.id]?.id ? progress[p.id] : null) }));
  const orgName = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  const byP = new Map<string, any[]>();
  for (const e of enr) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  const cohortOfRow = (p: any) => pickCohort({ enrollments: byP.get(p.id) || [], cohorts, organizationId: p.organization_id || null }).cohort;
  const by_org = pipelineBy(rows, (p: any) => (p.organization_id ? { key: p.organization_id, name: orgName[p.organization_id] || p.organization_name || 'جهة' } : { key: 'none', name: 'بدون جهة' }));
  const by_cohort = pipelineBy(rows, (p: any) => { const c = cohortOfRow(p); return c ? { key: c.id, name: c.name } : { key: 'none', name: 'بلا دفعة' }; });
  const meta = Object.fromEntries(cohorts.map((c) => [c.id, { status: c.status, starts_on: c.starts_on, ends_on: c.ends_on, is_default: !!c.is_default, org: c.organization_id ? orgName[c.organization_id] || null : null }]));
  const people_by: Record<string, Set<string>> = {};
  for (const r of (roles.data || []) as any[]) (people_by[r.expert_id] ||= new Set()).add(r.participant_id);
  return {
    success: true, by_org, by_cohort: { ...by_cohort, groups: by_cohort.groups.map((g: any) => ({ ...g, ...(meta[g.key] || {}) })) },
    experts: expertLoad(experts, { requests: tally(reqs.data as any[], 'expert_id'), upcoming: tally(upcoming.data as any[], 'expert_id'), people: Object.fromEntries(Object.entries(people_by).map(([k, v]) => [k, v.size])) }),
  };
}

// ماذا تغيّر: آخر أحداث سجل التدقيق كله، الأحدث أولًا، بصفحات (before = created_at لآخر صف وصل)
const CHANGES_PAGE = 100;
export async function adminChanges(b: Body = {}) {
  let q = db.from('audit_log').select('id, actor_type, actor, action, entity, entity_id, after, created_at').order('created_at', { ascending: false }).limit(CHANGES_PAGE + 1);
  if (b.before) q = q.lt('created_at', String(b.before));
  if (['admin', 'participant', 'system', 'coordinator', 'expert'].includes(b.actor_type)) q = q.eq('actor_type', b.actor_type);
  if (b.area && /^[a-z_]{2,30}$/.test(String(b.area))) q = q.like('action', `${b.area}.%`);
  if (Number(b.days) > 0) q = q.gte('created_at', new Date(Date.now() - Math.min(365, Number(b.days)) * 864e5).toISOString());
  const got = (must(await q) ?? []) as any[];
  const page = got.slice(0, CHANGES_PAGE);
  const pids = [...new Set(page.filter((h) => h.entity === 'participants' && isUuid(h.entity_id)).map((h) => h.entity_id))] as string[];
  const names: Record<string, string> = {};
  if (pids.length) for (const p of (must(await db.from('participants').select('id, full_name').in('id', pids)) ?? []) as any[]) names[p.id] = p.full_name;
  return { success: true, changes: page.map((h) => changeRow(h, names)), more: got.length > CHANGES_PAGE, next: page.length ? page[page.length - 1].created_at : null };
}
