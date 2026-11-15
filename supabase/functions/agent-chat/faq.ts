// ════════════════════════════════════════════════════════════════
// الأجوبة الجاهزة: أكثر الأسئلة تكرارًا تُجاب فورًا بلا استدعاء نموذج (لا تكلفة)
// ════════════════════════════════════════════════════════════════
// المطابقة بسيطة ومتحفظة: السؤال قصير (max_words)، وكل مجموعة من match فيها كلمة منه بعد التوحيد، ولا كلمة من not.
// وفي only كل كلمة من السؤال يجب أن تكون من المجموعة (التحية وحدها لا تبتلع سؤالًا بعدها). والسؤال المركب (علامتا
// استفهام) لا يُجاب جاهزًا. ما لا يطابق مطابقة واضحة يذهب إلى النموذج. والجواب بلغة السؤال، والمنتج هو ما سماه
// الزائر صراحة، وإلا فمنتج الصفحة التي فُتحت منها المحادثة؛ وإن سمى المنتجين فلا جواب جاهز لمنتج بعينه.
import { FAQ } from './knowledge.js';
import { normalizeDigits } from './redact.ts';

export type FaqEntry = { id: string; product: 'any' | 'leaders' | 'matrix'; max_words?: number; match: string[][]; not?: string[]; only?: boolean; ar: string; en: string };
export type Product = 'leaders' | 'matrix' | 'shared';

// المنتج من صفحة الموقع (data-product): صفحة البرنامج للقادة، والأسعار ووثائق الموقع للمصفوفة، وما سواها مشترك
export function productOf(page: string): Product {
  if (page === 'MI-LEADERS') return 'leaders';
  if (page === 'MI-PRICING' || page === 'MI-LEGAL') return 'matrix';
  return 'shared';
}

// توحيد عربي: بلا تشكيل ولا تطويل، والألفات ألف، والتاء المربوطة هاء، والألف المقصورة ياء
export function normalizeText(s: string) {
  return normalizeDigits(String(s ?? '')).toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

const PREFIXES = ['', 'ال', 'وال', 'بال', 'لل', 'فال', 'و', 'ب', 'ل', 'ف', 'ك'];
const SUFFIXES = ['', 's', 'ي', 'نا', 'كم', 'ه', 'ها'];
function tokenHits(token: string, key: string) {
  for (const p of PREFIXES) {
    if (!token.startsWith(p)) continue;
    const rest = token.slice(p.length);
    for (const x of SUFFIXES) if (rest === key + x) return true;
  }
  return false;
}

export function isArabic(s: string) {
  const ar = (s.match(/[؀-ۿ]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  return ar > 0 && ar >= lat;
}

const ENTRIES: { e: FaqEntry; keys: string[][]; not: string[] }[] = (FAQ as FaqEntry[]).map((e) => ({ e, keys: e.match.map((g) => g.map(normalizeText)), not: (e.not ?? []).map(normalizeText) }));

const hasKey = (norm: string, tokens: string[], k: string) => (k.includes(' ') ? ` ${norm} `.includes(` ${k} `) : tokens.some((t) => tokenHits(t, k)));
// هل في السؤال كلمة من القائمة بمطابقة الكلمة نفسها (سوابقها ولواحقها المعروفة)، أو عبارة متصلة إن كان فيها مسافة
export function hasWord(question: string, words: string[]) {
  const norm = normalizeText(question);
  const tokens = norm.split(' ');
  return words.map(normalizeText).some((k) => hasKey(norm, tokens, k));
}
const LEADERS_WORDS = ['قاده', 'leaders', 'leader'].map(normalizeText);
const MATRIX_WORDS = ['مصفوفه', 'matrix'].map(normalizeText);
// «البرنامج» مع ذكر المصفوفة مقارنة بين المنتجين (أو خلط بينهما): لا جواب جاهز لأحدهما
const PROGRAM_WORDS = ['برنامج', 'program', 'programme'].map(normalizeText);
// المنتج الذي سماه الزائر: leaders أو matrix، أو both، أو null
export function mentionedProduct(question: string): 'leaders' | 'matrix' | 'both' | null {
  const norm = normalizeText(question);
  const tokens = norm.split(' ');
  const m = MATRIX_WORDS.some((k) => hasKey(norm, tokens, k));
  const l = LEADERS_WORDS.some((k) => hasKey(norm, tokens, k)) || (m && PROGRAM_WORDS.some((k) => hasKey(norm, tokens, k)));
  return l && m ? 'both' : l ? 'leaders' : m ? 'matrix' : null;
}

export function matchFaq(question: string, page: string): { id: string; text: string; lang: 'ar' | 'en' } | null {
  const norm = normalizeText(question);
  if (!norm) return null;
  if ((String(question).match(/[?؟]/g) || []).length >= 2) return null;
  const tokens = norm.split(' ');
  const named = mentionedProduct(question);
  const product = named === 'both' ? null : (named ?? productOf(page));
  for (const { e, keys, not } of ENTRIES) {
    if (tokens.length > (e.max_words ?? 10)) continue;
    if (e.product !== 'any' && e.product !== product) continue;
    const all = keys.every((group) => group.some((k) => hasKey(norm, tokens, k)));
    if (!all) continue;
    if (not.some((k) => hasKey(norm, tokens, k))) continue;
    if (e.only && !tokens.every((t) => keys.some((g) => g.some((k) => !k.includes(' ') && tokenHits(t, k))))) continue;
    const lang = isArabic(question) ? 'ar' : 'en';
    return { id: e.id, text: lang === 'ar' ? e.ar : e.en, lang };
  }
  return null;
}
