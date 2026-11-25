// ════════════════════════════════════════════════════════════════
// مركز رسائل المشارك: ما أُرسل إليه (وصل بالبريد أو كتمه) وتفضيلات بريده لكل فئة (ترحيل 20261128200000)
// ════════════════════════════════════════════════════════════════
// الفئات وأسماؤها من MAIL_CATEGORIES في labels.js، والتسجيل في prepareParticipantMail (core.ts) عند كل إرسال.
// المشارك من جلسته وحدها، ولا معرّف مشارك من جسم الطلب.
import { db, Fail } from './core.ts';
import { categoriesFor, MUTABLE_MAIL_CATEGORIES } from './labels.js';
import { cleanMuted } from './mail-prefs.js';

// deno-lint-ignore no-explicit-any
type P = any;
// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;
const LIMIT = 100;

const categories = () => categoriesFor('participant');

export async function list(p: P, _b: Body = {}) {
  const [items, unread, pref] = await Promise.all([
    db.from('participant_notifications').select('id, category, title, excerpt, emailed, read_at, created_at').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('participant_notifications').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).is('read_at', null),
    db.from('participant_mail_prefs').select('muted').eq('participant_id', p.id).maybeSingle(),
  ]);
  if (items.error || pref.error) throw new Fail('تعذّر تحميل الرسائل، حاول بعد قليل', 503, 'messages_unavailable');
  return { success: true, items: items.data || [], unread: unread.count ?? 0, muted: cleanMuted(pref.data?.muted), categories: categories() };
}

// عدد غير المقروء وحده لترويسة التطبيق (me). قبل الترحيل أو عند تعذّره: صفر
export async function unreadCount(p: P) {
  const { count, error } = await db.from('participant_notifications').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).is('read_at', null);
  return error ? 0 : count ?? 0;
}

// ids: بنود بعينها، أو all: true لكل غير المقروء
export async function markRead(p: P, b: Body = {}) {
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, LIMIT) : [];
  if (!ids.length && b.all !== true) throw new Fail('لا شيء لتعليمه', 400, 'bad_request');
  let q = db.from('participant_notifications').update({ read_at: new Date().toISOString() }).eq('participant_id', p.id).is('read_at', null);
  if (ids.length) q = q.in('id', ids);
  const { error } = await q;
  if (error) throw new Fail('تعذّر الحفظ، حاول بعد قليل', 503, 'messages_unavailable');
  return { success: true };
}

// muted: الفئات المكتومة كاملة. الضروري لا يُكتم أبدًا (cleanMuted يُسقط ما ليس في MUTABLE_MAIL_CATEGORIES)
export async function savePrefs(p: P, b: Body = {}) {
  if (!Array.isArray(b.muted)) throw new Fail('اختيار غير صالح', 400, 'bad_request');
  const muted = cleanMuted(b.muted);
  const { error } = await db.from('participant_mail_prefs').upsert({ participant_id: p.id, muted, updated_at: new Date().toISOString() }, { onConflict: 'participant_id' });
  if (error) throw new Fail('تعذّر الحفظ، حاول بعد قليل', 503, 'messages_unavailable');
  return { success: true, muted, mutable: MUTABLE_MAIL_CATEGORIES };
}
