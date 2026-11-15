// ════════════════════════════════════════════════════════════════
// أسعار النماذج والسقف اليومي (قرار المالك: 2 دولار في يوم الرياض)
// ════════════════════════════════════════════════════════════════
// جدول واحد للأسعار بالدولار لكل مليون رمز. راجعه على صفحة الأسعار الرسمية قبل أي تغيير للنموذج أو عند
// تغير الفاتورة: https://platform.claude.com/docs/en/about-claude/pricing
// (أُخذت القيم من مرجع Claude API المرفق بالأداة في 2026-11-15: Haiku 5.5 بسعر 0.10 / 0.50 حتى 100 ألف رمز
// في الطلب، والقراءة من الذاكرة 0.1 من الدخل، والكتابة بمدة 5 دقائق 1.25 منه. وطلباتنا أقل من 100 ألف رمز دائمًا.)
// inference_geo: "us" في كل طلب يضرب السعر في 1.1.
export type Rates = { input: number; output: number; cacheRead: number; cacheWrite: number };
export const PRICES: Record<string, Rates> = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 },
  // نماذج أغلى ما زالت تُخدم: في الجدول ليُعرف سعرها إن ضُبط أحدها، ولترفع سعر الاحتياط إلى أعلاها
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.20, cacheWrite: 10 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
};
export const GEO_US_MULTIPLIER = 1.1;
// النموذج المضبوط يجب أن يكون في الجدول، وإلا فلا استدعاء أصلًا (handler: تنبيه إعداد و«اترك رسالتك»)
export const knownModel = (model: string) => Object.hasOwn(PRICES, model);
// اسم يعيده الخادم ولا يطابق الجدول (لقطة بتاريخ مثلًا) يُحسب بأعلى كل سعر في الجدول: السجل لا يقل عن الفاتورة
export const FALLBACK: Rates = (['input', 'output', 'cacheRead', 'cacheWrite'] as const)
  .reduce((r, k) => ({ ...r, [k]: Math.max(...Object.values(PRICES).map((x) => x[k])) }), {} as Rates);
export const ratesFor = (model: string) => (knownModel(model) ? PRICES[model] : FALLBACK);

export type UsageLike = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

// التكلفة بالميكرو دولار (جزء من مليون دولار): الرمز الواحد بسعر R للمليون = R ميكرو دولار
export function costMicros(model: string, u: UsageLike): number {
  const r = ratesFor(model);
  const raw = (u.input_tokens ?? 0) * r.input + (u.output_tokens ?? 0) * r.output
    + (u.cache_read_input_tokens ?? 0) * r.cacheRead + (u.cache_creation_input_tokens ?? 0) * r.cacheWrite;
  // التقريب قبل السقف يمنع كسور الفاصلة العائمة (110000.00000001 لا يصير 110001)
  return Math.ceil(Math.round(raw * GEO_US_MULTIPLIER * 1000) / 1000);
}

// أسوأ تكلفة للاستدعاء التالي قبل إرساله: البادئة كلها كتابة في الذاكرة، والسجل دخل كامل، والخرج حتى max_tokens
export function worstCaseMicros(model: string, prefixTokens: number, restTokens: number, maxTokens: number): number {
  return costMicros(model, { cache_creation_input_tokens: prefixTokens, input_tokens: restTokens, output_tokens: maxTokens });
}

// تقدير الرموز من الطول، بتحفظ (العربية نحو 2 حرف للرمز، والتقدير يميل إلى الزيادة)
export const estimateTokens = (text: string) => Math.ceil(String(text ?? '').length / 2) + 8;

export type CapState = 'ok' | 'warn' | 'capped';
// warn عند بلوغ 80%، وcapped حين يتجاوز المجموع مع أسوأ تكلفة للتالي السقف
export function capState(spentMicros: number, nextMicros: number, capCents: number): CapState {
  const cap = capCents * 1e4;
  if (spentMicros + nextMicros > cap) return 'capped';
  if (spentMicros >= cap * 0.8) return 'warn';
  return 'ok';
}
