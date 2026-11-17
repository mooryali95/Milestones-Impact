// ════════════════════════════════════════════════════════════════
// مكتب اليوم، المرحلة 3ب (admin.today): التنبيهات ونبض الدفعات، قراءة فقط والحساب في today-desk.js
// ════════════════════════════════════════════════════════════════
// قراءات متوازية من مصادرها القائمة نفسها (admin.orgs وadmin.programs وadmin.inbox وحِمل الخبراء)، وتعذّر مصدر لا يُسقط
// الرد: يُسمّى في skipped ويُبنى الباقي (كالصندوق). لا كتابة ولا ترحيل.
import { all, db, must } from './core.ts';
import { inbox, orgs } from './admin.ts';
import { list as programsList } from './programs.ts';
import { expertLoadNow } from './insight.ts';
import { pickCohort } from './logic.js';
import { deskOf } from './today-desk.js';

type Body = Record<string, any>;

// دفعة كل مشارك بقاعدة pickCohort نفسها (العضوية التي تعدّها قائمة الدفعات والمجموعات)، بلا حسابات العرض كالصندوق
async function members() {
  const [people, enr, cohorts] = await Promise.all([
    all((f, t) => db.from('participants').select('id, organization_id').eq('is_demo', false).order('id').range(f, t)) as Promise<any[]>,
    all((f, t) => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('participant_id').order('cohort_id').range(f, t)) as Promise<any[]>,
    db.from('cohorts').select('*').then((r: any) => (must(r) ?? []) as any[]),
  ]);
  const byP = new Map<string, any[]>();
  for (const e of enr) { if (!byP.has(e.participant_id)) byP.set(e.participant_id, []); byP.get(e.participant_id)!.push(e); }
  return Object.fromEntries(people.map((p) => [p.id, pickCohort({ enrollments: byP.get(p.id) || [], cohorts, organizationId: p.organization_id || null }).cohort?.id || null]));
}

// الجلسات المؤرخة القادمة (والجارية الآن): الورش الفعّالة، وجلسات الكوتشينغ المحجوزة
async function sessions() {
  const since = new Date(Date.now() - 864e5).toISOString();
  const [w, c] = await Promise.all([
    db.from('workshop_sessions').select('cohort_id, active, starts_at, ends_at').eq('active', true).gte('starts_at', since).order('starts_at').limit(5000),
    db.from('coaching_sessions').select('participant_id, status, starts_at, ends_at').eq('status', 'booked').gte('starts_at', since).order('starts_at').limit(5000),
  ]);
  return { workshops: must(w) ?? [], coaching: must(c) ?? [] };
}

const ok = (r: any) => { if (r && r.success === false) throw new Error(r.message || 'failed'); return r; };
export const LOADERS = {
  orgs: async () => ok(await orgs()).orgs || [],
  programs: async () => { const r = ok(await programsList()); return { cohorts: r.cohorts || [], organizations: r.organizations || [], programs: r.programs || [] }; },
  inbox: async () => ok(await inbox()),
  experts: () => expertLoadNow(),
  sessions,
  members,
};

/** @param loaders للاختبار: مصادر بديلة بالأسماء نفسها */
export async function today(_b: Body = {}, loaders: Record<string, () => Promise<any>> = LOADERS) {
  const keys = Object.keys(loaders);
  const res = await Promise.allSettled(keys.map((k) => loaders[k]()));
  const src: Record<string, any> = {}, skipped: string[] = [];
  keys.forEach((k, i) => {
    const r = res[i];
    if (r.status === 'fulfilled') src[k] = r.value;
    else { skipped.push(k); src[k] = null; console.error(`admin.today ${k}:`, (r.reason as Error)?.message || r.reason); }
  });
  return deskOf({ ...src, skipped });
}
