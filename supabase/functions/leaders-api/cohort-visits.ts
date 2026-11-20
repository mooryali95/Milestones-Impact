// ════════════════════════════════════════════════════════════════
// وقت آخر زيارة المدير للدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 3، القرار 12): لكل مدير ولكل دفعة، على الخادم
// ════════════════════════════════════════════════════════════════
// جدول leaders.admin_cohort_visits (الترحيل 20261119120000). القاعدة في cohort-changes.js (visitSince وvisitAdvance وvisitRead):
// القراءة لا تقدّم شيئًا، والتقدم بعد أن يُعرض شريط «منذ آخر زيارة» فعلًا (admin.cohort-visit من الشريط نفسه)، وما عُرض في
// الزيارة الجارية يبقى معروضًا حتى تنقطع نصف ساعة، و«اعتبرها مقروءة» تقدّم «منذ» إلى لحظة القراءة المعروضة.
// تعذّر القراءة لا يُسقط تبويب «المتابعة»: يُسجَّل (console.error) ويُرد failed، فيقول الشريط إن وقت آخر زيارة تعذّرت قراءته
// ويعرض النافذة الافتراضية. وتعذّر الحفظ (admin.cohort-visit) يُسجَّل ويُرد خطأ صريحًا، لا نجاحًا بلا حفظ.
// علامة قراءة للمدير نفسه لا كتابة في بيانات المنصة: متاحة لكل حساب إدارة بما فيه المطّلع، وبلا العامل الثاني.
import { db, Fail } from './core.ts';
import type { Admin } from './admin.ts';
import { visitAdvance, visitRead, visitSince } from './cohort-changes.js';

type Body = Record<string, any>;
const who = (a: Admin) => String(a.email || '').trim().toLowerCase();
const COLS = 'since_at, seen_at, touched_at';

const READ_FAILED_AR = 'تعذّرت قراءة وقت آخر زيارة، أعد المحاولة';
const SAVE_FAILED_AR = 'تعذّر حفظ وقت آخر زيارة، أعد المحاولة';
const rowOf = (a: Admin, cohortId: string) => db.from('admin_cohort_visits').select(COLS).eq('admin_email', who(a)).eq('cohort_id', cohortId).maybeSingle();

/** ما يُعرض منذه لهذا المدير الآن: { since, first }، أو { failed: true, message } حين تتعذر القراءة */
export async function visitFor(a: Admin, cohortId: string, now = Date.now()) {
  const { data, error } = await rowOf(a, cohortId);
  if (error) {
    console.error('cohort visit read:', error.message || error);
    return { failed: true, message: READ_FAILED_AR, since: null, first: false, stored: false /* COMPAT_UNTIL_2026_12_04 */ };
  }
  // توافق مع نسخة اللوحة المنشورة قبل هذا التنظيف (تحديث بلا أثر): لوحة مفتوحة لحظة النشر تقرأ هذه الإشارة، فتبقى ثابتة إصدارًا واحدًا وتُحذف بعد 2026-12-04
  return { since: visitSince(data, now), first: !data, stored: true /* COMPAT_UNTIL_2026_12_04 */ };
}

// لحظة القراءة التي عُرض شريطها (at من رد admin.cohort-journey): لا تُقبل من المستقبل ولا أقدم من يوم
const DAY = 864e5;
function readAt(b: Body, now: number) {
  const t = Date.parse(String(b.at || ''));
  if (!Number.isFinite(t) || t > now + 60e3 || t < now - DAY) throw new Fail('لحظة القراءة غير صالحة، حدّث الصفحة', 400, 'bad_at');
  return new Date(Math.min(t, now)).toISOString();
}

/** admin.cohort-visit: بعد عرض الشريط (op: seen)، أو «اعتبرها مقروءة» (op: read) */
export async function adminCohortVisit(a: Admin, b: Body, now = Date.now()) {
  const cohortId = String(b.cohort_id || '');
  if (!cohortId) throw new Fail('حدد الدفعة', 400);
  const at = readAt(b, now);
  const { data: row, error: readError } = await rowOf(a, cohortId);
  if (readError) { console.error('cohort visit read:', readError.message || readError); throw new Fail(READ_FAILED_AR, 500, 'db_error'); }
  const next = b.op === 'read' ? visitRead(row, at, now) : visitAdvance(row, at, now);
  const { error } = await db.from('admin_cohort_visits').upsert({ admin_email: who(a), cohort_id: cohortId, ...next }, { onConflict: 'admin_email,cohort_id' });
  // تعذّر الحفظ لا يُسقط الشاشة (الشريط معروض، ويُعاد التقدم في العرض التالي)، لكنه يُرد خطأ: «اعتبرها مقروءة» تعرضه
  if (error) { console.error('cohort visit save:', error.message || error); throw new Fail(SAVE_FAILED_AR, 500, 'db_error'); }
  return { success: true, since: visitSince(next, now), stored: true /* COMPAT_UNTIL_2026_12_04 */ };
}
