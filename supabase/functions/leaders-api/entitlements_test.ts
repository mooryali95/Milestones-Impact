// ما لا يمنح شيئًا عند العطل: إعداد الدفع غير المقروء لا يجعل البندين مجانيين، وتعذّر فحص المقعد (D20)
// لا يثبّت إعفاءً، وتعذّر تعليق الشهادة لا يصير إلغاءً (D05). قاعدة مزيفة مكان العميل، بلا شبكة.
import './_test_env.ts';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
const { db, Fail } = await import('./core.ts');
const { pinSponsor, pinSponsorFor, settings } = await import('./entitlements.ts');
const { access } = await import('./payments.ts');
const { suspendForReopen } = await import('./certificates.ts');

type Res = { data?: unknown; error?: unknown; count?: number | null };
type Op = [string, unknown[]];
const WRITES = ['insert', 'update', 'upsert', 'delete'];

// كل استعلام سلسلة تُسجَّل عملياتها، ونتيجتها من route بحسب الجدول والعمليات
function install(route: (table: string, ops: Op[]) => Res, rpc: () => Res = () => ({ data: null, error: null })) {
  const writes: { table: string; op: string; row: unknown }[] = [];
  const from = (table: string) => {
    const ops: Op[] = [];
    const q: any = new Proxy({}, {
      get(_t, k: string) {
        if (k === 'then') return (ok: (x: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(route(table, ops)).then(ok, bad);
        return (...args: unknown[]) => {
          ops.push([k, args]);
          if (WRITES.includes(k)) writes.push({ table, op: k, row: args[0] });
          return q;
        };
      },
    });
    return q;
  };
  Object.assign(db as any, { from, rpc: () => Promise.resolve(rpc()) });
  return { writes, restore: () => { delete (db as any).from; delete (db as any).rpc; } };
}
const failOf = async (fn: () => Promise<unknown>) => (await assertRejects(fn, Fail)) as InstanceType<typeof Fail>;
const ON = { id: true, enabled: true, currency: 'USD', assessment_cents: 100, program_cents: 9900 };
const ORG = { id: 'o1', name: 'جهة', short_name: null, status: 'active', contract_cents: null, show_value: true };

Deno.test('إعداد الدفع غير المقروء يرمي، ولا يعود access بالبندين مجانيين', async () => {
  const f = install(() => ({ data: null, error: { code: 'XX000', message: 'boom' } }));
  try {
    assertEquals((await failOf(() => settings())).code, 'db_error');
    assertEquals((await failOf(() => access({ id: 'p1', is_demo: false }))).code, 'db_error');
  } finally { f.restore(); }
});

Deno.test('صف الإعداد الغائب حقًا وحده يعني الدفع مطفأ', async () => {
  const f = install(() => ({ data: null, error: null }));
  try {
    assertEquals((await settings() as any).enabled, false);
  } finally { f.restore(); }
});

// المشارك مرتبط بجهة نشطة ولا حق له بعد، ودالة المقاعد لا تجيب
const seatDown = (t: string): Res => t === 'payment_settings' ? { data: ON, error: null }
  : t === 'participants' ? { data: { id: 'p1', organization_id: 'o1', is_demo: false }, error: null }
  : t === 'organizations' ? { data: ORG, error: null }
  : t === 'entitlements' ? { data: [], error: null }
  : t === 'audit_log' ? { data: null, error: null, count: 0 }
  : { data: null, error: null };
const rpcDown = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function leaders.pin_sponsor_seat' } });

Deno.test('تعذّر فحص المقعد (D20): 503 بلا أي إعفاء مدرج، ومسارات الربط لا ترمي', async () => {
  const f = install(seatDown, rpcDown);
  try {
    const e = await failOf(() => pinSponsor({ id: 'p1' }, ORG));
    assertEquals([e.status, e.code], [503, 'seat_check_unavailable']);
    assertEquals(await pinSponsorFor('p1'), false);
    assertEquals(f.writes.filter((w) => w.table === 'entitlements').length, 0);
    // التنبيه أُثبت في السجل مرة (والتهدئة تمنع تكراره)
    assertEquals(f.writes.filter((w) => w.table === 'audit_log' && (w.row as any).action === 'system.alert').length, 1);
  } finally { f.restore(); }
});

Deno.test('access مع تعذّر فحص المقعد: لا إعفاء ولا مجانية، ويُعاد التثبيت في القراءة التالية', async () => {
  const f = install(seatDown, rpcDown);
  try {
    const a: any = await access({ id: 'p1', organization_id: 'o1', is_demo: false });
    assertEquals([a.enabled, a.assessment, a.program], [true, null, null]);
    assertEquals(f.writes.filter((w) => w.table === 'entitlements').length, 0);
  } finally { f.restore(); }
});

Deno.test('تعذّر تعليق الشهادة (قيد الحالة) يرمي، ولا تُكتب «ملغاة» مكانه (D05)', async () => {
  const f = install((t, ops) => {
    if (t === 'certificates' && ops.some(([o]) => o === 'update')) return { data: null, error: { code: '23514', message: 'certificates_status_check' } };
    if (t === 'certificates') return { data: { id: 'c1' }, error: null };
    return { data: null, error: null };
  });
  try {
    assertEquals((await failOf(() => suspendForReopen('p1', 'admin@x.sa', 'سبب'))).code, 'db_error');
    const ups = f.writes.filter((w) => w.table === 'certificates');
    assertEquals(ups.map((w) => (w.row as any).status), ['suspended']);
    assertEquals(f.writes.filter((w) => w.table === 'audit_log').length, 0);
  } finally { f.restore(); }
});
