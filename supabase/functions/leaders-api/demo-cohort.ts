// ════════════════════════════════════════════════════════════════
// حساب تجريبي لكل دفعة (تصور الحساب التجريبي 2026-11-19، المرحلة 2): ما يربط الحساب بدفعته، في مكان واحد
// ════════════════════════════════════════════════════════════════
// الحساب التجريبي العام (القائم، بلا دفعة) يبقى كما هو ويعرض رحلة الدفعة المفتوحة. وحساب الدفعة صف مشارك بعلامة is_demo
// يحمل participants.demo_cohort_id، ويُنشأ عند أول فتح له من ملف دفعته. دفعته من هذا العمود وحده (cohortOf في programs.ts):
// لا صف له في enrollments ولا في مجموعة ولا فريق ولا جهة، فكل قراءة بالدفعة (الأعضاء، المقاعد، الحضور، المجموعات، النبض،
// التذكير) لا تجده أصلًا، وكل قراءة من المشاركين تستبعده بقاعدة counting.ts كما تستبعد الحساب العام.
// القيود في القاعدة (الترحيل 20261123100000): العمود لحساب تجريبي وحده، وبريده مشتق من دفعته فلا يكون للدفعة إلا حساب
// واحد (participants_email_uniq)، وبلا جهة (participants_demo_no_org)، ويُحذف بحذف دفعته.
// قبل الترحيل: لا عمود، فكل شيء كما كان بالحساب الواحد، وفتح حساب دفعة يُرد بـnot_migrated واللوحة تعرض «غير مفعّلة بعد».
import { audit, db, DEMO_MAIL_DOMAIN, Fail, must } from './core.ts';
import { missingColumn, missingTable } from './missing-column.ts';

/** بريد الحساب التجريبي: العام بلا دفعة، وحساب الدفعة بمعرّفها (القيد participants_demo_identity يفرضه) */
export const demoEmailFor = (cohortId: string | null) => `demo${cohortId ? `-${cohortId}` : ''}@${DEMO_MAIL_DOMAIN}`;
export const DEMO_COHORT_OFF_AR = 'الحساب التجريبي لكل دفعة غير مفعّل بعد: يُفعَّل بعد تحديث قاعدة البيانات. إلى ذلك الحين استعمل الحساب التجريبي العام من النظرة العامة';

// «موجود» تُحفظ ما عاشت الدالة (العمود لا يُحذف)، و«غير موجود» تُعاد قراءتها في كل طلب فيُلتقط الترحيل حين يُطبق بلا نشر.
// السؤال على demo_links.cohort_id: عموده وعمود participants.demo_cohort_id في الترحيل نفسه. تعذّر القراءة بغير «لا عمود»
// يرمي ولا يُقرأ «غير مفعّل» (خطأ عابر لا يخفي الميزة ولا يفتحها)
let ready = false;
export async function demoCohortReady(): Promise<boolean> {
  if (ready) return true;
  const r = await db.from('demo_links').select('cohort_id').limit(1);
  if (r.error && !missingColumn(r.error) && !missingTable(r.error)) must(r);
  ready = !r.error;
  return ready;
}
/** للاختبارات وحدها: يعيد السؤال من جديد */
export function resetDemoCohortReady() { ready = false; }

/** دفعة الحساب التجريبي من صفه. undefined: ليس حساب دفعة (أو العمود لم يُرحَّل)، فدفعته بالقاعدة العامة */
export const demoCohortOf = (p: { is_demo?: boolean | null; demo_cohort_id?: string | null } | null | undefined): string | null =>
  (p?.is_demo && p.demo_cohort_id ? String(p.demo_cohort_id) : null);

// هوية الجهة التي يراها الحساب (شعارها ولونها واسمها بجانب Milestone Impact): المشارك من جهته، وحساب الدفعة التجريبي من
// جهة دفعته، بلا ربطه بها (organization_id يبقى فارغًا بقيد participants_demo_no_org، فلا يدخل لوحتها ولا مقاعدها ولا بريدها)
export async function brandOrgId(p: any): Promise<string | null> {
  if (p?.organization_id) return p.organization_id;
  const cohortId = demoCohortOf(p);
  if (!cohortId) return null;
  const { data } = await db.from('cohorts').select('organization_id').eq('id', cohortId).maybeSingle();
  return (data as any)?.organization_id || null;
}

// الحساب التجريبي لا يُلحق بدفعة ولا بمجموعة (دفعته من عموده وحده): كل كاتب عضوية يرده، فلا يدخل صف له جدولًا يُعدّ بالدفعة
// ولو أُرسل معرّفه باليد. يحرسه counting_guard_test.ts لكل كتابة في جداول العضوية
export async function refuseDemo(ids: string[]) {
  if (!ids.length) return;
  const { data } = await db.from('participants').select('id').eq('is_demo', true).in('id', ids);
  if ((data || []).length) throw new Fail('الحساب التجريبي لا يُلحق بدفعة ولا بمجموعة: هو خارج كل قائمة وعدّ، ودفعته التي أُنشئ لها ثابتة', 400, 'demo');
}

// إغلاق الدفعة يحذف حسابها التجريبي (القرار 10 في التصور) ويلغي روابط تجربتها. الحذف لصف بعلامة is_demo ودفعته هذه وحده:
// الشرطان في عبارة الحذف نفسها، فلا يبلغ مشاركًا حقيقيًا ولو تغيّر ما قبلها (والقيد participants_demo_cohort_is_demo يمنع
// أن يحمل مشارك حقيقي دفعة تجريبية أصلًا). حذف الصف يحذف جلساته وكل ما عليه (on delete cascade)، وسطر في السجل بما حُذف
export async function removeCohortDemo(actor: string, cohortId: string, why: 'cohort-close' | 'reset') {
  if (!(await demoCohortReady())) return { removed: 0, links: 0 };
  const rows = (must(await db.from('participants').select('id').eq('is_demo', true).eq('demo_cohort_id', cohortId)) || []) as { id: string }[];
  for (const r of rows) {
    await db.from('certificates').delete().eq('participant_id', r.id);
    must(await db.from('participants').delete().eq('id', r.id).eq('is_demo', true).eq('demo_cohort_id', cohortId), 'تعذّر حذف الحساب التجريبي للدفعة');
  }
  let links: any[] = [];
  if (why === 'cohort-close') {
    const now = new Date().toISOString();
    links = (must(await db.from('demo_links').update({ revoked_at: now, revoked_by: actor }).eq('cohort_id', cohortId).is('revoked_at', null).select('id'), 'حُذف الحساب التجريبي وتعذّر إلغاء روابط تجربته') || []) as any[];
  }
  if (why === 'reset' || rows.length || links.length) {
    await audit('admin', actor, why === 'reset' ? 'demo.reset' : 'demo.cohort-close', why === 'reset' ? 'participants' : 'cohorts', why === 'reset' ? rows[0]?.id || 'none' : cohortId, null,
      { cohort: cohortId, removed: rows.map((r) => r.id), ...(why === 'cohort-close' ? { links: links.length } : {}) });
  }
  return { removed: rows.length, links: links.length };
}
