// العداد الموحد (D15) في شيفرته الفعلية: قاعدة مزيفة وResend محاكى، بلا شبكة.
import { assertEquals } from 'jsr:@std/assert@1';
import { sendCounted } from '../_shared/mail.ts';

type Row = { kind: string; source: string; status: string; created_at: string };

function fakeDb(rows: Row[], { missing = false } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const query = () => {
    const f: Array<(r: Row) => boolean> = [];
    const q: any = {
      select: () => q,
      eq: (k: keyof Row, v: string) => { f.push((r) => r[k] === v); return q; },
      gte: (k: keyof Row, v: string) => { f.push((r) => r[k] >= v); return q; },
      not: (_k: string, _op: string, v: string) => { const ks = v.replace(/[()]/g, '').split(','); f.push((r) => !ks.includes(r.kind)); return q; },
      insert: (row: Record<string, unknown>) => { inserts.push(row); return Promise.resolve({ error: null }); },
      then: (ok: (x: unknown) => void) => ok(missing ? { count: null, error: { code: '42P01' } } : { count: rows.filter((r) => f.every((g) => g(r))).length, error: null }),
    };
    return q;
  };
  return { client: { schema: () => ({ from: () => query() }) }, inserts };
}

const now = new Date().toISOString();
const sent = (kind: string, n: number, source = 'leaders-api'): Row[] => Array.from({ length: n }, () => ({ kind, source, status: 'sent', created_at: now }));

async function withResend<T>(status: number, fn: (calls: string[]) => Promise<T>) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string | URL) => {
    calls.push(String(url));
    if (String(url).includes('resend.com')) return Promise.resolve(new Response(status < 300 ? '{"id":"re_123"}' : 'no', { status }));
    return Promise.resolve(new Response('ok'));
  }) as typeof fetch;
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}

const opts = (kind: any, extra = {}) => ({ kind, source: 'leaders-api', cap: 10, key: 'k', ...extra });

Deno.test('ما سوى الرموز يُحجب عند نصف السقف ويُسجَّل محجوبًا، والرمز يمر', async () => {
  const { client, inserts } = fakeDb([...sent('notify', 5)]);
  await withResend(200, async (calls) => {
    assertEquals(await sendCounted(client, 'a@x.sa', 's', '<p>x</p>', opts('notify')), { ok: false, reason: 'mail_share' });
    assertEquals(calls.length, 0);
    assertEquals(await sendCounted(client, 'a@x.sa', 's', '<p>x</p>', opts('code')), { ok: true, id: 're_123' });
  });
  assertEquals(inserts.map((r) => [r.kind, r.status, r.to_domain]), [['notify', 'blocked', 'x.sa'], ['code', 'sent', 'x.sa']]);
});

Deno.test('السقف كاملًا يحجب الرموز أيضًا', async () => {
  const { client } = fakeDb([...sent('code', 10)]);
  await withResend(200, async () => assertEquals((await sendCounted(client, 'a@x.sa', 's', 'x', opts('code'))).reason, 'mail_cap'));
});

Deno.test('نصيب المصدر: رموز المصفوفة لا تتجاوز خُمس السقف', async () => {
  const { client } = fakeDb([...sent('code', 2, 'user-api')]);
  await withResend(200, async () => {
    assertEquals((await sendCounted(client, 'a@x.sa', 's', 'x', { ...opts('code'), source: 'user-api', sourceShare: 0.2 })).reason, 'mail_share');
    assertEquals((await sendCounted(client, 'a@x.sa', 's', 'x', opts('code'))).ok, true);
  });
});

Deno.test('رفض Resend للنطاق ينبّه عبر الرابط ولا يعيد الإرسال من نطاق آخر', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  const { client, inserts } = fakeDb([]);
  await withResend(403, async (calls) => {
    assertEquals(await sendCounted(client, 'a@x.sa', 's', 'x', opts('notify')), { ok: false, reason: 'mail_failed' });
    assertEquals(calls.filter((u) => u.includes('resend.com')).length, 1);
    assertEquals(calls.filter((u) => u.includes('hooks.example')).length, 1);
  });
  assertEquals(inserts.map((r) => r.status), ['failed']);
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
});

Deno.test('عبور 70% ينبّه مرة، وقبل الترحيل يُرسل بلا عداد', async () => {
  Deno.env.set('LEADERS_ALERT_WEBHOOK', 'https://hooks.example/alert');
  await withResend(200, async (calls) => {
    const { client } = fakeDb([...sent('code', 6)]);
    await sendCounted(client, 'a@x.sa', 's', 'x', opts('code'));
    assertEquals(calls.filter((u) => u.includes('hooks.example')).length, 1);
    const { client: before, inserts } = fakeDb([], { missing: true });
    assertEquals((await sendCounted(before, 'a@x.sa', 's', 'x', opts('notify'))).ok, true);
    assertEquals(inserts.length, 0);
  });
  Deno.env.delete('LEADERS_ALERT_WEBHOOK');
});
