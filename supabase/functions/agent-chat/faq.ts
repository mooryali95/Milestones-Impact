// ════════════════════════════════════════════════════════════════
// الأجوبة الجاهزة: أكثر الأسئلة تكرارًا تُجاب فورًا بلا استدعاء نموذج (لا تكلفة)
// ════════════════════════════════════════════════════════════════
// المطابقة بسيطة ومتحفظة: السؤال قصير (max_words)، وكل مجموعة من match فيها كلمة منه بعد التوحيد.
// ما لا يطابق مطابقة واضحة يذهب إلى النموذج. والجواب بلغة السؤال، والمنتج من الصفحة التي فُتحت منها المحادثة.
import { FAQ } from './knowledge.js';
import { normalizeDigits } from './redact.ts';

export type FaqEntry = { id: string; product: 'any' | 'leaders' | 'matrix'; max_words?: number; match: string[][]; ar: string; en: string };
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

const ENTRIES: { e: FaqEntry; keys: string[][] }[] = (FAQ as FaqEntry[]).map((e) => ({ e, keys: e.match.map((g) => g.map(normalizeText)) }));

export function matchFaq(question: string, page: string): { id: string; text: string; lang: 'ar' | 'en' } | null {
  const norm = normalizeText(question);
  if (!norm) return null;
  const tokens = norm.split(' ');
  const product = productOf(page);
  for (const { e, keys } of ENTRIES) {
    if (tokens.length > (e.max_words ?? 10)) continue;
    if (e.product !== 'any' && e.product !== product) continue;
    const all = keys.every((group) => group.some((k) => (k.includes(' ') ? ` ${norm} `.includes(` ${k} `) : tokens.some((t) => tokenHits(t, k)))));
    if (!all) continue;
    const lang = isArabic(question) ? 'ar' : 'en';
    return { id: e.id, text: lang === 'ar' ? e.ar : e.en, lang };
  }
  return null;
}
