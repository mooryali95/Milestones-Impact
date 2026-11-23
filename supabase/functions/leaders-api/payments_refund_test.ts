// استرداد Creem على قاعدة مزيفة بحالتها وشبكة محاكاة: الكامل يسحب الحق ويعلّم الدفعة مستردة ويرسل بريد الاسترداد،
// والجزئي يبقي الدفعة مدفوعة وحقها قائمًا ويجمع المسترد في refund_cents ويرسل بريده الجزئي، وما بلغ المدفوع منه كامل.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const { webhook } = await import('./payments.ts');
const { CONFIG, db } = await import('./core.ts');
const { noticesIdle } = await import('./notify.ts');
const { refundOutcome, paymentTimeline, revenueKpis, netCents } = await import('./payments-ledger.js');

const SECRET = 'whsec-test';
async function sign(raw: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Row = Record<string, any>;
// جداول بحالتها: الفلاتر eq وis وin تُطبق على القراءة والتحديث، وما سواها يُتجاهل
function install(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const st = { op: 'select', payload: null as any, filters: [] as ((r: Row) => boolean)[], single: false, head: false };
    const rows = () => (tables[table] ||= []);
    const exec = () => {
      const hit = rows().filter((r) => st.filters.every((f) => f(r)));
      if (st.op === 'insert') {
        const list = ([] as Row[]).concat(st.payload);
        if (table === 'payment_events' && list.some((x) => rows().some((r) => r.event_id === x.event_id))) return { error: { code: '23505', message: 'duplicate' } };
        rows().push(...list.map((x) => ({ ...x })));
        return { error: null };
      }
      if (st.op === 'update') { hit.forEach((r) => Object.assign(r, st.payload)); return { error: null }; }
      if (st.head) return { data: null, count: table === 'mail_events' ? 0 : hit.length, error: null };
      return { data: st.single ? (hit[0] ?? null) : hit, count: hit.length, error: null };
    };
    const q: any = new Proxy({}, {
      get(_t, k: string) {
        if (k === 'then') return (ok: any, bad: any) => Promise.resolve().then(exec).then(ok, bad);
        return (...a: any[]) => {
          if (k === 'insert' || k === 'update') { st.op = k; st.payload = a[0]; }
          else if (k === 'select' && a[1]?.head) st.head = true;
          else if (k === 'eq') st.filters.push((r) => r[a[0]] === a[1]);
          else if (k === 'is') st.filters.push((r) => (r[a[0]] ?? null) === a[1]);
          else if (k === 'in') st.filters.push((r) => (a[1] as unknown[]).includes(r[a[0]]));
          else if (k === 'maybeSingle' || k === 'single') st.single = true;
          return q;
        };
      },
    });
    return q;
  };
  const saved = (db as any).schema;
  Object.assign(db as any, { from, schema: () => ({ from }) });
  return () => { delete (db as any).from; (db as any).schema = saved; };
}

async function withMail<T>(fn: (mails: { to: string[]; subject: string; html: string }[]) => Promise<T>) {
  const real = globalThis.fetch;
  const mails: any[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    if (String(url).includes('resend.com')) { mails.push(JSON.parse(String(init?.body))); return Promise.resolve(new Response('{"id":"re_1"}', { status: 200 })); }
    return Promise.resolve(new Response('ok', { status: 200 }));
  }) as typeof fetch;
  try { return await fn(mails); } finally { globalThis.fetch = real; }
}

const PAY_ID = '11111111-2222-4333-8444-555555555555';
const world = (over: Row = {}): Record<string, Row[]> => ({
  payments: [{ id: PAY_ID, participant_id: 'p1', item: 'program', status: 'paid', amount_cents: 9900, currency: 'USD', mode: 'live', order_id: 'ord_1', checkout_id: 'ch_1', email: 'sara@example.com', refund_cents: null, ...over }],
  entitlements: [{ id: 'e1', participant_id: 'p1', item: 'program', source: 'paid', payment_id: PAY_ID, revoked_at: null }],
  participants: [{ id: 'p1', full_name: 'سارة', email: 'sara@example.com' }],
  payment_settings: [{ id: true, enabled: true, currency: 'USD', notify: { refund: true, owner: true } }],
  certificates: [{ id: 'cert1', participant_id: 'p1', status: 'valid' }],
  payment_events: [], audit_log: [], mail_events: [],
});
const refundEvent = (id: string, amount: number | null, type = 'refund.created') => {
  const raw = JSON.stringify({ id, eventType: type, object: { id: `ref_${id}`, order: 'ord_1', checkout: 'ch_1', ...(amount == null ? {} : { refund_amount: amount }), reason: 'طلب العميل' } });
  return raw;
};
// إشعار المالك بالدفعة يُطلق بلا انتظار (ownerNoticeLater) فلا يتأخر رد الخطاف، والاختبار ينتظره
async function send(raw: string) { const r = await webhook(raw, new Headers({ 'creem-signature': await sign(raw) })); await noticesIdle(); return r; }

function setupEnv() {
  Deno.env.set('CREEM_WEBHOOK_SECRET', SECRET);
  const saved = { resendKey: CONFIG.resendKey, alertEmail: CONFIG.alertEmail };
  Object.assign(CONFIG, { resendKey: 're_test', alertEmail: 'owner@example.com' });
  return () => Object.assign(CONFIG, saved);
}

Deno.test('refundOutcome: الكامل والجزئي والمجموع والنزاع والمبلغ المجهول', () => {
  const pay = { status: 'paid', amount_cents: 9900, refund_cents: null };
  assertEquals(refundOutcome(pay, { refund_cents: 9900 }, 'refund.created'), { full: true, cents: 9900, total: 9900 });
  assertEquals(refundOutcome(pay, { refund_cents: 2000 }, 'refund.created'), { full: false, cents: 2000, total: 2000 });
  // جزئي سابق يُجمع، وما بلغ المدفوع كامل، ولا يتجاوز المدفوع
  assertEquals(refundOutcome({ ...pay, refund_cents: 2000 }, { refund_cents: 3000 }, 'refund.created'), { full: false, cents: 3000, total: 5000 });
  assertEquals(refundOutcome({ ...pay, refund_cents: 5000 }, { refund_cents: 9000 }, 'refund.created'), { full: true, cents: 9000, total: 9900 });
  // النزاع كامل دائمًا، والمبلغ المجهول كامل (السلوك السابق الآمن)
  assertEquals(refundOutcome(pay, { refund_cents: 100 }, 'dispute.created').full, true);
  assertEquals(refundOutcome(pay, { refund_cents: null }, 'refund.created'), { full: true, cents: 9900, total: 9900 });
  // دفعة مستردة كاملة: الإشعار اللاحق تكرار للكامل، فلا ينزل المسترد ولا يصير جزئيًا
  assertEquals(refundOutcome({ ...pay, status: 'refunded', refund_cents: 9900 }, { refund_cents: 100 }, 'refund.created'), { full: true, repeat: true, cents: 100, total: 9900 });
  assertEquals(refundOutcome({ ...pay, status: 'refunded', refund_cents: null }, { refund_cents: 2000 }, 'refund.created'), { full: true, repeat: true, cents: 2000, total: 9900 });
});

Deno.test('استرداد كامل: الدفعة مستردة، والحق مسحوب، والشهادة ملغاة، وأثر في السجل، وبريد الاسترداد للعميل والإدارة', async () => {
  const restoreEnv = setupEnv();
  const t = world();
  const restore = install(t);
  try {
    await withMail(async (mails) => {
      const r: any = await send(refundEvent('evt_full', 9900));
      assertEquals(r.success, true);
      const pay = t.payments[0];
      assertEquals([pay.status, pay.refund_cents, pay.refund_reason, !!pay.refunded_at], ['refunded', 9900, 'طلب العميل', true]);
      assert(t.entitlements[0].revoked_at, 'الحق مسحوب');
      assertEquals(t.entitlements[0].revoked_by, 'creem');
      assertEquals(t.certificates[0].status, 'revoked');
      const log = t.audit_log.find((a) => a.action === 'payment.refunded');
      assertEquals(log?.after, { refund_cents: 9900, total_refunded_cents: 9900, paid_cents: 9900 });
      assertEquals(t.audit_log.some((a) => a.action === 'payment.partially-refunded'), false);
      assertEquals(mails.map((m) => m.subject).sort(), ['استُردّت دفعتك', 'دفعة مستردة'].sort());
      const toClient = mails.find((m) => m.to[0] === 'sara@example.com')!;
      assert(toClient.html.includes('99.00 USD'));
      assert(toClient.html.includes('أُقفل ما فتحه'));
      assert(t.payment_events[0].processed_at);
      // الإشعار نفسه مكررًا: لا معالجة ثانية ولا بريد
      assertEquals(((await send(refundEvent('evt_full', 9900))) as any).duplicate, true);
      assertEquals(mails.length, 2);
    });
  } finally { restore(); restoreEnv(); }
});

Deno.test('استرداد جزئي: الدفعة تبقى مدفوعة وحقها قائم، والمسترد يُجمع، وبريد جزئي، ثم ما بلغ المدفوع يصير كاملًا', async () => {
  const restoreEnv = setupEnv();
  const t = world();
  const restore = install(t);
  try {
    await withMail(async (mails) => {
      await send(refundEvent('evt_p1', 2000));
      const pay = t.payments[0];
      assertEquals([pay.status, pay.refund_cents, pay.refunded_at ?? null, pay.note], ['paid', 2000, null, 'refund.created partial']);
      assertEquals(t.entitlements[0].revoked_at, null);
      assertEquals(t.certificates[0].status, 'valid');
      assertEquals(t.audit_log.filter((a) => a.action === 'payment.partially-refunded').map((a) => a.after), [{ refund_cents: 2000, total_refunded_cents: 2000, paid_cents: 9900 }]);
      assertEquals(t.audit_log.some((a) => a.action === 'payment.refunded'), false);
      assertEquals(mails.map((m) => m.subject).sort(), ['استرداد جزئي', 'استُردّ جزء من دفعتك'].sort());
      const toClient = mails.find((m) => m.to[0] === 'sara@example.com')!;
      assert(toClient.html.includes('20.00 USD') && toClient.html.includes('99.00 USD'));
      assert(!toClient.html.includes('أُقفل'), 'الحق باقٍ فلا يقول البريد أُقفل');

      // جزئي ثانٍ يُجمع
      await send(refundEvent('evt_p2', 3000));
      assertEquals([pay.status, pay.refund_cents], ['paid', 5000]);
      assertEquals(t.entitlements[0].revoked_at, null);

      // الباقي: المجموع بلغ المدفوع فصار كاملًا
      await send(refundEvent('evt_p3', 4900));
      assertEquals([pay.status, pay.refund_cents], ['refunded', 9900]);
      assert(t.entitlements[0].revoked_at);
      assertEquals(t.certificates[0].status, 'revoked');
      assertEquals(t.audit_log.find((a) => a.action === 'payment.refunded')?.after, { refund_cents: 4900, total_refunded_cents: 9900, paid_cents: 9900 });
      assertEquals(mails.filter((m) => m.subject === 'استُردّت دفعتك').length, 1);

      // الخط الزمني يذكر الجزئيين بمبالغهما
      const tl = paymentTimeline(pay, [], [], t.audit_log.map((a) => ({ ...a, created_at: '2026-11-16T09:00:00Z' })));
      const partials = tl.filter((x: any) => x.text.startsWith('استُردّ جزء'));
      assertEquals(partials.length, 2);
      assert(partials[0].detail.includes('20.00 USD من 99.00 USD'));
    });
  } finally { restore(); restoreEnv(); }
});

Deno.test('نزاع بعد استرداد جزئي: كامل، والحق مسحوب', async () => {
  const restoreEnv = setupEnv();
  const t = world({ refund_cents: 2000 });
  const restore = install(t);
  try {
    await withMail(async () => {
      await send(refundEvent('evt_d', 9900, 'dispute.created'));
      assertEquals(t.payments[0].status, 'refunded');
      assert(t.entitlements[0].revoked_at);
    });
  } finally { restore(); restoreEnv(); }
});

Deno.test('استرداد بمبلغ أصغر بعد استرداد كامل (نزاع): تكرار للكامل، لا ينزل المسترد ولا بريد جزئي', async () => {
  const restoreEnv = setupEnv();
  const t = world();
  const restore = install(t);
  try {
    await withMail(async (mails) => {
      await send(refundEvent('evt_d1', null, 'dispute.created'));
      const pay = t.payments[0];
      assertEquals([pay.status, pay.refund_cents], ['refunded', 9900]);
      const sent = mails.length;
      await send(refundEvent('evt_r2', 2000));
      assertEquals([pay.status, pay.refund_cents, pay.note], ['refunded', 9900, 'refund.created']);
      assertEquals(mails.length, sent, 'لا بريد ثانٍ');
      assertEquals(mails.some((m) => m.subject === 'استُردّ جزء من دفعتك' || m.subject === 'استرداد جزئي'), false);
      assertEquals(t.audit_log.some((a) => a.action === 'payment.partially-refunded'), false);
      assertEquals(t.audit_log.filter((a) => a.action === 'payment.refunded').at(-1)?.after?.repeat, true);
    });
  } finally { restore(); restoreEnv(); }
});

Deno.test('revenueKpis: الإيراد صافٍ بعد الجزئي، والكامل يخرج منه، والمسترد يجمع الاثنين بالمعنى نفسه', () => {
  const p = (o: Row) => ({ status: 'paid', amount_cents: 9900, refund_cents: null, ...o });
  assertEquals(revenueKpis([p({}), p({ refund_cents: 2000 })]), { revenue_cents: 17800, refunds_cents: 2000 });
  assertEquals(revenueKpis([p({}), p({ status: 'refunded', refund_cents: 9900 })]), { revenue_cents: 9900, refunds_cents: 9900 });
  assertEquals(revenueKpis([p({ status: 'pending' })]), { revenue_cents: 0, refunds_cents: 0 });
  // مسترد مسجل أكبر من المدفوع لا يجعل الصافي سالبًا
  assertEquals(netCents(p({ refund_cents: 12000 })), 0);
  assertEquals(revenueKpis([]), { revenue_cents: 0, refunds_cents: 0 });
});

// ── الدفع الزائد (المرحلة 1 من تصور مصدر السعر، 2026-11-23): يُمنح الحق، وتُعلَّم الدفعة بالمطلوب والمدفوع، وتنبيه واحد ──
const paidEvent = (id: string, payId: string, order: Row) => JSON.stringify({ id, eventType: 'checkout.completed', object: {
  id: 'ch_over', request_id: payId, mode: 'prod', product: { id: 'prod_a' }, customer: { id: 'cus_1', country: 'SA', name: 'Sara' },
  order: { id: 'ord_over', currency: 'USD', product: 'prod_a', ...order },
} });
const pendingWorld = (payId: string, over: Row = {}): Record<string, Row[]> => ({
  ...world(),
  payments: [{ id: payId, participant_id: 'p1', item: 'assessment', status: 'pending', amount_cents: 100, currency: 'USD', mode: 'live', product_id: 'prod_a', checkout_id: 'ch_over', email: 'sara@example.com', note: null, ...over }],
  entitlements: [],
  payment_settings: [{ id: true, enabled: true, currency: 'USD', notify: { receipt: true, owner: true } }],
});

Deno.test('دفع زائد: يُمنح الحق، والمطلوب محفوظ في note، وأثر payment.overpaid، وتنبيه مرة واحدة مع إعادة الإشعار', async () => {
  const restoreEnv = setupEnv();
  const id = '21111111-2222-4333-8444-555555555555';
  const t = pendingWorld(id);
  const restore = install(t);
  try {
    await withMail(async (mails) => {
      const raw = paidEvent('evt_over_1', id, { amount: 199, sub_total: 199, tax_amount: 30, amount_paid: 229 });
      assertEquals((await send(raw) as any).success, true);
      const pay = t.payments[0];
      assertEquals([pay.status, pay.amount_cents, pay.note], ['paid', 199, 'overpaid expected=100 paid=199']);
      assertEquals([pay.subtotal_cents, pay.tax_cents], [199, 30]);
      assertEquals(t.entitlements.map((e) => [e.item, e.source]), [['assessment', 'paid']]);
      assertEquals(t.audit_log.filter((a) => a.action === 'payment.overpaid').map((a) => a.after), [{ expected_cents: 100, paid_cents: 199, currency: 'USD' }]);
      const alerts = () => t.audit_log.filter((a) => a.action === 'system.alert' && a.entity_id === `payment_mismatch:${id}`);
      assertEquals(alerts().length, 1);
      assert(String(alerts()[0].after.issues[0]).includes('أعلى من 100'));
      const owner = mails.find((m) => m.subject === 'دفعة أعلى من المطلوب');
      assert(owner, 'إشعار المالك بعنوان الدفع الزائد');
      for (const s of ['1.00 USD', '1.99 USD', '0.30 USD', '2.29 USD', 'مُنح الحق']) assert(owner!.html.includes(s), s);
      const n = mails.length;
      // إعادة الإشعار نفسه (حجز بلا معالجة) وإشعار مكرر بمعرّف جديد: لا تنبيه ثانٍ ولا بريد ثانٍ
      t.payment_events.forEach((e) => { e.processed_at = null; });
      await send(raw);
      await send(paidEvent('evt_over_2', id, { amount: 199, sub_total: 199, tax_amount: 30, amount_paid: 229 }));
      assertEquals(alerts().length, 1);
      assertEquals(t.audit_log.filter((a) => a.action === 'payment.overpaid').length, 1);
      assertEquals(mails.length, n);
      // الاسترداد اللاحق لا يمحو علامة المطلوب
      await send(JSON.stringify({ id: 'evt_over_ref', eventType: 'refund.created', object: { id: 'ref_o', order: 'ord_over', checkout: 'ch_over', refund_amount: 99 } }));
      assert(String(t.payments[0].note).startsWith('overpaid expected=100 paid=199'), String(t.payments[0].note));
    });
  } finally { restore(); restoreEnv(); }
});

Deno.test('دفع أقل من المطلوب: يبقى معلّقًا بلا حق كما كان، ولا علامة دفع زائد؛ والمساوي بلا علامة ولا تنبيه', async () => {
  const restoreEnv = setupEnv();
  const id = '31111111-2222-4333-8444-555555555555';
  const t = pendingWorld(id, { amount_cents: 199 });
  const restore = install(t);
  try {
    await withMail(async () => {
      await send(paidEvent('evt_under', id, { amount: 100, amount_paid: 100 }));
      assertEquals([t.payments[0].status, t.entitlements.length], ['pending', 0]);
      assert(String(t.payments[0].note).startsWith('held'));
      assertEquals(t.audit_log.some((a) => a.action === 'payment.overpaid'), false);
      t.payments[0].note = null;
      await send(paidEvent('evt_equal', id, { amount: 199, amount_paid: 199 }));
      assertEquals([t.payments[0].status, t.payments[0].note, t.entitlements.length], ['paid', null, 1]);
      assertEquals(t.audit_log.some((a) => a.action === 'payment.overpaid'), false);
    });
  } finally { restore(); restoreEnv(); }
});

Deno.test('بريد «وصلنا دفعك»: المدفوع شامل الضريبة وسطر الضريبة، وبلا ضريبة سطر المدفوع وحده، وبلا amount_paid المبلغ المسجل', async () => {
  const restoreEnv = setupEnv();
  const cases: [string, Row, string[], string[]][] = [
    ['41111111-2222-4333-8444-555555555555', { amount: 199, sub_total: 199, tax_amount: 30, amount_paid: 229 }, ['المبلغ قبل الضريبة', '1.99 USD', 'الضريبة', '0.30 USD', 'المدفوع شامل الضريبة', '2.29 USD'], []],
    ['51111111-2222-4333-8444-555555555555', { amount: 199, sub_total: 199, tax_amount: 0, amount_paid: 199 }, ['المبلغ المدفوع', '1.99 USD'], ['الضريبة']],
    ['61111111-2222-4333-8444-555555555555', { amount: 199, sub_total: 199, tax_amount: 30 }, ['المبلغ', '1.99 USD'], ['الضريبة', 'المدفوع', '2.29']],
  ];
  try {
    for (const [id, order, has, lacks] of cases) {
      const t = pendingWorld(id, { amount_cents: 199 });
      const restore = install(t);
      try {
        await withMail(async (mails) => {
          await send(paidEvent(`evt_r_${id.slice(0, 2)}`, id, order));
          const m = mails.find((x) => x.subject === 'وصلنا دفعك');
          assert(m, 'بريد الإيصال');
          for (const s of has) assert(m!.html.includes(s), `${id.slice(0, 2)} ${s}`);
          for (const s of lacks) assert(!m!.html.includes(s), `${id.slice(0, 2)} بلا ${s}`);
        });
      } finally { restore(); }
    }
  } finally { restoreEnv(); }
});
