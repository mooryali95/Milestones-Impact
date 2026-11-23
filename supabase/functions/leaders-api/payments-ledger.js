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
// ── الدفع الزائد: المدفوع قبل الضريبة (order.amount) أعلى من المطلوب. قرار المالك 2026-11-23: يُمنح الحق ويُنبَّه،
// وamount_cents يصير المدفوع الفعلي (الإيراد والاسترداد يقرآنه)، والمطلوب يُحفظ في note بصيغة ثابتة فلا يضيع ──
const OVER_RE = /^overpaid expected=(\d+) paid=(\d+)/;
/** المطلوب والمدفوع حين يزيد المدفوع، وإلا null */
export function overpaidBy(pay, obj) {
  const paid = int(obj?.order?.amount);
  const expected = int(pay?.amount_cents);
  return paid != null && expected != null && paid > expected ? { expected, paid } : null;
}
export const overpaidNote = (o) => `overpaid expected=${o.expected} paid=${o.paid}`;
/** علامة الدفع الزائد من ملاحظة الدفعة: { expected, paid } أو null */
export function overpaidOf(pay) {
  const m = OVER_RE.exec(String(pay?.note || ''));
  return m ? { expected: Number(m[1]), paid: Number(m[2]) } : null;
}
/** ملاحظة آلية لاحقة (استرداد مثلًا) لا تمحو علامة الدفع الزائد */
export function keepOverpaid(prev, next) {
  const m = OVER_RE.exec(String(prev || ''));
  return m ? `${m[0]} · ${next}` : next;
}
/** ما دفعه العميل فعلًا من حمولة checkout.completed: order.amount_paid (شامل الضريبة) وorder.tax_amount.
 * غياب المدفوع الكلي null، فيبقى البريد على المبلغ المسجل ولا يُحسب رقم من تخمين */
export function paidTotal(obj) {
  const total = int(obj?.order?.amount_paid);
  if (total == null || total <= 0) return null;
  const tax = int(obj?.order?.tax_amount);
  return { total, tax: tax != null && tax > 0 ? tax : 0, sub: int(obj?.order?.amount) };
}

/** مبلغ الاسترداد وسببه من إشعار استرداد أو نزاع. صيغة الحمولة تختلف بين النوعين، فتُقرأ بأكثر من اسم */
export function refundFields(obj, type = '') {
  const o = obj || {};
  return {
    refund_cents: int(o.refund_amount ?? o.amount_refunded ?? o.refunded_amount ?? (String(type).startsWith('refund') ? o.amount : null)),
    refund_reason: str(o.reason ?? o.refund_reason ?? (type === 'dispute.created' ? 'نزاع من حامل البطاقة' : null), 200),
  };
}

/** الاسترداد كامل أم جزئي. المسترد يُجمع عبر الإشعارات (كل إشعار استرداد بمعرّفه، وتكراره لا يُعالج مرتين) حتى المدفوع.
 * كامل: ما بلغ المدفوع، أو نزاع (يسحب Creem المبلغ كله)، أو استرداد بلا مبلغ معروف أو لدفعة بلا مبلغ (السلوك السابق
 * الآمن: يُقفل الحق ولا يُترك مفتوحًا على تخمين). جزئي: الدفعة تبقى paid وحقها قائم، والمسترد في refund_cents.
 * @param {{ status?: string, amount_cents?: number|null, refund_cents?: number|null }} pay
 * @param {{ refund_cents: number|null }} rf من refundFields @param {string} type */
export function refundOutcome(pay, rf, type = '') {
  const paid = int(pay?.amount_cents);
  const now = int(rf?.refund_cents);
  // ما استُرد قبل هذا الإشعار: جزئيًا وحده (الدفعة ما زالت مدفوعة)؛ المستردة كاملة لا تُجمع ثانية
  const before = pay?.status === 'paid' ? int(pay?.refund_cents) || 0 : 0;
  // دفعة مستردة كاملة من قبل: أي إشعار بعدها (استرداد بمبلغ أصغر أو نزاع) تكرار للكامل، فلا ينزل
  // refund_cents عما سُجل، ولا يُرسل بريد جزئي عن حق سُحب فعلًا
  if (pay?.status === 'refunded') {
    return { full: true, repeat: true, cents: now ?? paid, total: Math.max(int(pay?.refund_cents) || 0, paid ?? 0, now ?? 0) };
  }
  if (type === 'dispute.created' || now == null || now <= 0 || paid == null || paid <= 0) {
    return { full: true, cents: now ?? paid, total: paid ?? now };
  }
  const total = Math.min(before + now, paid);
  return { full: total >= paid, cents: now, total };
}

// صافي الدفعة المدفوعة بعد ما استُرد منها جزئيًا: الكامل يخرج من الإيراد بحالته، والجزئي يُنقص بمبلغه،
// فيقرأ الإيراد والمسترد بالمعنى نفسه في الحالتين (مدفوعتان 99 واسترداد 20 من إحداهما: 178 · مسترد 20)
export const netCents = (p) => Math.max(0, (int(p?.amount_cents) || 0) - Math.min(int(p?.refund_cents) || 0, int(p?.amount_cents) || 0));
export function revenueKpis(live) {
  const rows = live || [];
  const paid = rows.filter((x) => x?.status === 'paid');
  const full = rows.filter((x) => x?.status === 'refunded').reduce((t, x) => t + (int(x.amount_cents) || 0), 0);
  const partial = paid.reduce((t, x) => t + ((int(x.amount_cents) || 0) - netCents(x)), 0);
  return { revenue_cents: paid.reduce((t, x) => t + netCents(x), 0), refunds_cents: full + partial };
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
  const LOG_AR = { 'payment.partially-refunded': 'استُردّ جزء من الدفعة، وبقي الحق قائمًا', 'payment.held': 'عُلّقت للمراجعة', 'payment.overpaid': 'المدفوع أعلى من المطلوب، ومُنح الحق', 'payment.remind': 'ذُكِّر العميل بإكمال الدفع', 'payment.note': 'ملاحظة إدارية', 'payment.reconcile': 'طوبقت مع Creem', 'payment.expired': 'انتهت صفحة الدفع المتروكة' };
  const partialAr = (h) => `${money(h.after?.refund_cents, pay.currency)} من ${money(h.after?.paid_cents, pay.currency)}، والمسترد كله ${money(h.after?.total_refunded_cents, pay.currency)}`;
  for (const h of log) if (LOG_AR[h.action]) add(h.created_at, h.action === 'payment.held' || h.action === 'payment.partially-refunded' || h.action === 'payment.overpaid' ? 'warn' : 'info', LOG_AR[h.action], h.action === 'payment.held' ? (h.after?.issues || []).join('؛ ') : h.action === 'payment.overpaid' ? `المطلوب ${money(h.after?.expected_cents, h.after?.currency)} والمدفوع ${money(h.after?.paid_cents, h.after?.currency)}` : h.action === 'payment.partially-refunded' ? partialAr(h) : h.actor && h.actor !== 'creem' ? `بواسطة ${h.actor}` : '');
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
