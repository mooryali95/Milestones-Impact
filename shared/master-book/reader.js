// ════════════════════════════════════════════════════════════════
// تفضيلات القارئ وموضعه وعلاماته والبحث بالتطبيع (المرحلة 3 من «فصل خبراء الرحلة عن لجان المحتوى»)
// ════════════════════════════════════════════════════════════════
// منطق خالص بلا واجهة، يختبره reader-phase3.test.js. الحالة كلها في المتصفح لصاحبها وحده، بمفتاح لكل قارئ
// (بصمة لا بريد صريح)، وضياعها لا يضر. حالة القراءة على الخادم وبين الأجهزة هي المرحلة 4 بترحيلها.

export const LEGACY_KEY = 'mi-master-book';   // مفتاح واحد لكل من فتح القارئ على الجهاز، يُمسح ولا يُنقل إلى أحد
export const KEY_PREFIX = 'mi-master-book:';
export const MARKS_MAX = 60;

// القرار 9: متن الكتاب Noto Naskh Arabic وزن 400 بحجم 18، والخط السابق (الكوفي) خيار في «Aa»
export const FONTS = [['naskh', 'نسخ'], ['kufi', 'كوفي']];
export const SIZES = [16, 18, 20, 22];
export const SPACINGS = [['snug', 'متقاربة', 1.9], ['normal', 'متوسطة', 2.15], ['wide', 'واسعة', 2.45]];
export const THEMES = [['paper', 'ورقي'], ['sepia', 'دافئ'], ['night', 'ليلي']];
export const DEFAULT_PREFS = Object.freeze({ font: 'naskh', size: 18, spacing: 'normal', theme: 'paper', level: 'all', scope: 'book', pos: null, marks: [] });
const LEVEL_KEYS = ['all', 'beginner', 'intermediate', 'advanced'];

// بصمة FNV-1a بست عشرية: تفصل قراءة كل شخص على جهاز مشترك دون أن يُكتب بريده في مفتاح التخزين
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export function readerKey(viewer) {
  const who = String(viewer?.email || viewer?.name || '').trim().toLowerCase();
  return `${KEY_PREFIX}${viewer?.kind || 'reader'}-${fnv(`${viewer?.kind || ''}|${who}`)}`;
}

const pick = (v, list, d) => (list.includes(v) ? v : d);
const cleanPos = (p) => (p && typeof p.id === 'string' && p.id ? { id: p.id, section: typeof p.section === 'string' ? p.section : '' } : null);
// ما يُقرأ من التخزين مدخل غير موثوق: كل حقل يُتحقق منه، وما سواه يعود إلى الافتراضي
export function cleanPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const marks = Array.isArray(r.marks) ? r.marks.map((m) => (cleanPos(m) ? { ...cleanPos(m), at: Number.isFinite(m.at) ? m.at : 0 } : null)).filter(Boolean) : [];
  return {
    font: pick(r.font, FONTS.map(([k]) => k), DEFAULT_PREFS.font),
    size: pick(r.size, SIZES, DEFAULT_PREFS.size),
    spacing: pick(r.spacing, SPACINGS.map(([k]) => k), DEFAULT_PREFS.spacing),
    theme: pick(r.theme, THEMES.map(([k]) => k), DEFAULT_PREFS.theme),
    level: pick(r.level, LEVEL_KEYS, DEFAULT_PREFS.level),
    scope: r.scope === 'part' ? 'part' : 'book',
    pos: cleanPos(r.pos),
    marks: marks.slice(0, MARKS_MAX),
  };
}
export const lineHeight = (spacing) => (SPACINGS.find(([k]) => k === spacing) || SPACINGS[1])[2];

// ── الاستئناف ──
// العلة القديمة: الموضع رقم ترتيب، و«تابع القراءة» تظهر حين يكون الرقم صادقًا، فالباب الأول (0) لا يُستأنف أبدًا،
// ورقم الترتيب يتغير إن أضيفت مسودة أو باب. الموضع الآن معرّف الباب وقسمه، ويُحفظ عند فتح الباب لا عند فتح القارئ
export function resumeAt(chapters, pos) {
  if (!pos || !Array.isArray(chapters)) return -1;
  return chapters.findIndex((c) => c.id === pos.id);
}
export const canResume = (chapters, pos) => resumeAt(chapters, pos) >= 0;

// ── العلامات: قسم في باب، تُضاف وتُزال بالزر نفسه، والأحدث أولًا ──
export const sameSpot = (a, b) => !!a && !!b && a.id === b.id && (a.section || '') === (b.section || '');
export const isMarked = (marks, spot) => (marks || []).some((m) => sameSpot(m, spot));
export function toggleMark(marks, spot, now = Date.now()) {
  const list = marks || [];
  if (isMarked(list, spot)) return list.filter((m) => !sameSpot(m, spot));
  return [{ id: spot.id, section: spot.section || '', at: now }, ...list].slice(0, MARKS_MAX);
}
// علامة على باب حُذف من الكتاب أو قسم تغيّر اسمه: تُعرض العلامات القائمة وحدها
export function liveMarks(marks, chapters, sectionsOf) {
  const byId = new Map((chapters || []).map((c, i) => [c.id, { c, i }]));
  return (marks || []).flatMap((m) => {
    const hit = byId.get(m.id);
    if (!hit) return [];
    const keys = sectionsOf(hit.c);
    return !m.section || keys.includes(m.section) ? [{ ...m, chapter: hit.c, idx: hit.i }] : [];
  });
}

// ── البحث بالتطبيع ──
// على نهج مرشِّح التطبيع العربي في Lucene: تُحذف الحركات والتطويل، وتُوحَّد صور الألف (أ إ آ ٱ) إلى ا، والألف المقصورة
// إلى ي، والتاء المربوطة إلى ه. والأرقام الهندية إلى العربية الغربية، واللاتيني بحروف صغيرة. الهمزة على الواو والياء
// لا تُوحَّد لأن «سؤال» و«سوال» ليستا صيغتين شائعتين للكلمة نفسها كما «مدرسة» و«مدرسه»
const MARKS_RE = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/;
const FOLD = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه' };
function foldChar(ch) {
  if (MARKS_RE.test(ch)) return '';
  if (FOLD[ch]) return FOLD[ch];
  const code = ch.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06F0 && code <= 0x06F9) return String(code - 0x06F0);
  return ch.toLowerCase();
}
// يعيد النص المطبّع ومعه لكل حرف فيه موضعه في الأصل، فتُقص المقتطفات من النص كما كُتب
export function foldMap(text) {
  const src = String(text || '');
  let out = '';
  const at = [];
  let space = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (/\s/.test(ch)) { if (!space && out) { out += ' '; at.push(i); } space = true; continue; }
    const f = foldChar(ch);
    if (!f) continue;
    space = false;
    for (const x of f) { out += x; at.push(i); }
  }
  if (out.endsWith(' ')) { out = out.slice(0, -1); at.pop(); }
  return { text: out, at };
}
export const normalizeAr = (s) => foldMap(s).text;

// المتن نصًا مقروءًا بلا رموز التنسيق، ليُبحث فيه ويُقتطف منه
export function plainMd(md) {
  return String(md || '')
    .split('\n')
    .filter((l) => !/^\s*:::/.test(l) && !/^\s*\|?\s*:?-{3,}/.test(l))
    .map((l) => l.replace(/^\s*(#{1,6}|>|[-*•◆]|\d+[.)])\s+/, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\|/g, ' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// موضع أول تطابق في النص الأصلي، أو null. السؤال أقصر من حرفين بعد التطبيع لا يُبحث به
export function findAr(text, query) {
  const q = normalizeAr(query);
  if (q.length < 2) return null;
  const m = foldMap(text);
  const k = m.text.indexOf(q);
  if (k < 0) return null;
  // حركات آخر حرف مطابق جزء منه، فلا يُقص المقتطف قبلها
  const src = String(text || '');
  let end = m.at[k + q.length - 1] + 1;
  while (end < src.length && MARKS_RE.test(src[end])) end++;
  return { start: m.at[k], end };
}
// مقتطف حول التطابق بثلاثة أجزاء: قبله، والمطابق كما كُتب، وبعده
export function snippet(text, hit, room = 48) {
  const s = String(text || '');
  const from = Math.max(0, hit.start - room);
  const to = Math.min(s.length, hit.end + room);
  return { before: `${from > 0 ? '…' : ''}${s.slice(from, hit.start)}`, match: s.slice(hit.start, hit.end), after: `${s.slice(hit.end, to)}${to < s.length ? '…' : ''}` };
}
// البحث في أبواب بأقسامها: sectionsOf(c) تعيد [{ key, title, md }]. العنوان يتقدم المتن، والنتائج حتى limit
export function searchBook(chapters, query, sectionsOf, limit = 40) {
  if (normalizeAr(query).length < 2) return [];
  const out = [];
  for (const c of chapters || []) {
    for (const s of sectionsOf(c)) {
      const title = s.title ? s.key : '';
      const body = plainMd(s.md);
      // مدخل الباب بلا عنوان قسم: يُطابَق عنوان الباب نفسه
      const inTitle = !!(findAr(title, query) || (!s.title && findAr(c.title, query)));
      const inBody = findAr(body, query);
      if (!inTitle && !inBody) continue;
      out.push({ c, s, title: inTitle, snip: inBody ? snippet(body, inBody) : null });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ── السحب على الهاتف ──
// لمسة تبدأ داخل عنصر يتمرر أفقيًا (جدول مقارنة عريض، أو شريط المستوى) تمرره هو ولا تقلب الباب
export function inHScroll(el, stop) {
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    if (n.matches?.('table, pre, .f-compare-w, .mb-levels, [data-noswipe]')) return true;
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = typeof getComputedStyle === 'function' ? getComputedStyle(n).overflowX : '';
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

// ── رابط لكل باب (المرحلة 3، آخر بنودها) ──
// مرجع ثابت بالجزء ومفتاح الباب لا بالمعرف ولا بالترتيب، فيبقى الرابط صالحًا بعد إعادة ترتيب الأبواب أو تحديث نصها.
// والمسودة بلا مفتاح باب فمرجعها معرّفها. الرابط لا يمنح وصولًا: يُبحث عنه في الأبواب التي أعادها الخادم لهذا القارئ وحدها،
// فباب خارج ما يُتاح له (مسودة لغير لجنتها مثلًا) لا يُفتح، ويقول الرف ذلك
export const BOOK_LINK_PARAM = 'ch';
export const chapterRef = (c) => (!c ? '' : c.chapter_key && !c.draft ? `${c.dimension}.${c.chapter_key}` : String(c.id || ''));
export function refIndex(chapters, ref) {
  const r = String(ref || '').trim();
  if (!r) return -1;
  return (chapters || []).findIndex((c) => chapterRef(c) === r);
}
// الرابط في الـhash لأن اللوحة وبوابة الخبير تُخدمان من مجلد ثابت: ‎#/leaders/book?ch=…‎ في اللوحة، و‎#ch=…‎ في البوابة
function splitHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  const i = h.indexOf('?');
  if (i >= 0) return [h.slice(0, i), h.slice(i + 1)];
  return h.startsWith('/') || !h.includes('=') ? [h, ''] : ['', h];
}
export function hashRef(hash) {
  const [, q] = splitHash(hash);
  return new URLSearchParams(q).get(BOOK_LINK_PARAM) || null;
}
export function hashWithRef(hash, ref) {
  const [base, q] = splitHash(hash);
  const p = new URLSearchParams(q);
  if (ref) p.set(BOOK_LINK_PARAM, ref); else p.delete(BOOK_LINK_PARAM);
  const qs = p.toString();
  if (!qs) return base ? `#${base}` : '';
  return base ? `#${base}?${qs}` : `#${qs}`;
}

// تحصين رد الكتاب (نقطة التحقق 2026-11-27): رد ناجح ينقصه حقل يُعامل الغائب قائمة أو قيمة فارغة بدل انهيار الشاشة.
// الرد الفاشل يمر كما هو. لا يغير حقلًا حاضرًا، ولا يخترع share أو deps أو proposals (غيابها له معنى: لا صلاحية).
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export function bookShape(r) {
  if (!r || !r.success) return r;
  const counts = isObj(r.counts) ? r.counts : {};
  const viewer = isObj(r.viewer) ? r.viewer : {};
  const out = {
    ...r,
    chapters: Array.isArray(r.chapters) ? r.chapters : [],
    comments: Array.isArray(r.comments) ? r.comments : [],
    counts: { ...counts, total: Number(counts.total) || 0, byModule: isObj(counts.byModule) ? counts.byModule : {}, bySection: isObj(counts.bySection) ? counts.bySection : {} },
    viewer: { ...viewer, name: viewer.name || '', role: viewer.role || '' },
  };
  if (r.share != null) out.share = { ...(isObj(r.share) ? r.share : {}), readers: Array.isArray(r.share?.readers) ? r.share.readers : [] };
  return out;
}
