// ════════════════════════════════════════════════════════════════
// مركز رسائل المشارك: ما أُرسل إليه (وصل بالبريد أو كتمه) وتفضيلات بريده لكل فئة (ترحيل 20261128200000)
// ════════════════════════════════════════════════════════════════
// الفئات وأسماؤها من MAIL_CATEGORIES في labels.js، والتسجيل في notify (core.ts) عند كل إرسال.
// والخبير والمنسق بالجدولين نفسيهما (20261129130000)، كلٌّ بعموده.
// المشارك من جلسته وحدها، ولا معرّف مشارك من جسم الطلب.
import { db, Fail, OWNER_COLUMN } from './core.ts';
import { categoriesFor, mutableFor } from './labels.js';
import { cleanMuted } from './mail-prefs.js';

// deno-lint-ignore no-explicit-any
type P = any;
// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;
const LIMIT = 100;
// صاحب المركز: المشارك (كما كان، يُمرَّر صفه)، أو الخبير والمنسق (20261129130000) بنوعه ومعرّفه من جلسته وحدها
export type Owner = { kind: 'participant' | 'expert' | 'coordinator'; id: string };
const ownerOf = (x: P): Owner => (x && (x.kind === 'expert' || x.kind === 'coordinator') ? { kind: x.kind, id: String(x.id) } : { kind: 'participant', id: String(x.id) });
export const expertOwner = (e: P): Owner => ({ kind: 'expert', id: String(e.id) });
export const coordinatorOwner = (c: P): Owner => ({ kind: 'coordinator', id: String(c.id) });
const colOf = (o: Owner) => OWNER_COLUMN[o.kind];
// أعمدة المشارك كما كانت (تعمل قبل الترحيل الجديد)، وللخبير والمنسق أعمدة «ينتظرك» معها
const COLS = 'id, category, title, excerpt, emailed, read_at, created_at';
const STAFF_COLS = `${COLS}, ref, action_until, resolved_at`;
const unavailable = () => new Fail('تعذّر تحميل الرسائل، حاول بعد قليل', 503, 'messages_unavailable');
const categories = (o: Owner) => categoriesFor(o.kind);

// «ينتظرك» عنصر واحد لكل مرجع: الأحدث بين ما لم يُغلق يبقى، والأقدم منه يبقى في السجل بلا مهلته فلا يتكرر في «ينتظرك»
export function oneActionPerRef(items: P[]) {
  const seen = new Set<string>();
  return [...items].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((i) => {
    if (!i.action_until || i.resolved_at || !i.ref) return i;
    if (seen.has(i.ref)) return { ...i, action_until: null };
    seen.add(i.ref);
    return i;
  });
}

export async function list(x: P, _b: Body = {}) {
  const o = ownerOf(x), col = colOf(o), staff = o.kind !== 'participant';
  const [items, unread, pref, open] = await Promise.all([
    db.from('participant_notifications').select(staff ? STAFF_COLS : COLS).eq(col, o.id).order('created_at', { ascending: false }).limit(LIMIT),
    db.from('participant_notifications').select('id', { count: 'exact', head: true }).eq(col, o.id).is('read_at', null),
    db.from('participant_mail_prefs').select('muted').eq(col, o.id).maybeSingle(),
    // ما ينتظر ولم يُغلق باستعلام وحده، فلا يسقط القديم منه خلف آخر مئة رسالة
    staff ? db.from('participant_notifications').select(STAFF_COLS).eq(col, o.id).not('action_until', 'is', null).is('resolved_at', null).order('created_at', { ascending: false }).limit(LIMIT) : null,
  ]);
  if (items.error || pref.error || open?.error) throw unavailable();
  const recent = (items.data || []) as P[];
  const ids = new Set(recent.map((i) => i.id));
  const merged = [...recent, ...((open?.data || []) as P[]).filter((i) => !ids.has(i.id))];
  return { success: true, items: staff ? oneActionPerRef(merged) : merged, unread: unread.count ?? 0, muted: cleanMuted(pref.data?.muted, o.kind), categories: categories(o) };
}

// عدد غير المقروء وحده لترويسة التطبيق (me) وشارة لوحة الخبير. قبل الترحيل أو عند تعذّره: صفر
export async function unreadCount(x: P) {
  const o = ownerOf(x);
  const { count, error } = await db.from('participant_notifications').select('id', { count: 'exact', head: true }).eq(colOf(o), o.id).is('read_at', null);
  return error ? 0 : count ?? 0;
}

// ids: بنود بعينها، أو all: true لكل غير المقروء
export async function markRead(x: P, b: Body = {}) {
  const o = ownerOf(x);
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, LIMIT) : [];
  if (!ids.length && b.all !== true) throw new Fail('لا شيء لتعليمه', 400, 'bad_request');
  let q = db.from('participant_notifications').update({ read_at: new Date().toISOString() }).eq(colOf(o), o.id).is('read_at', null);
  if (ids.length) q = q.in('id', ids);
  const { error } = await q;
  if (error) throw new Fail('تعذّر الحفظ، حاول بعد قليل', 503, 'messages_unavailable');
  return { success: true };
}

// muted: الفئات المكتومة كاملة. المقفل لا يُكتم أبدًا (cleanMuted يُسقط ما ليس قابلًا للكتم لجمهور صاحبه)
export async function savePrefs(x: P, b: Body = {}) {
  const o = ownerOf(x), col = colOf(o);
  if (!Array.isArray(b.muted)) throw new Fail('اختيار غير صالح', 400, 'bad_request');
  const muted = cleanMuted(b.muted, o.kind);
  const { error } = await db.from('participant_mail_prefs').upsert({ [col]: o.id, muted, updated_at: new Date().toISOString() }, { onConflict: col });
  if (error) throw new Fail('تعذّر الحفظ، حاول بعد قليل', 503, 'messages_unavailable');
  return { success: true, muted, mutable: mutableFor(o.kind) };
}

// تفضيلات وحدها بلا صندوق (المنسق، قرار المالك 6: صندوقه لاحقًا): بلا muted قراءة، ومعها حفظ
export async function prefs(x: P, b: Body = {}) {
  const o = ownerOf(x);
  if (Array.isArray(b.muted)) return savePrefs(o, b);
  const { data, error } = await db.from('participant_mail_prefs').select('muted').eq(colOf(o), o.id).maybeSingle();
  if (error) throw unavailable();
  return { success: true, items: [], unread: 0, muted: cleanMuted(data?.muted, o.kind), categories: categories(o) };
}
