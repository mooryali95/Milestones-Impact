// ════════════════════════════════════════════════════════════════
// سجل المدفوعات: ما يُستخرج من إشعار Creem، والخط الزمني للعملية، ومفاتيح البريد (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// السجل هو جدول payments نفسه (المصدر الواحد)، وهذه الحقول أعمدة فيه تُملأ من الإشعار المحفوظ بنصه في payment_events.
// الحقول من حمولة checkout.completed الحقيقية (2026-11-13): object.order.{sub_total, tax_amount, transaction}،
// وobject.customer.{name, country}. ما لا يرسله Creem (رسومه والصافي، وسيلة الدفع، رابط الإيصال) يبقى في لوحته.

const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);
const str = (v, max = 200) => (v == null || v === '' ? null : String(v).trim().slice(0, max) || null);
const idOf = (v) => (typeof v === 'string' ? v : v?.id) || null;

/** أعمدة السجل من حمولة دفع مؤكد. الغائب null ولا يُخمَّن */
export function ledgerFields(obj) {
  const o = obj || {};
  return {
    subtotal_cents: int(o.order?.sub_total), tax_cents: int(o.order?.tax_amount),
    country: str(o.customer?.country, 8), customer_name: str(o.customer?.name, 120),
    transaction_id: str(idOf(o.order?.transaction), 80),
  };
}
/** مبلغ الاسترداد وسببه من إشعار استرداد أو نزاع. صيغة الحمولة تختلف بين النوعين، فتُقرأ بأكثر من اسم */
export function refundFields(obj, type = '') {
  const o = obj || {};
  return {
    refund_cents: int(o.refund_amount ?? o.amount_refunded ?? o.refunded_amount ?? (String(type).startsWith('refund') ? o.amount : null)),
    refund_reason: str(o.reason ?? o.refund_reason ?? (type === 'dispute.created' ? 'نزاع من حامل البطاقة' : null), 200),
  };
}

// ── مفاتيح البريد: كلها مغلقة حتى يفتحها المدير (قرار المالك 2026-11-13) ──
export const NOTIFY = {
  receipt: { label: 'تأكيد الدفع للعميل', hint: 'بريد من المنصة عند كل دفعة مؤكدة: البند والمبلغ ورقم الطلب وخطوته التالية.' },
  refund: { label: 'إشعار الاسترداد للعميل', hint: 'بريد عند استرداد دفعته: المبلغ وما أُقفل بسببه.' },
  owner: { label: 'تنبيه الإدارة عند كل دفعة', hint: 'بريد إلى بريد تنبيهات المنصة عند كل دفعة مؤكدة أو مستردة.' },
};
export const NOTIFY_KEYS = Object.keys(NOTIFY);
/** المحفوظ: المفاتيح المعروفة بقيم منطقية وحدها، والغائب مغلق */
export const cleanNotify = (v) => Object.fromEntries(NOTIFY_KEYS.map((k) => [k, !!(v && typeof v === 'object' && v[k] === true)]));

// ── صفحات الدفع المتروكة ──
export const ABANDON_AFTER_MIN = 60;   // معلّقة أقدم من ساعة = تُركت
export const EXPIRE_AFTER_DAYS = 3;    // وبعدها تُعلَّم «انتهت» فلا تبقى معلّقة إلى الأبد
export const REMIND_GAP_HOURS = 24;    // لا يُذكَّر العميل نفسه مرتين في أقل منها
export const isAbandoned = (p, now = Date.now()) => p?.status === 'pending' && now - Date.parse(p.created_at) > ABANDON_AFTER_MIN * 6e4;
export const isExpirable = (p, now = Date.now()) => p?.status === 'pending' && now - Date.parse(p.created_at) > EXPIRE_AFTER_DAYS * 864e5;

// ── الخط الزمني: ما جرى للعملية بترتيبه، من صفها وإشعاراتها وما مُنح بها ──
export const PAY_EVENT_AR = { 'checkout.completed': 'إشعار Creem: اكتمل الدفع', 'refund.created': 'إشعار Creem: استرداد', 'dispute.created': 'إشعار Creem: نزاع على الدفعة' };
export const payEventAr = (type) => PAY_EVENT_AR[type] || `إشعار Creem: ${type}`;
/** @param {any} pay @param {any[]} [events] @param {any[]} [ents] @param {any[]} [log] سجل التدقيق لهذه العملية */
export function paymentTimeline(pay, events = [], ents = [], log = []) {
  const rows = [];
  const add = (at, tone, text, detail = '') => { if (at) rows.push({ at, tone, text, detail }); };
  add(pay.created_at, 'info', 'فُتحت صفحة الدفع');
  for (const e of events) add(e.received_at, e.error ? 'bad' : 'info', payEventAr(e.type), e.error ? `تعذّرت معالجته: ${e.error}` : e.processed_at ? 'عولج' : 'لم يُعالج بعد');
  add(pay.paid_at, 'ok', 'تأكد الدفع');
  for (const g of ents) {
    add(g.created_at, 'ok', 'مُنح الحق');
    add(g.revoked_at, 'warn', 'سُحب الحق', g.revoked_by ? `بواسطة ${g.revoked_by}` : '');
  }
  add(pay.receipt_sent_at, 'info', 'أُرسل تأكيد الدفع للعميل');
  add(pay.refunded_at, 'warn', 'استُردّت الدفعة', pay.refund_reason || '');
  const LOG_AR = { 'payment.held': 'عُلّقت للمراجعة', 'payment.remind': 'ذُكِّر العميل بإكمال الدفع', 'payment.note': 'ملاحظة إدارية', 'payment.reconcile': 'طوبقت مع Creem', 'payment.expired': 'انتهت صفحة الدفع المتروكة' };
  for (const h of log) if (LOG_AR[h.action]) add(h.created_at, h.action === 'payment.held' ? 'warn' : 'info', LOG_AR[h.action], h.action === 'payment.held' ? (h.after?.issues || []).join('؛ ') : h.actor && h.actor !== 'creem' ? `بواسطة ${h.actor}` : '');
  return rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// ── التواصل مع العميل ──
/** رابط واتساب من جوال سعودي أو دولي. غير الصالح null فلا يظهر الزر */
export function whatsappUrl(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (/^05\d{8}$/.test(d)) d = `966${d.slice(1)}`;
  return /^\d{9,15}$/.test(d) ? `https://wa.me/${d}` : null;
}
export const money = (cents, cur = 'USD') => (cents == null ? '' : `${(Number(cents) / 100).toFixed(2)} ${cur || 'USD'}`);
/** رابط الطلب في لوحة Creem لما لا يصلنا (الرسوم والإيصال) */
export const creemOrderUrl = (pay) => (pay?.order_id ? `https://www.creem.io/dashboard/orders/${encodeURIComponent(pay.order_id)}` : null);
