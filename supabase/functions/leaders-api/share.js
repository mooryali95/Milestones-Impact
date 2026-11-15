// ════════════════════════════════════════════════════════════════
// مشاركة وثيقة المبادرة برابط خاص، وملاحظات من يفتحه (منطق خالص)
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-15-تصور-تصدير-المبادرة-ومشاركتها-v1.md (اعتمده المالك 2026-11-15).
// صاحب الوثيقة يملك كل رابط: لمن أعطاه، ومدته، وهل يكتب قارئه ملاحظة، وهل يحمّل PDF، وهل يرى مستواه ومساره.
// والملاحظات له وحده. ما يصل القارئ تحسمه publicDoc هنا، لا الواجهة.
import { docLevelsFor } from './capstone.js';

export const SHARE_DAYS = Object.freeze([7, 30, 90]);
export const MAX_ACTIVE_SHARES = 10;
// حد الإغراق: ملاحظات في الساعة من العنوان نفسه، وفي اليوم على الرابط نفسه
export const NOTE_LIMITS = Object.freeze({ perIpHour: 6, perShareDay: 40 });
// تنبيه صاحب الوثيقة بالبريد: مرة كل ساعة على الأكثر لكل رابط، ومعها عدد ما وصل
export const NOTIFY_EVERY_MS = 60 * 60 * 1000;

/** حالة الرابط: active أو expired أو revoked */
export function shareState(row, now = Date.now()) {
  if (row?.revoked_at) return 'revoked';
  if (!row?.expires_at || new Date(row.expires_at).getTime() <= now) return 'expired';
  return 'active';
}
export const SHARE_STATE_AR = Object.freeze({ active: 'نشط', expired: 'انتهى', revoked: 'أُلغي' });

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** مدخلات رابط جديد أو تعديله بعد تنظيفها. يرمي رسالة عربية إن لم تصح */
export function cleanShareInput(b, { create = true } = {}) {
  const out = {};
  if (create || b.label !== undefined) {
    out.label = text(b.label, 80);
    if (out.label.length < 1) throw new Error('سمِّ الرابط بمن ستعطيه إياه، مثل «مديري» أو «لجنة الابتكار»');
  }
  if (create) {
    const days = Number(b.days);
    if (!SHARE_DAYS.includes(days)) throw new Error(`مدة الرابط ${SHARE_DAYS.join(' أو ')} يومًا`);
    out.days = days;
  }
  for (const k of ['allow_notes', 'allow_download', 'show_levels']) if (b[k] !== undefined || create) out[k] = b[k] === undefined ? k === 'allow_download' : !!b[k];
  return out;
}

/** ملاحظة القارئ بعد تنظيفها. يرمي رسالة عربية إن لم تصح */
export function cleanNote(b, sectionKeys = []) {
  const name = text(b.name, 80);
  const role = text(b.role, 80) || null;
  const body = String(b.body ?? '').trim().slice(0, 2000);
  if (name.length < 2) throw new Error('اكتب اسمك ليعرف صاحب المبادرة من كتب الملاحظة');
  if (body.length < 2) throw new Error('اكتب ملاحظتك');
  const section = sectionKeys.includes(b.section) ? b.section : null;
  return { author_name: name, author_role: role, body, section_key: section };
}

/**
 * الوثيقة كما يقرؤها من يفتح الرابط: بلا تقييم المستشار ولا فحوصه ولا تأييد الراعي ونصه، وبلا أي بريد،
 * والمستوى والمسار بإذن صاحبها في هذا الرابط وحده (D18)
 */
export function publicDoc(doc, share) {
  if (!doc) return null;
  const sections = (doc.sections || []).map((s) => ({ ...s, fields: (s.fields || []).filter((f) => !/email/i.test(f.key)) }));
  // جهة ملف المشارك لا تصل القارئ: هي راعية البرنامج لا مالكة المبادرة، ومكان المبادرة في meta.host من بطاقتها
  const meta = doc.meta ? { ...doc.meta, org: null } : doc.meta;
  const shown = docLevelsFor({ ...doc, meta, sections, review: null, checks: [], sponsor: null, rubric: [] }, !!share?.show_levels);
  return shown;
}

/** صف الرابط كما يراه صاحبه في لوحته */
export function ownerView(row, notes = [], now = Date.now()) {
  const mine = notes.filter((n) => n.share_id === row.id && !n.archived_at);
  return {
    id: row.id, label: row.label, allow_notes: !!row.allow_notes, allow_download: !!row.allow_download, show_levels: !!row.show_levels,
    expires_at: row.expires_at, created_at: row.created_at, views: row.views || 0, last_viewed_at: row.last_viewed_at || null,
    state: shareState(row, now), notes: mine.length, unread: mine.filter((n) => !n.read_at).length,
  };
}
