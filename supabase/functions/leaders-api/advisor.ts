// ════════════════════════════════════════════════════════════════
// المستشار الأساسي: يصله ما يسلّمه مشاركو دفعته، ويقيّمه من بوابة الخبير
// ════════════════════════════════════════════════════════════════
// المصدر الواحد: cohorts.advisor_expert_id. الدفعة تُعرف من المشارك (cohortOf)، فتغيير المستشار
// ينقل إليه المعلّق فورًا. الإدارة ترى كل شيء وتقيّم أيضًا (reviewed_by يسجّل من قيّم).
import { esc, mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { db, Fail, sendMail } from './core.ts';
import { cohortOf } from './programs.ts';
import { reviewSubmissionBy } from './admin.ts';
import { firstName } from './hall.js';

type Body = Record<string, any>;

export async function advisorOf(p: { id: string; organization_id?: string | null }) {
  const { cohort } = await cohortOf(p);
  const id = (cohort as any)?.advisor_expert_id;
  if (!id) return null;
  const { data } = await db.from('experts').select('id, full_name, email, status').eq('id', id).maybeSingle();
  return data && ['active', 'paused'].includes(data.status) ? data : null;
}

// بريد للمستشار عند كل تسليم (والإدارة تراه في قائمتها كما هي)
export async function notifyAdvisor(p: any, what: string) {
  const adv = await advisorOf(p);
  if (!adv) return;
  await sendMail(adv.email, `تسليم جديد بانتظار تقييمك: ${what}`, mailShell(`أهلًا ${firstName(adv.full_name)}`,
    mailText(`سلّم ${esc(p.full_name)} «${esc(what)}»، وهو بانتظار تقييمك بصفتك المستشار الأساسي لدفعته.`)
    + mailButton(`${SITES.leaders}/x`, 'افتح لوحة الخبير'))).catch(() => {});
}

// دفعات هذا الخبير بصفته مستشارها الأساسي
export async function advisorCohorts(expertId: string) {
  // كل الأعمدة (لا قائمة صريحة) حتى لا يُفشل عمود لم يُرحَّل بعد القراءة
  const { data } = await db.from('cohorts').select('*').eq('advisor_expert_id', expertId);
  return data || [];
}

// مشاركو الدفعات التي هو مستشارها
export async function myParticipantIds(expertId: string) {
  const { data: cohorts } = await db.from('cohorts').select('id, organization_id, is_default').eq('advisor_expert_id', expertId);
  if (!cohorts?.length) return [];
  const ids = new Set<string>();
  for (const c of cohorts) {
    const { data: enr } = await db.from('enrollments').select('participant_id').eq('cohort_id', c.id);
    (enr || []).forEach((x: any) => ids.add(x.participant_id));
    // من لم يُسجَّل في دفعة صراحةً ينتمي لدفعة جهته أو للمفتوحة (cohortOf)؛ نتحقق لكل مرشح بالمصدر نفسه
    const base = c.organization_id
      ? await db.from('participants').select('id, organization_id').eq('organization_id', c.organization_id).eq('is_demo', false)
      : c.is_default ? await db.from('participants').select('id, organization_id').eq('is_demo', false) : { data: [] as any[] };
    for (const p of (base.data || [])) {
      if (ids.has(p.id)) continue;
      const { cohort } = await cohortOf(p);
      if ((cohort as any)?.id === c.id) ids.add(p.id);
    }
  }
  return [...ids];
}

export async function reviews(e: any) {
  const ids = await myParticipantIds(e.id);
  if (!ids.length) return { success: true, items: [], advisor: false };
  const { data } = await db.from('model_submissions')
    .select('id, status, submitted_at, reviewed_at, reviewed_by, rating, feedback_ar, answers, participant_id, participants(full_name, organization_name), learning_models(title_ar, fields, rubric)')
    .in('participant_id', ids).in('status', ['submitted', 'reviewed', 'returned']).order('submitted_at', { ascending: false }).limit(200);
  return { success: true, advisor: true, items: data || [] };
}

export async function review(e: any, b: Body) {
  const { data: s } = await db.from('model_submissions').select('id, participant_id, participants(id, organization_id)').eq('id', String(b.id || '')).maybeSingle();
  if (!s) throw new Fail('التسليم غير موجود', 404);
  const adv = await advisorOf((s as any).participants);
  if (adv?.id !== e.id) throw new Fail('هذا التسليم ليس من دفعتك', 403);
  return reviewSubmissionBy(e.email, 'system', b);
}
