// ════════════════════════════════════════════════════════════════
// فحص منتج Creem (تصور مصدر السعر، المرحلة 3: الشفافية). منطق خالص بلا قاعدة ولا شبكة
// ════════════════════════════════════════════════════════════════
// يُقرأ المنتج بـ GET /v1/products/{id} (docs.creem.io/api-reference/endpoint/get-product) عند حفظ إعداد الدفع
// وبزر «تحقق من Creem»، ويُحفظ آخر ناتج في payment_settings.creem_check. الحقول المستعملة من ProductEntity:
// billing_type (onetime أو recurring)، currency، tax_mode (inclusive أو exclusive)، mode (test أو prod أو sandbox)،
// status (active أو archived)، price. سعر المنتج معلومة فقط: سعر الإعداد هو المصدر الواحد منذ المرحلة 2 (custom_price).

/** وضع المنتج في Creem بلغة المفتاح: prod حي، وما سواه تجريبي */
export const productMode = (m) => (m == null || m === '' ? null : ['prod', 'live', 'production'].includes(String(m)) ? 'live' : 'test');

// التحذيرات بترتيب ثابت؛ المفتاح ثابت لأنه مفتاح التنبيه (مرة لكل منتج لكل حالة)
export const PRODUCT_WARN = {
  not_found: 'المنتج غير موجود في Creem بهذا المعرّف وهذا المفتاح، فلن تُفتح صفحة الدفع',
  subscription: 'المنتج اشتراك متكرر، والسعر المخصص لا يُقبل إلا لمنتج الدفعة الواحدة، فستفشل صفحة الدفع',
  currency: 'عملة المنتج في Creem غير عملة الإعداد',
  mode: 'وضع المنتج في Creem غير وضع المفتاح',
  archived: 'المنتج مؤرشف في Creem',
};
// ما يُنبَّه به المالك عند الحفظ (البند 4 من المرحلة)
export const ALERT_WARN = ['subscription', 'currency', 'mode'];

/**
 * ناتج قراءة منتج واحد.
 * @param {{status?: number, body?: any, error?: boolean}} res نتيجة الطلب: status وجسم JSON، أو error حين تعذّر الوصول
 * @param {{currency?: string, keyMode?: 'test'|'live'|null}} ctx
 */
export function productCheck(id, res, ctx = {}) {
  if (!id) return null;
  if (!res || res.error || !res.status || res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 429) {
    return { id, state: 'unreachable' };
  }
  if (res.status === 404 || res.status === 400 || !res.body || typeof res.body !== 'object') return { id, state: 'not_found', warnings: ['not_found'] };
  const b = res.body;
  const billing = b.billing_type === 'recurring' ? 'recurring' : b.billing_type === 'onetime' ? 'onetime' : null;
  const tax = ['inclusive', 'exclusive'].includes(b.tax_mode) ? b.tax_mode : null;
  const currency = b.currency ? String(b.currency).toUpperCase() : null;
  const mode = productMode(b.mode);
  const warnings = [];
  if (billing === 'recurring') warnings.push('subscription');
  if (currency && ctx.currency && currency !== String(ctx.currency).toUpperCase()) warnings.push('currency');
  if (mode && ctx.keyMode && mode !== ctx.keyMode) warnings.push('mode');
  if (b.status === 'archived') warnings.push('archived');
  return {
    id, state: 'ok', billing, currency, tax_mode: tax, mode,
    price_cents: Number.isFinite(Number(b.price)) ? Math.round(Number(b.price)) : null,
    status: b.status || null, warnings,
  };
}

/** نمط الضريبة المحفوظ لبند، أو null إن لم يُعرف (فتبقى الجملة العامة) */
export const taxModeOf = (check, item) => {
  const c = check?.[item];
  return c?.state === 'ok' && ['inclusive', 'exclusive'].includes(c.tax_mode) ? c.tax_mode : null;
};
/** عبارة الضريبة للمتدرب وللمساعد من نمط منتج Creem */
export const taxNote = (mode) => (mode === 'exclusive' ? 'يُضاف عليه الضريبة إن وُجدت' : mode === 'inclusive' ? 'شامل الضريبة' : null);

/** الحالات الجديدة التي تستحق تنبيه المالك: ما لم يكن في الفحص السابق للمنتج نفسه */
export function newAlerts(prev, next, items = ['assessment', 'program']) {
  const out = [];
  for (const item of items) {
    const n = next?.[item];
    if (!n || n.state !== 'ok') continue;
    const p = prev?.[item];
    const had = p && p.id === n.id && p.state === 'ok' ? p.warnings || [] : [];
    for (const w of n.warnings || []) if (ALERT_WARN.includes(w) && !had.includes(w)) out.push({ item, product: n.id, warning: w });
  }
  return out;
}
