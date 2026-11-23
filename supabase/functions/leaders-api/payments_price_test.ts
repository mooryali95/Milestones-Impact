// المصدر الواحد للسعر (تصور مصدر السعر، المرحلة 2): جلسة الدفع ترسل سعر الإعداد في custom_price فيخصم Creem ما يُعرض
// تمامًا قبل الضريبة؛ وحفظ الإعداد مع التفعيل يرفض ما دون حد Creem الأدنى؛ ورفض Creem فشل لطيف وتنبيه واحد بلا رجوع
// صامت إلى سعر المنتج؛ ومفتاح الاختبار يذهب إلى مضيف الاختبار.
import './_test_env.ts';
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
const { checkout, adminSettings, MIN_PRICE_CENTS } = await import('./payments.ts');
const { db } = await import('./core.ts');

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
        const made = list.map((x) => ({ id: crypto.randomUUID(), status: 'pending', ...x }));
        rows().push(...made);
        return { data: st.single ? made[0] : made, error: null };
      }
      if (st.op === 'update') { hit.forEach((r) => Object.assign(r, st.payload)); return { data: st.single ? (hit[0] ?? null) : hit, error: null }; }
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
          else if (k === 'gte') st.filters.push(() => true);
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


const P = { id: 'p1', email: 'sara@example.com', status: 'placed', organization_id: null, is_demo: false };
const ADMIN: any = { email: 'admin@example.sa', role: 'admin', method: 'passkey' };
const world = (over: Row = {}): Record<string, Row[]> => ({
  payment_settings: [{ id: true, enabled: true, currency: 'USD', assessment_cents: 150, program_cents: 9900, assessment_product: 'prod_a', program_product: 'prod_p', ...over }],
  payments: [], entitlements: [], sponsor_requests: [], audit_log: [], mail_events: [],
});

async function withCreem<T>(reply: (body: any) => Response, fn: (calls: { url: string; body: any }[]) => Promise<T>) {
  const real = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('creem.io')) { const body = JSON.parse(String(init?.body)); calls.push({ url: u, body }); return Promise.resolve(reply(body)); }
    return Promise.resolve(new Response('ok', { status: 200 }));
  }) as typeof fetch;
  Deno.env.set('CREEM_API_KEY', 'creem_test_dummy');
  Deno.env.set('CREEM_WEBHOOK_SECRET', 'whsec-test');
  try { return await fn(calls); } finally { globalThis.fetch = real; Deno.env.delete('CREEM_API_KEY'); Deno.env.delete('CREEM_WEBHOOK_SECRET'); }
}
const ok = () => new Response(JSON.stringify({ id: 'ch_1', checkout_url: 'https://creem.io/pay/ch_1' }), { status: 200 });

Deno.test('جلسة الدفع: custom_price يساوي سعر الإعداد للبندين، وproduct_id باقٍ، ومفتاح الاختبار إلى مضيف الاختبار', async () => {
  const t = world();
  const restore = install(t);
  try {
    await withCreem(ok, async (calls) => {
      assertEquals((await checkout(P, { item: 'assessment' })).url, 'https://creem.io/pay/ch_1');
      assertEquals((await checkout(P, { item: 'program' })).url, 'https://creem.io/pay/ch_1');
      assertEquals(calls.map((c) => [c.body.product_id, c.body.custom_price]), [['prod_a', 150], ['prod_p', 9900]]);
      assert(calls.every((c) => c.url === 'https://test-api.creem.io/v1/checkouts'), calls[0].url);
      assertEquals(t.payments.map((p) => p.amount_cents), [150, 9900]);
    });
  } finally { restore(); }
});

Deno.test('رفض Creem (custom_price على منتج اشتراك): خطأ pay_gateway اللطيف، والدفعة فاشلة، وتنبيه واحد بسببه، ولا إعادة بلا السعر', async () => {
  const t = world();
  const restore = install(t);
  try {
    await withCreem(() => new Response(JSON.stringify({ message: 'custom_price is only supported for one-time products' }), { status: 400 }), async (calls) => {
      for (let i = 0; i < 2; i++) {
        const e: any = await assertRejects(() => checkout(P, { item: 'program' }));
        assertEquals([e.status, e.code], [502, 'pay_gateway']);
      }
      assertEquals(calls.length, 2);
      assert(calls.every((c) => c.body.custom_price === 9900), 'لا طلب بلا custom_price');
      assertEquals(t.payments.map((p) => p.status), ['failed', 'failed']);
      const alerts = t.audit_log.filter((a) => a.action === 'system.alert' && a.entity_id === 'payment_mismatch:checkout:program');
      assertEquals(alerts.length, 1);
      assert(String(alerts[0].after.issues[0]).includes('one-time'), String(alerts[0].after.issues[0]));
    });
  } finally { restore(); }
});

Deno.test('سعر في الإعداد دون حد Creem: لا تُفتح جلسة ولا تُنشأ دفعة، وخطأ لطيف وتنبيه', async () => {
  const t = world({ assessment_cents: 50 });
  const restore = install(t);
  try {
    await withCreem(ok, async (calls) => {
      const e: any = await assertRejects(() => checkout(P, { item: 'assessment' }));
      assertEquals(e.code, 'pay_gateway');
      assertEquals([calls.length, t.payments.length], [0, 0]);
      assertEquals(t.audit_log.filter((a) => a.entity_id === 'payment_mismatch:checkout:assessment').length, 1);
    });
  } finally { restore(); }
});

Deno.test('حفظ الإعداد: مع التفعيل يُرفض ما دون 100 للبندين، والحد نفسه يُقبل، والدفع مطفأ يقبل الصفر كما كان', async () => {
  assertEquals(MIN_PRICE_CENTS, 100);
  const base = { enabled: true, assessment_product: 'prod_a', program_product: 'prod_p' };
  await withCreem(ok, async () => {
    for (const [k, label] of [['assessment_cents', 'القياس المبدئي'], ['program_cents', 'إكمال البرنامج']]) {
      const t = world({ enabled: true });
      const restore = install(t);
      try {
        const e: any = await assertRejects(() => adminSettings(ADMIN, { ...base, assessment_cents: 150, program_cents: 9900, [k]: 99 }));
        assertEquals([e.status, e.code], [400, 'pay_price_min']);
        assert(String(e.message).includes(label), e.message);
        assertEquals(t.payment_settings[0][k], k === 'assessment_cents' ? 150 : 9900);
      } finally { restore(); }
    }
    const t = world({ enabled: true });
    const restore = install(t);
    try {
      await adminSettings(ADMIN, { ...base, assessment_cents: 100, program_cents: 100 });
      assertEquals([t.payment_settings[0].assessment_cents, t.payment_settings[0].program_cents], [100, 100]);
      await adminSettings(ADMIN, { ...base, enabled: false, assessment_cents: 0, program_cents: 0 });
      assertEquals([t.payment_settings[0].enabled, t.payment_settings[0].assessment_cents], [false, 0]);
    } finally { restore(); }
  });
});
