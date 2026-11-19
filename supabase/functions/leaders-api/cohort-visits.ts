// ════════════════════════════════════════════════════════════════
// وقت آخر زيارة المدير للدفعة (تصور تشغيل الدفعة 2026-11-19، المرحلة 3، القرار 12): لكل مدير ولكل دفعة، على الخادم
// ════════════════════════════════════════════════════════════════
// جدول leaders.admin_cohort_visits (الترحيل 20261119120000). القاعدة في cohort-changes.js (visitSince وvisitAdvance وvisitRead):
// القراءة لا تقدّم شيئًا، والتقدم بعد أن يُعرض شريط «منذ آخر زيارة» فعلًا (admin.cohort-visit من الشريط نفسه)، وما عُرض في
// الزيارة الجارية يبقى معروضًا حتى تنقطع نصف ساعة، و«اعتبرها مقروءة» تقدّم «منذ» إلى لحظة القراءة المعروضة.
// قبل الترحيل: stored false، فتعرض اللوحة النافذة الافتراضية بجملة واضحة، ولا خطأ في القراءة ولا في الحفظ.
// علامة قراءة للمدير نفسه لا كتابة في بيانات المنصة: متاحة لكل حساب إدارة بما فيه المطّلع، وبلا العامل الثاني.
import { db, Fail } from './core.ts';
import type { Admin } from './admin.ts';
import { visitAdvance, visitRead, visitSince } from './cohort-changes.js';

type Body = Record<string, any>;
const who = (a: Admin) => String(a.email || '').trim().toLowerCase();
const COLS = 'since_at, seen_at, touched_at';

async function rowOf(a: Admin, cohortId: string) {
  const { data, error } = await db.from('admin_cohort_visits').select(COLS).eq('admin_email', who(a)).eq('cohort_id', cohortId).maybeSingle();
  // أي تعذّر (الجدول لم يُرحَّل، أو عطل عابر) يُقرأ «غير محفوظ»: الشريط يعرض النافذة الافتراضية ولا يسقط التبويب
  if (error) return { stored: false as const, row: null };
  return { stored: true as const, row: data as any };
}

/** ما يُعرض منذه لهذا المدير الآن: { stored, since, first } */
export async function visitFor(a: Admin, cohortId: string, now = Date.now()) {
  const { stored, row } = await rowOf(a, cohortId);
  if (!stored) return { stored: false, since: null, first: false };
  return { stored: true, since: visitSince(row, now), first: !row };
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
  const { stored, row } = await rowOf(a, cohortId);
  if (!stored) return { success: true, stored: false, since: null };
  const next = b.op === 'read' ? visitRead(row, at, now) : visitAdvance(row, at, now);
  const { error } = await db.from('admin_cohort_visits').upsert({ admin_email: who(a), cohort_id: cohortId, ...next }, { onConflict: 'admin_email,cohort_id' });
  // تعذّر الحفظ لا يُسقط الشاشة: الشريط معروض، ويُعاد في العرض التالي
  if (error) { console.error('cohort visit:', error.message || error); return { success: true, stored: false, since: null }; }
  return { success: true, stored: true, since: visitSince(next, now) };
}
