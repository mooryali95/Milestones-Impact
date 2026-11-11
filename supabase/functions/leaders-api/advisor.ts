// ════════════════════════════════════════════════════════════════
// المستشار الأساسي: يصله ما يسلّمه مشاركو دفعته، ويقيّمه من بوابة الخبير
// ════════════════════════════════════════════════════════════════
// المصدر: cohorts.advisor_expert_id للدفعة، وcohort_groups.advisor_expert_id لمجموعة داخلها (الأخص يغلب).
// الدفعة تُعرف من المشارك (cohortOf)، فتغيير المستشار
// ينقل إليه المعلّق فورًا. الإدارة ترى كل شيء وتقيّم أيضًا (reviewed_by يسجّل من قيّم).
import { esc, mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { all, db, Fail, sendMail } from './core.ts';
import { cohortOf } from './programs.ts';
import { reviewSubmissionBy } from './admin.ts';
import { firstName } from './hall.js';
import { advisedParticipantIds, advisorCohortParticipantIds, effectiveAdvisorId } from './logic.js';

type Body = Record<string, any>;

// خبير مجموعة المشارك في دفعته، إن عُيّن (العمود مطبّق منذ 2026-11-10). خطأ القراءة يوقف الطلب ولا يُفترض مستشار
// الدفعة بدله: من يقيّم المشارك قرار صلاحية، فلا يُحسم بتخمين
async function groupAdvisorId(cohortId: string | null | undefined, participantId: string | null | undefined): Promise<string | null> {
  if (!cohortId || !participantId) return null;
  const { data, error } = await db.from('cohort_group_members').select('cohort_groups(advisor_expert_id)').eq('cohort_id', cohortId).eq('participant_id', participantId).maybeSingle();
  if (error) throw new Fail('تعذّر تحديد مستشار المشارك الآن، حاول بعد قليل', 503, 'busy');
  return (data as any)?.cohort_groups?.advisor_expert_id || null;
}

// المستشار الفعلي للمشارك (effectiveAdvisorId): خبير مجموعته إن عُيّن وكان معتمدًا، وإلا مستشار دفعته الأساسي
export async function advisorOf(p: { id: string; organization_id?: string | null }) {
  const { cohort } = await cohortOf(p);
  const c: any = cohort;
  const ids = { group: await groupAdvisorId(c?.id, p.id), cohort: c?.advisor_expert_id || null };
  const want = [ids.group, ids.cohort].filter(Boolean) as string[];
  if (!want.length) return null;
  const { data } = await db.from('experts').select('id, full_name, email, status').in('id', want);
  const approved = (data || []).filter((e: any) => ['active', 'paused'].includes(e.status));
  const id = effectiveAdvisorId(ids, approved.map((e: any) => e.id));
  return approved.find((e: any) => e.id === id) || null;
}

// بريد للمستشار عند كل تسليم (والإدارة تراه في قائمتها كما هي)
export async function notifyAdvisor(p: any, what: string) {
  const adv = await advisorOf(p);
  if (!adv) return;
  await sendMail(adv.email, `تسليم جديد بانتظار تقييمك: ${what}`, mailShell(`أهلًا ${firstName(adv.full_name)}`,
    mailText(`سلّم ${esc(p.full_name)} «${esc(what)}»، وهو بانتظار تقييمك بصفتك مستشاره.`)
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
  // ليس مستشار دفعة: قد يكون خبير مجموعة في دفعة غيره
  if (!cohorts?.length) return groupScoped(expertId, [], []);
  // من لم يُسجَّل في دفعة صراحةً ينتمي لدفعة جهته أو للمفتوحة (cohortOf). كان يُتحقق لكل مرشح بقراءتين متتابعتين
  // (2N رحلة في كل تحميل للوحة الخبير وكل إجراء فيها)؛ الآن ثلاث قراءات بصفحات، والقاعدة نفسها في الذاكرة
  const orgs = [...new Set(cohorts.map((c: any) => c.organization_id).filter(Boolean))] as string[];
  const open = cohorts.some((c: any) => !c.organization_id && c.is_default);
  const msg = 'تعذّر قراءة مشاركي دفعاتك الآن، حاول بعد قليل';
  const [allCohorts, enrollments, candidates] = await Promise.all([
    all((f, t) => db.from('cohorts').select('*').order('id').range(f, t), msg),
    all((f, t) => db.from('enrollments').select('participant_id, cohort_id, status, created_at').order('id').range(f, t), msg),
    open || orgs.length
      ? all((f, t) => { const q = db.from('participants').select('id, organization_id').eq('is_demo', false); return (open ? q : q.in('organization_id', orgs)).order('id').range(f, t); }, msg)
      : Promise.resolve([] as any[]),
  ]);
  const ids = advisorCohortParticipantIds(cohorts, allCohorts, enrollments, candidates);
  return groupScoped(expertId, ids, cohorts.map((c: any) => c.id));
}

// يطبّق خبير المجموعة على قائمة مشاركي دفعاته: يخرج من له خبير مجموعة معتمد غيره، ويضيف أعضاء مجموعاته هو.
// خطأ القراءة يوقف الطلب: إعادة القائمة كما هي كانت توسّع صلاحية الخبير على أعضاء مجموعات لغيره.
async function groupScoped(expertId: string, cohortIds: string[], myCohorts: string[]) {
  const [mine, inMyCohorts] = await Promise.all([
    db.from('cohort_groups').select('id, advisor_expert_id').eq('advisor_expert_id', expertId),
    myCohorts.length ? db.from('cohort_groups').select('id, advisor_expert_id').in('cohort_id', myCohorts).not('advisor_expert_id', 'is', null) : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (mine.error || inMyCohorts.error) throw new Fail('تعذّر قراءة مجموعاتك الآن، حاول بعد قليل', 503, 'busy');
  const groups = new Map<string, string>();
  for (const g of [...(mine.data || []), ...(inMyCohorts.data || [])]) groups.set(g.id, g.advisor_expert_id);
  if (!groups.size) return cohortIds;
  const [{ data: links }, { data: ex }] = await Promise.all([
    db.from('cohort_group_members').select('participant_id, group_id').in('group_id', [...groups.keys()]),
    db.from('experts').select('id, status').in('id', [...new Set(groups.values())]),
  ]);
  const approved = (ex || []).filter((e: any) => ['active', 'paused'].includes(e.status)).map((e: any) => e.id);
  return advisedParticipantIds(expertId, cohortIds, (links || []).map((l: any) => ({ participant_id: l.participant_id, advisor_expert_id: groups.get(l.group_id) || null })), approved);
}

export async function reviews(e: any) {
  const ids = await myParticipantIds(e.id);
  if (!ids.length) return { success: true, items: [], advisor: false };
  // كان الاستعلام يطلب learning_models.rubric، وهو عمود لا وجود له، فيفشل ويُبتلع خطؤه وتظهر القائمة فارغة دائمًا:
  // المستشار لا يرى ما ينتظر تقييمه. المعيار من labels.js (RUBRIC_SCALE) لا من القاعدة. وخطأ القراءة يُقال ولا يُبتلع.
  const { data, error } = await db.from('model_submissions')
    .select('id, status, submitted_at, reviewed_at, reviewed_by, rating, feedback_ar, answers, participant_id, participants(full_name, organization_name), learning_models(key, title_ar, fields)')
    .in('participant_id', ids).in('status', ['submitted', 'reviewed', 'returned']).order('submitted_at', { ascending: false }).limit(200);
  if (error) throw new Fail('تعذّر قراءة ما ينتظر تقييمك الآن، حاول بعد قليل', 503, 'busy');
  return { success: true, advisor: true, items: data || [] };
}

export async function review(e: any, b: Body) {
  const { data: s } = await db.from('model_submissions').select('id, participant_id, participants(id, organization_id)').eq('id', String(b.id || '')).maybeSingle();
  if (!s) throw new Fail('التسليم غير موجود', 404);
  const adv = await advisorOf((s as any).participants);
  if (adv?.id !== e.id) throw new Fail('هذا التسليم ليس من دفعتك', 403);
  return reviewSubmissionBy(e.email, 'system', b);
}
