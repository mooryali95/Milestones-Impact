// ════════════════════════════════════════════════════════════════
// القرب من المثال المحلول: تنبيه لا يمنع، يراه المشارك عند الكتابة والمستشار عند التقييم
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md (المرحلة 4ب).
// المثال يُعرض ليُتعلم منه لا ليُنقل. النص الطويل الذي يطابق جواب المثال في أغلب كلماته يُنبَّه عليه،
// والجداول تُقارن صفًا صفًا. منطق خالص بلا محتوى: الأمثلة يمررها من يستدعيه (التطبيقان).
import { norm } from './capstone.js';

export const NEAR_MIN_CHARS = 30;
export const NEAR_RATIO = 0.8;

const words = (t) => norm(t).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

// تشابه الكلمات (جاكارد) بين نصين طويلين، من 0 إلى 1
export function similarity(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

const flat = (v) => (Array.isArray(v) ? v.filter(Array.isArray).map((r) => r.join(' ')).join('\n') : String(v ?? ''));

/** هل الجواب قريب جدًا من جواب المثال للحقل نفسه؟ */
export function nearCopy(answer, example) {
  const a = flat(answer), b = flat(example);
  if (a.trim().length < NEAR_MIN_CHARS || b.trim().length < NEAR_MIN_CHARS) return false;
  if (Array.isArray(answer) && Array.isArray(example)) {
    // جدول: صف منقول يكفي للتنبيه
    const rows = example.filter(Array.isArray).map((r) => r.join(' ')).filter((r) => r.trim().length >= NEAR_MIN_CHARS);
    return answer.filter(Array.isArray).some((r) => { const x = r.join(' '); return x.trim().length >= NEAR_MIN_CHARS && rows.some((y) => similarity(x, y) >= NEAR_RATIO); });
  }
  return similarity(a, b) >= NEAR_RATIO;
}

/**
 * حقول الوثيقة القريبة جدًا من أي مثال محلول
 * @param {{ sections?: any[] }} doc الوثيقة كما يبنيها الخادم
 * @param {any[]} examples الأمثلة المحلولة بصيغة الوثيقة نفسها
 */
export function copiedFromExamples(doc, examples) {
  const out = [];
  for (const s of doc?.sections || []) {
    for (const f of s.fields || []) {
      for (const ex of examples || []) {
        const ef = (ex.sections || []).find((x) => x.key === s.key)?.fields?.find((x) => x.key === f.key);
        if (ef && nearCopy(f.value, ef.value)) { out.push({ chapter: s.title, field: f.label, sector: ex.sector_title }); break; }
      }
    }
  }
  return out;
}
