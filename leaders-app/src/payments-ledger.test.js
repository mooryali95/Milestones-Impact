// سجل المدفوعات: ما يُستخرج من إشعار Creem، ومفاتيح البريد المغلقة أصلًا، والخط الزمني، والتواصل
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanNotify, creemOrderUrl, isAbandoned, isExpirable, ledgerFields, money, NOTIFY_KEYS, paymentTimeline, refundFields, whatsappUrl,
} from '../../supabase/functions/leaders-api/payments-ledger.js';

const src = (p) => readFileSync(join(process.cwd(), p), 'utf8');
// صيغة حمولة checkout.completed الحقيقية (2026-11-13) بقيم مصطنعة
const paid = {
  customer: { id: 'cust_1', name: 'Sara A', email: 's@example.com', country: 'SA' },
  order: { id: 'ord_1', amount: 199, sub_total: 199, tax_amount: 0, amount_paid: 199, currency: 'USD', transaction: 'tran_1' },
  metadata: { item: 'assessment', payment_id: 'x' }, mode: 'prod',
};

describe('ما يُحفظ من الإشعار', () => {
  it('يقرأ المبلغ قبل الضريبة والضريبة والبلد والاسم ورقم المعاملة', () => {
    expect(ledgerFields(paid)).toEqual({ subtotal_cents: 199, tax_cents: 0, country: 'SA', customer_name: 'Sara A', transaction_id: 'tran_1' });
  });
  it('المعاملة قد تأتي كائنًا، والغائب null بلا تخمين', () => {
    expect(ledgerFields({ order: { transaction: { id: 'tran_9' } } }).transaction_id).toBe('tran_9');
    expect(ledgerFields(null)).toEqual({ subtotal_cents: null, tax_cents: null, country: null, customer_name: null, transaction_id: null });
    expect(ledgerFields({ order: { sub_total: '' } }).subtotal_cents).toBeNull();
  });
  it('الاسترداد: المبلغ والسبب، والنزاع يُسمّى', () => {
    expect(refundFields({ refund_amount: 199, reason: 'requested_by_customer' }, 'refund.created')).toEqual({ refund_cents: 199, refund_reason: 'requested_by_customer' });
    expect(refundFields({ amount: 150 }, 'refund.created').refund_cents).toBe(150);
    expect(refundFields({ amount: 150 }, 'dispute.created')).toEqual({ refund_cents: null, refund_reason: 'نزاع من حامل البطاقة' });
  });
});

describe('مفاتيح البريد', () => {
  it('الأصل مغلق: الغائب والقيمة غير المنطقية false، والمفتاح المجهول يسقط', () => {
    expect(cleanNotify(undefined)).toEqual({ receipt: false, refund: false, owner: false });
    expect(cleanNotify({ receipt: true, refund: 'yes', other: true })).toEqual({ receipt: true, refund: false, owner: false });
    expect(NOTIFY_KEYS).toEqual(['receipt', 'refund', 'owner']);
  });
  it('لا بريد دفع آلي في الخادم إلا خلف مفتاحه', () => {
    const s = src('supabase/functions/leaders-api/payments.ts');
    // كل سطر يرسل بريد دفع آليًّا يبدأ بشرط مفتاحه
    const gate = { paymentReceiptMail: 'on.receipt', paymentRefundMail: 'on.refund', paymentOwnerMail: 'on.owner' };
    for (const [mail, key] of Object.entries(gate)) {
      const lines = s.split('\n');
      const at = lines.map((l, i) => (l.includes(`${mail}(`) ? i : -1)).filter((i) => i >= 0);
      expect(at.length, mail).toBeGreaterThan(0);
      // الشرط في السطر نفسه أو في فاتحة كتلته قبله بسطرين على الأكثر
      for (const i of at) expect(lines.slice(Math.max(0, i - 2), i + 1).some((l) => l.trim().startsWith(`if (${key} &&`)), `${mail} سطر ${i + 1}`).toBe(true);
    }
    // التذكير فعل يدوي من المدير وحده: لا يُستدعى من المهمة الدورية
    const expire = s.slice(s.indexOf('export async function expireAbandoned'));
    expect(expire.slice(0, expire.indexOf('\n}\n'))).not.toContain('paymentAbandonMail');
  });
});

describe('الصفحات المتروكة', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  it('معلّقة أقدم من ساعة متروكة، وأقدم من ثلاثة أيام تنتهي', () => {
    expect(isAbandoned({ status: 'pending', created_at: '2026-11-14T11:30:00Z' }, now)).toBe(false);
    expect(isAbandoned({ status: 'pending', created_at: '2026-11-14T10:30:00Z' }, now)).toBe(true);
    expect(isAbandoned({ status: 'paid', created_at: '2026-11-10T10:30:00Z' }, now)).toBe(false);
    expect(isExpirable({ status: 'pending', created_at: '2026-11-12T10:30:00Z' }, now)).toBe(false);
    expect(isExpirable({ status: 'pending', created_at: '2026-11-10T10:30:00Z' }, now)).toBe(true);
  });
});

describe('الخط الزمني', () => {
  it('يرتب ما جرى زمنيًّا من الصف والإشعارات والحقوق والتدقيق', () => {
    const t = paymentTimeline(
      { created_at: '2026-11-13T19:00:00Z', paid_at: '2026-11-13T19:02:00Z', refunded_at: '2026-11-14T09:00:00Z', refund_reason: 'طلب العميل' },
      [{ type: 'checkout.completed', received_at: '2026-11-13T19:01:59Z', processed_at: '2026-11-13T19:02:00Z' }],
      [{ created_at: '2026-11-13T19:02:01Z', revoked_at: '2026-11-14T09:00:01Z', revoked_by: 'creem' }],
      [{ action: 'payment.remind', actor: 'a@x.com', created_at: '2026-11-13T19:01:00Z' }, { action: 'unknown.thing', created_at: '2026-11-13T19:01:30Z' }],
    );
    expect(t.map((r) => r.text)).toEqual(['فُتحت صفحة الدفع', 'ذُكِّر العميل بإكمال الدفع', 'إشعار Creem: اكتمل الدفع', 'تأكد الدفع', 'مُنح الحق', 'استُردّت الدفعة', 'سُحب الحق']);
    expect(t[5].detail).toBe('طلب العميل');
  });
  it('الإشعار المتعثر يظهر بخطئه', () => {
    const t = paymentTimeline({ created_at: '2026-11-13T19:00:00Z' }, [{ type: 'refund.created', received_at: '2026-11-13T20:00:00Z', error: 'boom' }]);
    expect(t[1]).toMatchObject({ tone: 'bad', text: 'إشعار Creem: استرداد', detail: 'تعذّرت معالجته: boom' });
  });
});

describe('التواصل والعرض', () => {
  it('واتساب: المحلي السعودي والدولي، وغير الصالح بلا رابط', () => {
    expect(whatsappUrl('0501234567')).toBe('https://wa.me/966501234567');
    expect(whatsappUrl('+966 50 123 4567')).toBe('https://wa.me/966501234567');
    expect(whatsappUrl('00201001234567')).toBe('https://wa.me/201001234567');
    expect(whatsappUrl('0500')).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
  it('المبلغ ورابط Creem', () => {
    expect(money(199, 'USD')).toBe('1.99 USD');
    expect(money(null)).toBe('');
    expect(creemOrderUrl({ order_id: 'ord_1' })).toContain('ord_1');
    expect(creemOrderUrl({})).toBeNull();
  });
});
