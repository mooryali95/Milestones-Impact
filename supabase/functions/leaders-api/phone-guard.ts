// ════════════════════════════════════════════════════════════════
// حارس الهاتف عند إنشاء الحساب أو تغيير الهاتف: لا حسابان قائمان بهاتف واحد (تحليل التكرار، اعتمده المالك 2026-11-25)
// ════════════════════════════════════════════════════════════════
// الفحص قبل الكتابة يقرأ الحسابات بصيغ الرقم (phoneVariants) فيعمل قبل ترحيل 20261128180000 وبعده، والفهرس الفريد سند أخير
// يُترجم تعارضه (isPhoneConflict) إلى الرد نفسه، فلا يصل المستعمل خطأ خادم أبدًا.
import { db, Fail } from './core.ts';
import { listed } from './counting.ts';
import { holdsPhone, MAYBE_DUP_AR, maskEmail, nameKey, PHONE_KEY_MIN, phoneKey, phoneTakenAdminAr, phoneTakenAr, phoneVariants } from './phone-key.js';

export type PhoneOwner = { id: string; full_name: string | null; email: string; status: string; organization_id: string | null };

// الحساب القائم الذي يحجز الهاتف، غير exceptId. تعذّر القراءة لا يمنع التسجيل: الفهرس يحسم حينها
export async function phoneOwner(phone: unknown, exceptId: string | null = null): Promise<PhoneOwner | null> {
  const key = phoneKey(phone);
  if (key.length < PHONE_KEY_MIN) return null;
  // counting-exempt: كشف حجز الهاتف يقرأ كل حساب بصيغ الرقم، ثم يُستبعد التجريبي والموقوف والمنسحب (holdsPhone) كشرط الفهرس
  const { data, error } = await db.from('participants').select('id, full_name, email, phone, status, is_demo, organization_id').in('phone', phoneVariants(key));
  if (error) { console.error('phone owner:', error); return null; }
  return ((data || []) as any[]).find((p) => p.id !== exceptId && holdsPhone(p) && phoneKey(p.phone) === key) || null;
}

export const isPhoneConflict = (e: any) => !!e && e.code === '23505' && /participants_phone_key_uniq/.test(`${e.message || ''} ${e.details || ''}`);

// الرد الموحّد: للمشارك رسالة محايدة ببريده مقنَّعًا، وللإدارة الحساب القائم باسمه لترسل الدعوة إليه
export function participantPhoneTaken(owner: PhoneOwner | null) {
  return new Fail(owner ? phoneTakenAr(owner.email) : 'لديك حساب مسجل بهذا الهاتف، ادخل ببريدك', 409, 'phone_exists',
    owner ? { email_hint: maskEmail(owner.email) } : {});
}
export function adminPhoneTaken(owner: PhoneOwner) {
  return new Fail(phoneTakenAdminAr(owner), 409, 'phone_exists', { existing: { id: owner.id, full_name: owner.full_name, email: owner.email, status: owner.status } });
}

export async function assertPhoneFree(phone: unknown, side: 'participant' | 'admin', exceptId: string | null = null) {
  const owner = await phoneOwner(phone, exceptId);
  if (owner) throw side === 'admin' ? adminPhoneTaken(owner) : participantPhoneTaken(owner);
}

// بعد كتابة رفضها الفهرس (سباق بين الفحص والكتابة): الحساب القائم يُقرأ ليُسمّى في الرد
export async function phoneConflictFail(phone: unknown, side: 'participant' | 'admin', exceptId: string | null = null) {
  const owner = await phoneOwner(phone, exceptId);
  return side === 'admin' && owner ? adminPhoneTaken(owner) : participantPhoneTaken(owner);
}

// تحذير «قد يكون مكررًا»: أسماء مطبَّعة تطابق مشاركًا قائمًا في الجهة نفسها (أو بلا جهة إن لم تُختر). تحذير وحده، والقرار للإدارة.
// يرجع لكل مفتاح اسم الحسابات المطابقة. تعذّر القراءة لا يمنع شيئًا: لا تحذير
export async function nameLookalikes(names: string[], orgId: string | null) {
  const keys = new Set(names.map(nameKey).filter((k) => k.length >= 3));
  const out = new Map<string, { id: string; full_name: string; email: string }[]>();
  if (!keys.size) return out;
  let q: any = listed(db.from('participants').select('id, full_name, email, is_demo'));
  q = orgId ? q.eq('organization_id', orgId) : q.is('organization_id', null);
  const { data, error } = await q.limit(5000);
  if (error) { console.error('name lookalikes:', error); return out; }
  for (const p of (data || []) as any[]) {
    const k = nameKey(p.full_name);
    if (!keys.has(k)) continue;
    out.set(k, [...(out.get(k) || []), { id: p.id, full_name: p.full_name, email: p.email }]);
  }
  return out;
}

export const lookalikeNote = (matches: { full_name: string; email: string }[]) =>
  `${MAYBE_DUP_AR}: يشبه ${matches.slice(0, 2).map((m) => `${m.full_name} (${m.email})`).join('، ')}${matches.length > 2 ? ` و${matches.length - 2} غيرهما` : ''}`;
