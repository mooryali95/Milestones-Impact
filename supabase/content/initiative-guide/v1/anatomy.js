// تشريح المبادرة: معناها، وخريطة فصول وثيقتها بمراحلها، ومسرد مصطلحاتها، وإحالاتها إلى الكتاب.
// المصدر الواحد anatomy.json. يقرؤه تطبيق المشارك (صفحة المبادرة، والفصل، والتلميحات) وقالب الوثيقة (الفهرس والمسرد)،
// ويُولَّد منه مرجع الخبير (scripts/content/anatomy-doc.mjs). ترتيب الفصول داخل المرحلة ترتيب الخادم (capstone_sort) لا هذا الملف.
import A from './anatomy.json';
import { RISK_HIGH } from '../../../functions/leaders-api/capstone.js';
import { handbookRef } from '../../../functions/leaders-api/section-refs.js';

export const ANATOMY = A;
// الإحالة إلى الكتاب بهوية القسم (section_id)، والباب والعنوان يُقرآن منها الآن (section-refs.js)
export const MEANING = Object.freeze({ ...A.meaning, handbook: handbookRef(A.meaning.handbook) });
export const PHASES = Object.freeze(A.phases);
export const FEEDS = Object.freeze(A.feeds);

// قيم الثوابت تُقرأ من مصدرها لا تُكتب في المحتوى
const fill = (t) => String(t || '').replaceAll('{RISK_HIGH}', String(RISK_HIGH));
export const GLOSSARY = Object.freeze(A.glossary.map((g) => Object.freeze({ term: g.term, aka: g.aka || [], def: fill(g.def) })));

/** دليل الفصل: لماذا هو، وما يغذيه، وإحالته في الكتاب. null لفصل لا دليل له */
const CHAPTERS = Object.fromEntries(Object.entries(A.chapters).map(([k, c]) => [k, { ...c, handbook: c.handbook ? handbookRef(c.handbook) : c.handbook }]));
export const chapterInfo = (key) => CHAPTERS[key] || null;

/** مرحلة الفصل، أو null لفصل لم يُصنَّف بعد */
export const phaseOf = (key) => PHASES.find((p) => p.chapters.includes(key)) || null;

/**
 * فصول الوثيقة مجمّعة بالمراحل بترتيب الخادم، وما لم يُصنَّف في مرحلة «فصول أخرى» آخرها.
 * sections: [{ key, ... }] بترتيب الوثيقة. يعيد [{ key, title, lead, items: [{ ...section, n }] }]، n رقم الفصل في الوثيقة
 */
export function groupByPhase(sections) {
  const list = (sections || []).map((s, i) => ({ ...s, n: i + 1 }));
  const out = PHASES.map((p) => ({ key: p.key, title: p.title, lead: p.lead, items: list.filter((s) => p.chapters.includes(s.key)) }));
  const rest = list.filter((s) => !phaseOf(s.key));
  if (rest.length) out.push({ key: 'other', title: 'فصول أخرى', lead: '', items: rest });
  return out.filter((g) => g.items.length);
}

// ── المسرد ──
const norm = (s) => String(s || '').replace(/[ً-ْـ]/g, '').trim();
// كل صيغ المصطلح، الأطول أولًا، فلا يطابق «الموازنة» داخل «الموازنة المتاحة»
const FORMS = GLOSSARY.flatMap((g) => [g.term, ...g.aka].map((f) => ({ f: norm(f), g }))).sort((a, b) => b.f.length - a.f.length);

/** تعريف مصطلح بأي صيغة من صيغه، أو null */
export const define = (word) => FORMS.find((x) => x.f === norm(word))?.g || null;

/**
 * يقسم نصًا إلى أجزاء، كل مصطلح من المسرد فيه جزء بتعريفه: [{ text, term? }]. يُعلَّم أول ظهور لكل مصطلح فقط،
 * ولا يُعلَّم داخل كلمة أطول (حدود الكلمة بالعربية: ما قبله وما بعده ليس حرفًا)
 */
export function annotate(text, seen = new Set()) {
  const s = String(text ?? '');
  if (!s) return [];
  const hits = [];
  for (const { f, g } of FORMS) {
    if (seen.has(g.term)) continue;
    let from = 0;
    while (from <= s.length) {
      const i = s.indexOf(f, from);
      if (i < 0) break;
      const before = s[i - 1] || ' ', after = s[i + f.length] || ' ';
      const free = !hits.some((h) => i < h.end && i + f.length > h.start);
      const bounded = !/[\p{L}]/u.test(before.replace(/[وبلف]/, '')) && !/[\p{L}]/u.test(after);
      if (free && bounded) { hits.push({ start: i, end: i + f.length, g }); seen.add(g.term); break; }
      from = i + 1;
    }
  }
  if (!hits.length) return [{ text: s }];
  hits.sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  for (const h of hits) {
    if (h.start > at) out.push({ text: s.slice(at, h.start) });
    out.push({ text: s.slice(h.start, h.end), term: h.g });
    at = h.end;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/** المصطلحات التي تظهر في نص (للمسرد الملحق بالوثيقة)، بترتيب المسرد */
export function termsIn(text) {
  const seen = new Set();
  annotate(text, seen);
  return GLOSSARY.filter((g) => seen.has(g.term));
}
