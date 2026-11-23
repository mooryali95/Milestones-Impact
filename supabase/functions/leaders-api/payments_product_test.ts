// منتج Creem (تصور مصدر السعر، المرحلة 3: الشفافية): يُقرأ المنتجان عند حفظ إعداد الدفع وبزر «تحقق من Creem»،
// ويُحفظ الناتج في payment_settings.creem_check، وتعذّر Creem لا يمنع الحفظ، والتحذيرات تنبّه المالك مرة لكل منتج لكل حالة،
// ونمط الضريبة يصل إلى المتدرب في access().prices.tax.
import './_test_env.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
const { adminSettings, access } = await import('./payments.ts');
const { db } = await import('./core.ts');
const { productCheck, taxNote, newAlerts } = await import('../_shared/creem-product.js');

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



const ADMIN: any = { email: 'admin@example.sa', role: 'admin', method: 'passkey' };
const P = { id: 'p1', email: 'sara@example.com', status: 'placed', organization_id: null, is_demo: false };
const BODY = { enabled: true, assessment_product: 'prod_a', program_product: 'prod_p', assessment_cents: 199, program_cents: 9900 };
const world = (over: Row = {}): Record<string, Row[]> => ({
  payment_settings: [{ id: true, enabled: true, currency: 'USD', assessment_cents: 150, program_cents: 9900, assessment_product: 'prod_a', program_product: 'prod_p', ...over }],
  payments: [], entitlements: [], sponsor_requests: [], audit_log: [], mail_events: [],
});
const product = (over: Row = {}) => ({ id: 'prod_a', mode: 'test', object: 'product', price: 500, currency: 'USD', billing_type: 'onetime', billing_period: 'once', status: 'active', tax_mode: 'exclusive', ...over });

type Reply = (id: string) => Response | Promise<Response>;
async function withCreem<T>(reply: Reply, fn: (calls: { url: string; method: string; key: string }[]) => Promise<T>, key = 'creem_test_dummy') {
  const real = globalThis.fetch;
  const calls: { url: string; method: string; key: string }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('creem.io')) {
      calls.push({ url: u, method: init?.method || 'GET', key: String((init?.headers as any)?.['x-api-key'] || '') });
      return await reply(decodeURIComponent(u.split('/v1/products/')[1] || ''));
    }
    return new Response('ok', { status: 200 });
  }) as typeof fetch;
  Deno.env.set('CREEM_API_KEY', key);
  Deno.env.set('CREEM_WEBHOOK_SECRET', 'whsec-test');
  try { return await fn(calls); } finally { globalThis.fetch = real; Deno.env.delete('CREEM_API_KEY'); Deno.env.delete('CREEM_WEBHOOK_SECRET'); }
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const alerts = (t: Record<string, Row[]>) => t.audit_log.filter((a) => a.action === 'system.alert');

Deno.test('الحفظ يقرأ المنتجين بـ GET من مضيف الاختبار لمفتاح الاختبار، ويحفظ ما يقوله Creem في creem_check', async () => {
  const t = world();
  const restore = install(t);
  try {
    await withCreem((id) => json(product({ id, tax_mode: id === 'prod_a' ? 'exclusive' : 'inclusive' })), async (calls) => {
      const r: any = await adminSettings(ADMIN, BODY);
      assertEquals(calls.map((c) => [c.method, c.url]).sort(), [['GET', 'https://test-api.creem.io/v1/products/prod_a'], ['GET', 'https://test-api.creem.io/v1/products/prod_p']]);
      assert(calls.every((c) => c.key === 'creem_test_dummy'));
      const c = t.payment_settings[0].creem_check;
      assertEquals(c.key_mode, 'test');
      assertEquals([c.assessment.state, c.assessment.billing, c.assessment.currency, c.assessment.tax_mode, c.assessment.mode, c.assessment.price_cents, c.assessment.warnings], ['ok', 'onetime', 'USD', 'exclusive', 'test', 500, []]);
      assertEquals(c.program.tax_mode, 'inclusive');
      assertEquals(r.creem_check.assessment.state, 'ok');
      // سعر المنتج (500) غير سعر الإعداد (199) ليس تحذيرًا: الإعداد هو المصدر الواحد
      assertEquals(t.payment_settings[0].assessment_cents, 199);
      assertEquals(alerts(t).length, 0);
      const a: any = await access(P);
      assertEquals(a.prices.tax, { assessment: 'exclusive', program: 'inclusive' });
    });
  } finally { restore(); }
});

Deno.test('المفتاح الحي يذهب إلى المضيف الحي', async () => {
  const t = world();
  const restore = install(t);
  try {
    await withCreem((id) => json(product({ id, mode: 'prod' })), async (calls) => {
      await adminSettings(ADMIN, BODY);
      assert(calls.every((c) => c.url.startsWith('https://api.creem.io/v1/products/')), calls[0].url);
      assertEquals(t.payment_settings[0].creem_check.assessment.warnings, []);
    }, 'creem_live_dummy');
  } finally { restore(); }
});

Deno.test('التحذيرات: اشتراك، وعملة مختلفة، ووضع مختلف، ومنتج غير موجود؛ وتنبيه واحد لكل منتج لكل حالة', async () => {
  const t = world();
  const restore = install(t);
  try {
    const reply: Reply = (id) => id === 'prod_a'
      ? json(product({ id, billing_type: 'recurring', billing_period: 'every-month', currency: 'EUR', mode: 'prod' }))
      : json({ message: 'Product not found' }, 404);
    await withCreem(reply, async () => {
      await adminSettings(ADMIN, BODY);
      const c = t.payment_settings[0].creem_check;
      assertEquals(c.assessment.warnings, ['subscription', 'currency', 'mode']);
      assertEquals([c.program.state, c.program.warnings], ['not_found', ['not_found']]);
      const keys = alerts(t).map((a) => a.entity_id).sort();
      assertEquals(keys, ['payment_mismatch:product:prod_a:currency', 'payment_mismatch:product:prod_a:mode', 'payment_mismatch:product:prod_a:subscription']);
      assert(alerts(t).every((a) => String(a.after.issues[0]).includes('prod_a')));
      // حفظ ثانٍ وتحقق بالزر: الحالات نفسها لا تُنبَّه مرة أخرى
      await adminSettings(ADMIN, BODY);
      await adminSettings(ADMIN, { verify_only: true });
      assertEquals(alerts(t).length, 3);
    });
  } finally { restore(); }
});

Deno.test('Creem لا يرد: يُحفظ السعر، ويُعلَّم الفحص unreachable، ولا تنبيه، ويبقى نمط الضريبة مجهولًا', async () => {
  for (const reply of [() => { throw new TypeError('network down'); }, () => json({ message: 'oops' }, 503)] as Reply[]) {
    const t = world();
    const restore = install(t);
    try {
      await withCreem(reply, async () => {
        const r: any = await adminSettings(ADMIN, { ...BODY, assessment_cents: 250 });
        assertEquals(r.success, true);
        assertEquals(t.payment_settings[0].assessment_cents, 250);
        assertEquals([r.creem_check.assessment.state, r.creem_check.program.state], ['unreachable', 'unreachable']);
        assertEquals(alerts(t).length, 0);
        assertEquals(((await access(P)) as any).prices.tax, { assessment: null, program: null });
      });
    } finally { restore(); }
  }
});

Deno.test('زر «تحقق من Creem» يقرأ المنتجين ولا يغير السعر ولا التفعيل', async () => {
  const t = world({ enabled: false, assessment_cents: 175 });
  const restore = install(t);
  try {
    await withCreem((id) => json(product({ id })), async (calls) => {
      const r: any = await adminSettings(ADMIN, { verify_only: true, enabled: true, assessment_cents: 1 });
      assertEquals(calls.length, 2);
      assertEquals([t.payment_settings[0].enabled, t.payment_settings[0].assessment_cents], [false, 175]);
      assertEquals(r.creem_check.assessment.state, 'ok');
      assert(!t.audit_log.some((a) => a.action === 'payment.settings'));
    });
  } finally { restore(); }
});

Deno.test('creem-product.js: عبارة الضريبة، ومنتج مؤرشف، وتنبيه جديد فقط عند تغير المنتج أو الحالة', () => {
  assertEquals([taxNote('exclusive'), taxNote('inclusive'), taxNote(null)], ['يُضاف عليه الضريبة إن وُجدت', 'شامل الضريبة', null]);
  assertEquals(productCheck('x', { status: 200, body: product({ status: 'archived' }) }, { currency: 'USD', keyMode: 'test' })!.warnings, ['archived']);
  assertEquals(productCheck('x', { status: 401, body: {} }, {})!.state, 'unreachable');
  const sub = { assessment: { id: 'a', state: 'ok', warnings: ['subscription'] } };
  assertEquals(newAlerts(sub, sub), []);
  assertEquals(newAlerts(sub, { assessment: { id: 'b', state: 'ok', warnings: ['subscription'] } }).length, 1);
  assertEquals(newAlerts({ assessment: { id: 'a', state: 'unreachable' } }, sub).length, 1);
});
