// ════════════════════════════════════════════════════════════════
// الكتاب الأم: الأبواب السبعة والعشرون بالأطر الثلاثة، وتعليقات الخبراء والإدارة عليها (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// المرحلة 1 من تصور «الكتاب الأم» (اعتمده المالك 2026-11-15): مرجع واحد يُقرأ ويُعرض على الخبراء ويعلّقون عليه.
// لا نسخة ثانية من الكتاب: المتن من handbook_modules نفسه، والترتيب الثابت للأطر من DIMENSIONS (المعالم ← الأثر ← القيادة).
// يقرؤه الخادم (master-book.ts) والقارئ في اللوحة وبوابة الخبير، فالقاعدة واحدة في الجهتين.
import { DIMENSIONS } from './logic.js';
import { COMMITTEES, COMMITTEE_AR } from './committees.js';

export const SECTION_MAX = 200;
export const QUOTE_MAX = 600;
export const BODY_MIN = 2;
export const BODY_MAX = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// الباب بمعرّفه، والمسودة المعروضة على اللجنة بمعرّف «draft:مفتاحها» (master-book-drafts.js)
const DRAFT_ID = /^draft:[a-z0-9-]{2,60}$/;
export const isChapterId = (id) => UUID.test(String(id || '')) || DRAFT_ID.test(String(id || ''));

// من يقرأ الكتاب الأم من الخبراء: عضو فاعل في لجنة المحتوى أو القياس (experts.committees)، فالعضوية من سجل الخبير لا قائمة ثانية
export const bookAccess = (e) => !!e && ['active', 'paused'].includes(e.status) && (e.committees || []).some((c) => COMMITTEES.includes(c));

// صفة المعلّق كما تظهر بجانب اسمه
export function authorRole(kind, { committees = [], role = '' } = {}) {
  if (kind === 'admin') return role === 'super_admin' ? 'المدير العام' : 'الإدارة';
  const cs = COMMITTEES.filter((c) => committees.includes(c));
  return cs.length === 2 ? 'لجنتا المحتوى والقياس' : cs.length ? COMMITTEE_AR[cs[0]] : 'خبير';
}

// إصدار الكتاب من اسم آخر ترحيل له: 20261115150000_leaders_handbook_v3_1 ← v3.1
export function versionFromMigration(name) {
  const m = String(name || '').match(/_leaders_handbook_(v\d+(?:_\d+)*)$/);
  return m ? m[1].replace(/_/g, '.') : null;
}

// أقسام الباب: عناوين ## في المتن بترتيبها، وهي مراسي التعليق
// والعنوان المكرر (قسم لكل مستوى بالاسم نفسه، كـ«تركيزك في هذا الإطار») يتميز بمستوى كتلته، فلكل قسم مرساة واحدة
export const sectionsOf = (md) => bookSections(md).filter((s) => s.title).map((s) => s.key);

// الأبواب بترتيب الكتاب: الإطار بترتيبه الثابت، ثم ترتيب الباب فيه
export function orderChapters(rows = []) {
  const rank = (d) => { const i = DIMENSIONS.indexOf(d); return i < 0 ? 99 : i; };
  return [...rows].sort((a, b) => rank(a.dimension) - rank(b.dimension) || (a.sort ?? 0) - (b.sort ?? 0) || String(a.chapter_key).localeCompare(String(b.chapter_key)));
}

/** تحقق مدخل التعليق. يرجع { value } أو { error } بجملة تُقرأ
 * @param {{ module_id?: string, section?: string, quote?: string, body?: string, parent_id?: string|null }} b
 * @param {{ modules?: { id: string, body_md?: string }[] }} ctx الأبواب القائمة، فلا تعليق على باب أو قسم غير موجود */
export function cleanComment(b = {}, { modules = [] } = {}) {
  const body = String(b.body ?? '').trim();
  const section = String(b.section ?? '').trim();
  const quote = String(b.quote ?? '').replace(/\s+/g, ' ').trim();
  const parent_id = b.parent_id ? String(b.parent_id) : null;
  if (!isChapterId(b.module_id)) return { error: 'الباب غير محدد' };
  const mod = modules.find((m) => m.id === b.module_id);
  if (!mod) return { error: 'الباب غير موجود' };
  if (section && !sectionsOf(mod.body_md).includes(section)) return { error: 'القسم غير موجود في الباب، فقد يكون تغيّر. أعد تحميل الكتاب' };
  if (section.length > SECTION_MAX) return { error: 'عنوان القسم أطول من المسموح' };
  if (quote.length > QUOTE_MAX) return { error: `النص المقتبس أطول من ${QUOTE_MAX} حرف: اختر جزءًا أقصر` };
  if (body.length < BODY_MIN) return { error: 'اكتب تعليقك' };
  if (body.length > BODY_MAX) return { error: `التعليق أطول من ${BODY_MAX} حرف` };
  if (parent_id && !UUID.test(parent_id)) return { error: 'التعليق المردود عليه غير صالح' };
  return { value: { module_id: mod.id, section, quote, body, parent_id } };
}

/** التعليقات سلاسل: الأصل وردوده بترتيب الزمن. المحذوف بلا ردود يختفي، وبردود يبقى مكانه «حُذف»
 * ويُعلَّم التعليق «على نص سابق» إن تغيّرت بصمة بابه بعده */
export function threads(rows = [], fingerprints = {}) {
  const live = rows.filter((c) => !c.parent_id);
  const replies = rows.filter((c) => c.parent_id);
  const byTime = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
  const view = (c) => ({
    id: c.id, module_id: c.module_id, section: c.section || '', quote: c.deleted_at ? '' : c.quote || '', body: c.deleted_at ? '' : c.body,
    deleted: !!c.deleted_at, author_kind: c.author_kind, author_ref: c.author_ref, author_name: c.author_name || '', author_role: c.author_role || '',
    status: c.status, resolved_by: c.resolved_by || null, resolved_at: c.resolved_at || null, created_at: c.created_at,
    stale: !!(c.fingerprint && fingerprints[c.module_id] && c.fingerprint !== fingerprints[c.module_id]),
  });
  return live.map((c) => ({ ...view(c), replies: replies.filter((r) => r.parent_id === c.id && !r.deleted_at).sort(byTime).map(view) }))
    .filter((t) => !t.deleted || t.replies.length)
    .sort(byTime);
}

// أعداد السلاسل المفتوحة لكل باب ولكل قسم فيه (المفتاح «معرّف الباب|القسم»، والقسم الفارغ للباب كله)
export function openCounts(list = []) {
  const byModule = {}, bySection = {};
  for (const t of list) {
    if (t.status !== 'open' || t.deleted) continue;
    byModule[t.module_id] = (byModule[t.module_id] || 0) + 1;
    const k = `${t.module_id}|${t.section || ''}`;
    bySection[k] = (bySection[k] || 0) + 1;
  }
  return { byModule, bySection, total: Object.values(byModule).reduce((s, n) => s + n, 0) };
}

// من يملك ماذا: كاتب التعليق يحذفه، والإدارة تحسمه أو تعيد فتحه
export const canDelete = (viewer, c) => !!viewer && c.author_kind === viewer.kind && c.author_ref === viewer.ref;
export const canResolve = (viewer) => viewer?.kind === 'admin' && viewer.write === true;

// شارة مستوى الفقرة المعلّمة (:::min= أو :::only= أو :::scope=) كما يقرؤها المراجع
export const TIER_AR = {
  min: { beginner: 'لكل المستويات', intermediate: 'للمتوسط فأعلى', advanced: 'للاحترافي' },
  only: { beginner: 'للتأسيسي فقط', intermediate: 'للمتوسط فقط', advanced: 'للاحترافي فقط' },
  scope: { project: 'لكل النطاقات', program: 'لقادة البرامج والمحافظ', portfolio: 'لقادة المحافظ' },
};
export function tierAr(spec) {
  return String(spec || '').trim().split(/\s+/).map((p) => { const [k, v] = p.split('='); return TIER_AR[k]?.[v] || null; }).filter(Boolean).join(' · ');
}

/** تقسيم متن الباب إلى أقسام (## عنوان)، وكل قسم إلى مقاطع: عادي أو معلّم بمستواه، كما يعرضه القارئ
 * @returns {{ title: string, parts: { tier: string|null, md: string }[] }[]} القسم الأول بلا عنوان إن سبق المتنُ أولَ عنوان */
export function bookSections(md) {
  const out = [];
  let cur = { title: '', tier: null, parts: [] };
  let tier = null, buf = [];
  const flush = () => { const t = buf.join('\n').trim(); if (t) cur.parts.push({ tier, md: t }); buf = []; };
  for (const line of String(md || '').split('\n')) {
    const open = line.match(/^:::\s*((?:min|only|scope)=\S+(?:\s+(?:min|only|scope)=\S+)*)\s*$/);
    if (open) { flush(); tier = open[1]; continue; }
    if (/^:::\s*$/.test(line)) { flush(); tier = null; continue; }
    const h = line.match(/^##\s+(.+?)\s*$/);
    // عنوان داخل فقرة معلّمة يفتح قسمًا يبقى بمستوى فقرته
    if (h) { flush(); if (cur.title || cur.parts.length) out.push(cur); cur = { title: h[1].replace(/\*\*/g, '').trim(), tier, parts: [] }; buf.push(line); continue; }
    buf.push(line);
  }
  flush();
  if (cur.title || cur.parts.length) out.push(cur);
  const seen = {};
  for (const x of out) seen[x.title] = (seen[x.title] || 0) + 1;
  return out.map((x) => ({ key: seen[x.title] > 1 && x.tier ? `${x.title} · ${tierAr(x.tier)}` : x.title, title: x.title, tier: x.tier || null, parts: x.parts }));
}

// نسخة المراجعة المطبوعة: الفقرة المعلّمة تبدأ بسطر يسمي مستواها وتنتهي بسطر يعلن نهايتها، فيرى الخبير على الورق لمن تظهر
export const markTiers = (md) => String(md || '').split('\n').map((line) => {
  const open = line.match(/^:::\s*((?:min|only|scope)=\S+(?:\s+(?:min|only|scope)=\S+)*)\s*$/);
  if (open) return `\n**◆ ${tierAr(open[1])}**\n`;
  // نهاية الكتلة سطر يفصل ما بعدها، فلا تُضم قائمة النص العام إلى قائمة الكتلة في الإخراج
  return /^:::\s*$/.test(line) ? '\n**◇ عودة إلى النص العام**\n' : line;
}).join('\n');

// هل تظهر الفقرة المعلّمة لمستوى معيّن؟ بقاعدة filterHandbookMd نفسها، والنطاق لا يُخفي شيئًا في عرض المراجعة.
// level: 'all' يعرض كل شيء (الكتاب الأم كما هو)
const RANK = { beginner: 0, intermediate: 1, advanced: 2 };
export function tierVisible(spec, level) {
  if (!spec || level === 'all') return true;
  return String(spec).trim().split(/\s+/).every((t) => {
    const [k, v] = t.split('=');
    if (k === 'min') return RANK[level] >= RANK[v];
    if (k === 'only') return level === v;
    return true;
  });
}
export const chapterVisible = (ch, level) => level === 'all' || RANK[level] >= (RANK[ch.min_level] ?? 0);

// ── مشاركة الكتاب مع الخبراء (لوحة الإدارة): من يقرأ الآن، ومن يمكن إضافته بنقرة ──
// القارئ عضو فاعل في لجنة المحتوى أو القياس (bookAccess نفسها)، فالمشاركة هي العضوية لا رابط منفصل
const expertRow = (e) => ({ id: e.id, name: e.full_name || e.email || '', title: e.title || '', status: e.status, committees: (e.committees || []).filter((c) => COMMITTEES.includes(c)) });
export function shareRoster(experts = []) {
  const readers = experts.filter(bookAccess).map(expertRow);
  // عضو لجنة غير فاعل: لا يقرأ حتى يُفعَّل ملفه، فيُذكر ليعرف المدير لماذا لا يرى الكتاب
  const blocked = experts.filter((e) => !bookAccess(e) && (e.committees || []).some((c) => COMMITTEES.includes(c))).map(expertRow);
  const candidates = experts.filter((e) => e.status === 'active' && !bookAccess(e)).map(expertRow);
  const byName = (a, b) => a.name.localeCompare(b.name, 'ar');
  return { readers: readers.sort(byName), blocked: blocked.sort(byName), candidates: candidates.sort(byName) };
}
// عضوية لجنة بعد إضافة أو إزالة، بلا تكرار ولا قيمة غريبة
export function toggleCommittee(list = [], committee, on) {
  if (!COMMITTEES.includes(committee)) return null;
  const cur = (list || []).filter((c) => COMMITTEES.includes(c));
  return on ? [...new Set([...cur, committee])] : cur.filter((c) => c !== committee);
}

// ── المسودات في الكتاب الأم: وثيقة معروضة على اللجنة تُقرأ كبابٍ في جزء «مسودات للمراجعة» ويُعلَّق عليها ──
export const DRAFT_PART = 'draft';
/** @param {{ key: string, title: string, md: string, status?: string, source?: string, dimension?: string }[]} drafts */
export const draftChapters = (drafts = []) => drafts.map((d, i) => ({
  id: `draft:${d.key}`, dimension: DRAFT_PART, chapter_key: d.key, sort: i + 1, title: d.title, min_level: 'beginner',
  md: d.md, quiz_md: '', reflection: '', draft: true, status: d.status || 'مسودة', source: d.source || '', about: d.dimension || null,
}));
// هدف التعليق في الجدول: باب (module_id) أو مسودة (draft_key)، وفي القارئ معرّف واحد
export const commentTarget = (id) => (String(id).startsWith('draft:') ? { module_id: null, draft_key: String(id).slice(6) } : { module_id: String(id), draft_key: null });
export const rowChapterId = (row) => row.module_id || (row.draft_key ? `draft:${row.draft_key}` : null);
