// هوية الدفعة في الإدارة: قراءتها وحفظها (cohorts.identity). الصدارة في الوثيقة للجهة، والدفعة توقيع بعدها.
// قبل الترحيل: القراءة تقول «غير متاحة» والحفظ يرد 503 برسالة، ولا يفشل شيء آخر (الوثيقة تعمل بلا هوية دفعة)
import { audit, db, Fail } from './core.ts';
import type { Admin } from './admin.ts';
import { cleanIdentity, IDENTITY_PROGRAM_MAX } from './cohort-identity.js';

type Body = Record<string, any>;
const isUuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

export async function adminGet(_a: Admin, b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('بيانات ناقصة');
  const { data, error } = await db.from('cohorts').select('id, name, identity').eq('id', String(b.cohort_id)).maybeSingle();
  if (error) return { success: true, ready: false, identity: { program: null, logo: null, color: null }, program_max: IDENTITY_PROGRAM_MAX };
  if (!data) throw new Fail('الدفعة غير موجودة', 404);
  let identity;
  try { identity = cleanIdentity((data as any).identity); } catch { identity = { program: null, logo: null, color: null }; }
  return { success: true, ready: true, identity, program_max: IDENTITY_PROGRAM_MAX };
}

export async function adminSave(a: Admin, b: Body) {
  if (!isUuid(b.cohort_id)) throw new Fail('بيانات ناقصة');
  let next;
  try { next = cleanIdentity(b.identity); } catch (e) { throw new Fail((e as Error).message); }
  const { data: before, error } = await db.from('cohorts').select('id, identity').eq('id', String(b.cohort_id)).maybeSingle();
  if (error) throw new Fail('هوية الدفعة تُحفظ بعد تطبيق ترحيلها', 503, 'not_ready');
  if (!before) throw new Fail('الدفعة غير موجودة', 404);
  const up = await db.from('cohorts').update({ identity: next, updated_at: new Date().toISOString() }).eq('id', before.id);
  if (up.error) throw new Fail('تعذّر حفظ هوية الدفعة', 500, 'db_error');
  // الشعار لا يُنسخ في السجل بكامله: يكفي أنه تغيّر
  const brief = (x: any) => ({ program: x?.program ?? null, color: x?.color ?? null, logo: x?.logo ? 'set' : null });
  await audit('admin', a.email, 'cohort.identity', 'cohorts', before.id, brief((before as any).identity), brief(next));
  return { success: true, identity: next };
}
