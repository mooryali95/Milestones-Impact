// ════════════════════════════════════════════════════════════════
// حساب واحد بأكثر من بريد (ترحيل 20261128190000، اعتمده المالك 2026-11-25)
// ════════════════════════════════════════════════════════════════
// البريد الأساسي في participants.email، والبدائل في participant_emails، والقاعدة تمنع أن يكون البريد الواحد لحسابين.
// كل بحث عن مشارك ببريده يمر من هنا: الأساسي أولًا ثم البديل، فالرمز المرسل إلى البريد البديل يُدخل صاحبه إلى حسابه نفسه.
// الرد على صفحة الدخول واحد في الحالين، فلا يُعرف منه أن للحساب بريدًا آخر.
// الربط الإداري: معاينة ثم تطبيق ببصمة المعاينة. الباقي هو الحساب الذي دخل منه صاحبه آخر مرة («من يدخل يبقى»)، والآخر يُدمج فيه
// بالدالة نفسها التي دمج بها الترحيل (merge_participants)، فكل ما يُنقل ويتعارض يُحفظ ويُرجع بـ unmerge_participants.
import { audit, db, Fail, must, sha256Hex } from './core.ts';
import { isEmail, normalizeEmail } from './logic.js';
import { PHONE_KEY_MIN, phoneKey } from './phone-key.js';
import type { Admin } from './admin.ts';

type Body = Record<string, any>;
type Q = (q: any) => any;

/** المشارك صاحب البريد، أساسيًا كان أو بديلًا. narrow: شرط إضافي على الاستعلام (listed مثلًا) */
export async function participantByEmail(email: string, cols = '*', narrow: Q = (q) => q): Promise<any | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const { data: p } = await narrow(db.from('participants').select(cols).eq('email', e)).maybeSingle();
  if (p) return p;
  const { data: alias, error } = await db.from('participant_emails').select('participant_id').eq('email', e).maybeSingle();
  if (error || !alias?.participant_id) return null;
  const { data: owner } = await narrow(db.from('participants').select(cols).eq('id', alias.participant_id)).maybeSingle();
  return owner || null;
}

/** دخول ناجح ببريد بديل يوثّقه (أول مرة) */
export async function markAliasVerified(email: string) {
  await db.from('participant_emails').update({ verified_at: new Date().toISOString() }).eq('email', normalizeEmail(email)).is('verified_at', null);
}

// ── الإدارة ──
// الصلاحية في index.ts: القراءة (admin.participant-emails) لكل مدير، والكتابة بـ A.writer
const COLS = 'id, full_name, email, phone, status, is_demo, last_login_at, created_at';
const short = (p: any) => ({ id: p.id, full_name: p.full_name, email: p.email, status: p.status, last_login_at: p.last_login_at || null });
const MERGE_ERR: Record<string, string> = {
  merge_same: 'اختر حسابًا آخر غير هذا الحساب',
  merge_demo: 'الحساب التجريبي لا يُربط',
  merge_kept_inactive: 'الحساب الذي دخل منه صاحبه آخر مرة موقوف أو منسحب. أعد تفعيله أولًا ثم اربط',
  merge_already: 'هذا الحساب مدموج في حساب آخر من قبل',
  merge_missing: 'الحساب غير موجود',
  merge_unresolved: 'تعذّر الربط: في الحساب الآخر بيانات تتعارض ولا نظير لها. راجع الفريق التقني',
  merge_certificate_conflict: 'تعذّر الربط: للحسابين شهادتان لا تُدمجان. راجع الفريق التقني',
  merge_stray: 'تعذّر الربط: بقيت صفوف للحساب الآخر لم تنتقل. راجع الفريق التقني',
};
function mergeFail(e: any): Fail {
  const key = String(e?.message || '').split(':')[0];
  return new Fail(MERGE_ERR[key] || 'تعذّر الربط الآن، حاول مرة أخرى', MERGE_ERR[key] ? 409 : 500, key || 'merge_failed');
}

export async function emailsOf(participantId: string) {
  const { data, error } = await db.from('participant_emails').select('email, verified_at, source, created_at').eq('participant_id', participantId).order('created_at');
  if (error) throw error;
  return data || [];
}

export async function adminEmails(_a: Admin, b: Body) {
  const p = must(await db.from('participants').select('id, email, email_verified_at').eq('id', String(b.participant_id || '')).maybeSingle()) as any;
  if (!p) throw new Fail('المشارك غير موجود', 404);
  return { success: true, primary: { email: p.email, verified_at: p.email_verified_at || null }, alternates: await emailsOf(p.id) };
}

// الحساب الآخر بمعرّفه أو ببريده (الأساسي أو البديل)
async function otherAccount(b: Body) {
  const raw = String(b.other || '').trim();
  if (!raw) throw new Fail('اكتب بريد الحساب الآخر أو معرّفه');
  const o = /^[0-9a-f-]{36}$/i.test(raw)
    ? must(await db.from('participants').select(COLS).eq('id', raw).maybeSingle())
    : await participantByEmail(raw, COLS);
  if (!o) throw new Fail('لا حساب بهذا البريد أو المعرّف', 404, 'not_found');
  return o as any;
}

// «من يدخل يبقى»: الأحدث دخولًا يبقى، ثم الأحدث إنشاءً (قاعدة ترحيلي 20261128170000 و20261128190000)
export function keptOf(a: any, b: any) {
  const t = (p: any) => (p.last_login_at ? Date.parse(p.last_login_at) : -Infinity);
  if (t(a) !== t(b)) return t(a) > t(b) ? [a, b] : [b, a];
  if (a.created_at !== b.created_at) return Date.parse(a.created_at) > Date.parse(b.created_at) ? [a, b] : [b, a];
  return a.id < b.id ? [a, b] : [b, a];
}

async function linkPlan(b: Body) {
  const self = must(await db.from('participants').select(COLS).eq('id', String(b.participant_id || '')).maybeSingle()) as any;
  if (!self) throw new Fail('المشارك غير موجود', 404);
  const other = await otherAccount(b);
  if (other.id === self.id) throw new Fail(MERGE_ERR.merge_same, 409, 'merge_same');
  const [kept, merged] = keptOf(self, other);
  const { data, error } = await db.rpc('merge_preview', { p_keep: kept.id, p_dup: merged.id });
  if (error) throw mergeFail(error);
  const summary = data?.summary || {};
  // البصمة من القاعدة: مفتاح كل صف سيُمس وقيمته ووقت تحديثه، لا الأعداد وحدها، فأي تغيّر بعد المعاينة يرد التطبيق
  const hash = await sha256Hex(JSON.stringify({ kept: kept.id, merged: merged.id, fingerprint: data?.fingerprint || null, summary }));
  // الهاتف نفسه دليل أن الحسابين لشخص واحد. بغيره (مختلف أو غائب) يُطلب تأكيد صريح باسم الحساب الآخر مكتوبًا
  const ka = phoneKey(self.phone), kb = phoneKey(other.phone);
  const same_phone = ka.length >= PHONE_KEY_MIN && ka === kb;
  return { kept, merged, other, summary, hash, same_phone };
}

export async function linkPreview(_a: Admin, b: Body) {
  const { kept, merged, other, summary, hash, same_phone } = await linkPlan(b);
  return { success: true, plan_hash: hash, kept: short(kept), merged: short(merged), summary, same_phone, confirm_name: same_phone ? null : other.full_name };
}

export async function linkApply(a: Admin, b: Body) {
  const { kept, merged, other, summary, hash, same_phone } = await linkPlan(b);
  if (!same_phone && (b.confirm_different !== true || String(b.confirm_name || '').trim() !== String(other.full_name || '').trim())) {
    throw new Fail('الحسابان بلا هاتف واحد. أكّد أنهما للشخص نفسه، واكتب اسم الحساب الآخر كما هو.', 409, 'confirm_different', { confirm_name: other.full_name });
  }
  if (!b.plan_hash || String(b.plan_hash) !== hash) {
    throw new Fail('تغيّر ما سينتقل منذ المعاينة. أعد المعاينة ثم اربط.', 409, 'stale', { plan_hash: hash });
  }
  const { data: mergeId, error } = await db.rpc('merge_participants', { p_keep: kept.id, p_dup: merged.id, p_actor: a.email, p_actor_type: 'admin', p_source: 'admin_link' });
  if (error) throw mergeFail(error);
  await audit('admin', a.email, 'participant.link', 'participants', kept.id, null, { kept_id: kept.id, merged_id: merged.id, merge_id: mergeId, plan_hash: hash, summary, same_phone });
  return { success: true, kept_id: kept.id, merged_id: merged.id, merge_id: mergeId };
}

export async function emailMakePrimary(a: Admin, b: Body) {
  const id = String(b.participant_id || '');
  const email = normalizeEmail(b.email);
  if (!isEmail(email)) throw new Fail('البريد غير صحيح');
  const before = must(await db.from('participants').select('email').eq('id', id).maybeSingle()) as any;
  if (!before) throw new Fail('المشارك غير موجود', 404);
  const { error } = await db.rpc('participant_email_make_primary', { p_participant: id, p_email: email });
  if (error) {
    if (/email_primary_not_alias/.test(String(error.message))) throw new Fail('هذا البريد ليس بديلًا لهذا الحساب', 409, 'not_alias');
    throw error;
  }
  await audit('admin', a.email, 'participant.email-primary', 'participants', id, { email: before.email }, { email });
  return { success: true, primary: email };
}

export async function emailRemove(a: Admin, b: Body) {
  const id = String(b.participant_id || '');
  const email = normalizeEmail(b.email);
  const { data, error } = await db.from('participant_emails').delete().eq('participant_id', id).eq('email', email).select('email');
  if (error) throw error;
  if (!data?.length) throw new Fail('هذا البريد ليس بديلًا لهذا الحساب', 404, 'not_alias');
  await audit('admin', a.email, 'participant.email-remove', 'participants', id, { email }, null);
  return { success: true };
}
