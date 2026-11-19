// ════════════════════════════════════════════════════════════════
// مكتب اليوم، المرحلة 3ب (admin.today): التنبيهات ونبض الدفعات، قراءة فقط والحساب في today-desk.js
// ════════════════════════════════════════════════════════════════
// قراءات متوازية من مصادرها القائمة نفسها (admin.orgs وadmin.programs وadmin.inbox وحِمل الخبراء)، وتعذّر مصدر لا يُسقط
// الرد: يُسمّى في skipped ويُبنى الباقي (كالصندوق). لا كتابة ولا ترحيل.
import { db, must } from './core.ts';
import { inbox, orgs } from './admin.ts';
import { list as programsList } from './programs.ts';
import { expertLoadNow } from './insight.ts';
import { deskOf } from './today-desk.js';
import { latestSnapshots } from './cohort-pulse.ts';

type Body = Record<string, any>;

// جلسات التوجيه المحجوزة الجارية أو القادمة (لم تنتهِ بعد)، إلى سنة قادمة تكفي سطر «أقربها». الورش من قراءة
// admin.programs نفسها (desk.workshops)، وعضوية الدفعات منها كذلك (desk.member_of بقاعدة pickCohort)، فلا تُقرأ مرتين
async function coaching() {
  const now = new Date().toISOString(), until = new Date(Date.now() + 365 * 864e5).toISOString();
  return must(await db.from('coaching_sessions').select('participant_id, status, starts_at, ends_at').eq('status', 'booked')
    .or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).lte('starts_at', until).order('starts_at').limit(5000)) ?? [];
}

const ok = (r: any) => { if (r && r.success === false) throw new Error(r.message || 'failed'); return r; };
export const LOADERS = {
  // setups_failed: تعذّرت جاهزية دفعات الجهات (orgCohortSetups) فبند الدفعة في جاهزية الجهة لم يُفحص
  orgs: async () => { const r = ok(await orgs()); return { rows: r.orgs || [], setups_failed: !!r.setups_failed }; },
  programs: async () => { const r = ok(await programsList({}, { desk: true })); return { cohorts: r.cohorts || [], organizations: r.organizations || [], programs: r.programs || [], desk: r.desk || null }; },
  inbox: async () => ok(await inbox()),
  experts: () => expertLoadNow(),
  sessions: coaching,
  // لقطة الدفعات اليومية (cohort-pulse.ts): لتنبيه «صاروا متأخرين منذ أمس». قراءة واحدة، وقبل ترحيلها قائمة فارغة
  snapshots: () => latestSnapshots(),
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
  // الجهات: الصفوف، وتعذّر جاهزية دفعاتها مصدر فرعي يُسمّى وحده (لا «جاهزية مكتملة» وهي لم تُقرأ)
  if (src.orgs && !Array.isArray(src.orgs)) {
    if (src.orgs.setups_failed) skipped.push('org_setups');
    src.orgs = src.orgs.rows;
  }
  // العضوية والورش من رد الدفعات نفسه، وجلسات التوجيه من قراءتها. تعذّر الدفعات كلها يكفي اسمه وحده
  const desk = src.programs ? src.programs.desk ?? {} : null;
  if (desk) {
    src.members = desk.member_of ?? null;
    if (src.members == null) skipped.push('members');
    if (desk.workshops == null && !skipped.includes('sessions')) skipped.push('sessions');
  } else src.members = null;
  src.sessions = desk?.workshops != null && Array.isArray(src.sessions) ? { workshops: desk.workshops, coaching: src.sessions } : null;
  return deskOf({ ...src, skipped });
}
