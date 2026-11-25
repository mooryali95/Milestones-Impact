// ════════════════════════════════════════════════════════════════
// خط الوثيقة («الوثيقة الحية»، اعتمده المالك 2026-11-25): حالات الفصل الأربع، ووحدات العرض بالمستوى، وسطر الرأس
// ════════════════════════════════════════════════════════════════
// دوال صرفة يقرؤها تطبيق المشارك (الخط وداخل الفصل ورحلتي) ولوحة الإدارة (شاشة المراجعة). المصدر: anatomy.json (lens)،
// وحالة الفصل من الخادم كما هي (capstone.ts sectionView). لا تغير شيئًا في الجاهزية ولا النقاط ولا البوابات.
import A from './anatomy.json';
import { phaseOf } from './anatomy.js';

export const LENS = Object.freeze(A.lens);
// الحالات الأربع كما يراها المشارك. الملاحظة لا تقفل الفصل
export const STATE_AR = Object.freeze({ empty: 'لم يبدأ', writing: 'قيد الكتابة', done: 'منتهٍ', note: 'فيه ملاحظة من خبيرك' });
export const STATE_ORDER = ['empty', 'writing', 'done', 'note'];

const t = (x) => (x ? Date.parse(x) : 0);

/** ملاحظة الخبير قائمة: كُتبت ولم يعدّل المشارك الفصل بعدها */
export const hasOpenNote = (s) => !!(s?.note && String(s.note).trim()) && t(s.updated_at) <= t(s.reviewed_at) + 1000;

/** حالة الفصل: empty، writing، done، note */
export function chapterState(s) {
  if (!s) return 'empty';
  if (hasOpenNote(s)) return 'note';
  const finished = s.status === 'submitted' || s.status === 'reviewed';
  if (finished && (s.complete || s.optional)) return 'done';
  if (!s.status && !s.updated_at) return 'empty';
  return 'writing';
}

/** قرأه خبيرك: قُرئ بعد آخر تعديل، ولا ملاحظة مفتوحة */
export const readByExpert = (s) => s?.status === 'reviewed' && !hasOpenNote(s) && t(s.updated_at) <= t(s.reviewed_at) + 1000;

/** «جديد» عند الخبير: تغيّر بعد آخر قراءة له (أو لم يُقرأ قط)، والمسودة لا تُعرض جديدة */
export const changedSinceRead = (s) => !!s?.status && s.status !== 'draft' && (!s.reviewed_at || t(s.updated_at) > t(s.reviewed_at) + 1000);

/** الفصول التي تُحسب في الإنجاز */
const counted = (sections) => (sections || []).filter((s) => !s.optional);

/**
 * وحدات العرض بالمسار: فصل كل إطار يُجمَّع بوحدات مستوى المشارك في إطاره (section.level من الخادم)، لا بمستوى ملخص.
 * وحدة تضم فصولًا من مستويات مختلفة تنقسم، فلا يُعرض فصل احترافي في وحدة تأسيسية. فصل بلا وحدة يصير وحدة وحده.
 * يعيد [{ key, title, level, items: [section], phase }]
 */
export function unitsFor(sections, fallbackLevel = 'advanced') {
  const list = (sections || []).map((s, i) => ({ ...s, n: i + 1 }));
  const lv = (s) => s.level || fallbackLevel;
  const defOf = (s) => (LENS.units?.[lv(s)] || null)?.find((u) => u.chapters.includes(s.key)) || null;
  const out = [];
  const seen = new Set();
  for (const s of list) {
    if (seen.has(s.id)) continue;
    const d = defOf(s);
    const items = d ? list.filter((x) => !seen.has(x.id) && lv(x) === lv(s) && defOf(x)?.key === d.key) : [s];
    items.forEach((x) => seen.add(x.id));
    const solo = items.length === 1 && (!d || d.chapters.length > 1);
    out.push({ key: d && !solo ? `${lv(s)}:${d.key}` : s.key, title: d && !solo ? d.title : s.title, level: lv(s), items, phase: phaseOf(items[0].key)?.title || '' });
  }
  return out;
}

/** كثافة الصفحة بملف التعريف: by_level بمستوى إطار الأولوية، ويتجاوزها profiles[key]. بلا ملف: المتوسط */
export function densityFor(profile) {
  const D = LENS.density;
  const base = D.by_level[profile?.level] || D.by_level.intermediate;
  const over = (profile?.key && D.profiles?.[profile.key]) || {};
  const { _note, ...rest } = over;
  return { ...base, ...rest };
}

/** أسئلة الجاهزية الثلاثة (للكثافة readiness): كل سؤال منتهٍ حين ينتهي فصل من فصوله في الوثيقة */
export function readinessQuestions(sections) {
  const D = LENS.density;
  return D.readiness_questions.map((q, i) => {
    const mine = (sections || []).filter((s) => D.readiness_chapters[i].includes(s.key));
    return { key: `r${i + 1}`, question: q, done: mine.some((s) => chapterState(s) === 'done'), chapters: mine };
  });
}

/** حالة الوحدة من فصولها: ملاحظة إن كان في أحدها، ومنتهية حين تنتهي كلها */
export function unitState(u) {
  const st = u.items.filter((s) => !s.optional).map(chapterState);
  if (u.items.some((s) => chapterState(s) === 'note')) return 'note';
  if (st.length && st.every((x) => x === 'done')) return 'done';
  if (u.items.some((s) => chapterState(s) !== 'empty')) return 'writing';
  return 'empty';
}

/** الفصل التالي المقترح: أول ملاحظة مفتوحة، ثم أول فصل غير منتهٍ بترتيب الوثيقة */
export function nextOf(sections) {
  const c = counted(sections);
  return c.find((s) => chapterState(s) === 'note') || c.find((s) => chapterState(s) !== 'done') || null;
}

/** الفصل الذي يلي فصلًا في الوثيقة (للزر «أنهيت ← التالي»): أول غير منتهٍ بعده، وإلا التالي مباشرة */
export function afterOf(sections, id) {
  const i = (sections || []).findIndex((s) => s.id === id);
  if (i < 0) return null;
  const rest = sections.slice(i + 1);
  return rest.find((s) => !s.optional && chapterState(s) !== 'done') || rest[0] || null;
}

const hoursAr = (n) => (n <= 1 ? 'ساعة' : n === 2 ? 'ساعتين' : n <= 10 ? `${n} ساعات` : `${n} ساعة`);
const leftAr = (n) => (n === 1 ? 'فصل واحد' : n === 2 ? 'فصلان' : n <= 10 ? `${n} فصول` : `${n} فصلًا`);

/** زمن الفصل بالساعات بمستوى إطاره: منتصف مدى الوثيقة ÷ عدد فصولها المعتاد (anatomy.json lens.estimate_hours) */
export function chapterHours(level) {
  const e = LENS.estimate_hours[level] || LENS.estimate_hours.intermediate;
  return (e.range[0] + e.range[1]) / 2 / e.chapters;
}

/**
 * سطر رأس الخط: «أنجزت X من Y · بقي N فصول، نحو مدة · التالي: ...»
 * يعيد { done, total, left, hours, next, line }
 */
export function spineSummary(sections) {
  const c = counted(sections);
  const done = c.filter((s) => chapterState(s) === 'done').length;
  const total = c.length;
  const left = total - done;
  const rest = c.filter((s) => chapterState(s) !== 'done').reduce((a, s) => a + chapterHours(s.level), 0);
  const hours = left ? Math.max(1, Math.round(rest)) : 0;
  const next = nextOf(sections);
  const parts = [`أنجزت ${done} من ${total}`];
  if (left) parts.push(`بقي ${leftAr(left)}، نحو ${hoursAr(hours)}`);
  else parts.push('أنهيت الفصول كلها');
  if (next) parts.push(`التالي: ${next.title}`);
  return { done, total, left, hours, next, line: parts.join(' · ') };
}

/** موضع الفصل في الوثيقة: «الفصل 5 من 12 · مرحلة ...» */
export function whereOf(sections, id) {
  const i = (sections || []).findIndex((s) => s.id === id);
  if (i < 0) return '';
  const ph = phaseOf(sections[i].key);
  return `الفصل ${i + 1} من ${sections.length}${ph ? ` · ${ph.title}` : ''}`;
}

/** آخر ما تغيّر في الوثيقة: الفصول بآخر حفظ، الأحدث أولًا */
export const recentChanges = (sections, n = 4) => (sections || []).filter((s) => s.updated_at).sort((a, b) => t(b.updated_at) - t(a.updated_at)).slice(0, n);

/**
 * «جديد في مستواك»: فصول ظهرت بعد آخر زيارة (ترقية المستوى). seen: مفاتيح الفصول التي رآها المشارك من قبل،
 * أو null لأول زيارة فلا يُوسم شيء
 */
export const newInLevel = (sections, seen) => (seen ? (sections || []).filter((s) => !seen.includes(s.key) && !s.updated_at).map((s) => s.key) : []);

/** الفحص يخص أي فصل؟ من خريطة الفحوص (stuck.js CHECK_CHAPTERS) */
export function checksOn(checks, key, map) {
  return (checks || []).filter((x) => !x.ok && (map[x.key] || []).includes(key));
}
