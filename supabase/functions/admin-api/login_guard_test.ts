// حراس رموز دخول الإدارة (login_guard.ts) على قاعدة في الذاكرة: الحجز الذري يحاكي public.admin_login_attempt
// (قفل على البريد ثم عد ثم تسجيل في خطوة واحدة)، والتحديثات المشروطة تحاكي PostgREST.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { claimTotpStep, consumeEmailOtp, FAIL_WINDOW_MS, MAX_FAILS, MAX_FAILS_ALL, reserveAttempt, resetTotpStep } from './login_guard.ts';

type Row = Record<string, any>;
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeDb(tables: Record<string, Row[]>, opts: { noRpc?: boolean } = {}) {
  const from = (t: string) => {
    tables[t] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    let head = false;
    const run = () => {
      if (op === 'insert') { const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload }; tables[t].push(row); return { data: [row], error: null }; }
      const rows = tables[t].filter((r) => f.every((x) => x(r)));
      if (op === 'update') { rows.forEach((r) => Object.assign(r, payload)); return { data: rows.map((r) => ({ id: r.id })), error: null }; }
      return head ? { count: rows.length, error: null } : { data: rows, error: null };
    };
    const q: any = {
      select: (_c?: string, o?: { head?: boolean }) => { if (o?.head) head = true; return q; },
      insert: (r: Row) => { op = 'insert'; payload = r; return q; }, update: (r: Row) => { op = 'update'; payload = r; return q; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; }, gte: (k: string, v: string) => { f.push((r) => r[k] >= v); return q; },
      // or=(totp_last_step.is.null,totp_last_step.lt.N) وحده ما يستعمله الحارس
      or: (expr: string) => { const n = BigInt(expr.split('.lt.')[1]); f.push((r) => r.totp_last_step == null || BigInt(r.totp_last_step) < n); return q; },
      limit: () => q,
      // كل استعلام يعبر جولة شبكة قبل تنفيذه، فيتداخل المتزامن كما في الإنتاج
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) => tick().then(run).then(ok, bad),
    };
    return q;
  };
  // الدالة في القاعدة: القفل يجعل العد والتسجيل خطوة واحدة لا يتخللها طلب آخر
  const rpc = async (name: string, a: Row) => {
    await tick();
    if (opts.noRpc || name !== 'admin_login_attempt') return { data: null, error: { code: 'PGRST202' } };
    const since = new Date(Date.now() - a.p_window_s * 1000).toISOString();
    const fails = tables.totp_attempts.filter((r) => r.email === a.p_email && !r.success && r.created_at >= since);
    const mine = fails.filter((r) => r.ip === a.p_ip).length;
    if (fails.length >= a.p_max_all || mine >= a.p_max_ip || (!a.p_ip && fails.length >= a.p_max_ip)) return { data: null, error: null };
    const row = { id: crypto.randomUUID(), email: a.p_email, success: false, ip: a.p_ip, created_at: new Date().toISOString() };
    tables.totp_attempts.push(row);
    return { data: row.id, error: null };
  };
  return { from, rpc };
}

// محاولة دخول كاملة كما في login-verify: حجز ثم فحص رمز خاطئ ثم إغلاق
async function wrongCode(sb: any, email: string, ip: string, checked: { n: number }) {
  const a = await reserveAttempt(sb, email, ip);
  if (!a.ok) return 429;
  checked.n++;
  await a.done(false);
  return 200;
}

Deno.test('خمسون طلبًا متزامنًا من عنوان واحد: لا يُفحص منها أكثر من خمسة', async () => {
  const tables: Record<string, Row[]> = { totp_attempts: [] };
  const sb = fakeDb(tables);
  const checked = { n: 0 };
  const res = await Promise.all(Array.from({ length: 50 }, () => wrongCode(sb, 'o@x.sa', '203.0.113.5', checked)));
  assertEquals(checked.n, MAX_FAILS);
  assertEquals(res.filter((s) => s === 429).length, 50 - MAX_FAILS);
  assertEquals(tables.totp_attempts.length, MAX_FAILS);
});

Deno.test('خمسون طلبًا متزامنًا من خمسين عنوانًا: لا يُفحص منها أكثر من سقف البريد', async () => {
  const tables: Record<string, Row[]> = { totp_attempts: [] };
  const sb = fakeDb(tables);
  const checked = { n: 0 };
  await Promise.all(Array.from({ length: 50 }, (_, i) => wrongCode(sb, 'o@x.sa', `198.51.100.${i}`, checked)));
  assertEquals(checked.n, MAX_FAILS_ALL);
  assertEquals(FAIL_WINDOW_MS, 15 * 60 * 1000);
});

Deno.test('النجاح يحدّث السطر المحجوز نفسه ولا يُحسب فشلًا', async () => {
  const tables: Record<string, Row[]> = { totp_attempts: [] };
  const sb = fakeDb(tables);
  const a = await reserveAttempt(sb, 'o@x.sa', '203.0.113.5');
  assert(a.ok);
  await a.done(true);
  assertEquals(tables.totp_attempts.map((r) => r.success), [true]);
});

Deno.test('قبل الترحيل: التسجيل يسبق العد، فالمتزامنة لا تتجاوز الحد', async () => {
  const tables: Record<string, Row[]> = { totp_attempts: [] };
  const sb = fakeDb(tables, { noRpc: true });
  const checked = { n: 0 };
  await Promise.all(Array.from({ length: 50 }, () => wrongCode(sb, 'o@x.sa', '203.0.113.5', checked)));
  assert(checked.n <= MAX_FAILS, `checked ${checked.n}`);
  const one = fakeDb({ totp_attempts: [] }, { noRpc: true });
  assert((await reserveAttempt(one, 'o@x.sa', '203.0.113.5')).ok);
});

Deno.test('رمز تطبيق المصادقة نفسه مرتين لا ينجح إلا مرة، متتاليتين ومتزامنتين، وخطوة أقدم مرفوضة', async () => {
  const tables: Record<string, Row[]> = { admin_users: [{ id: 'u1', totp_last_step: null }] };
  const sb = fakeDb(tables);
  assertEquals(await claimTotpStep(sb, 'u1', 1000n), true);
  assertEquals(await claimTotpStep(sb, 'u1', 1000n), false);
  assertEquals(await claimTotpStep(sb, 'u1', 999n), false);
  const both = await Promise.all([claimTotpStep(sb, 'u1', 1001n), claimTotpStep(sb, 'u1', 1001n)]);
  assertEquals(both.filter(Boolean).length, 1);
  assertEquals(await claimTotpStep(sb, 'u1', 1002n), true);
  await resetTotpStep(sb, 'u1');
  assertEquals(await claimTotpStep(sb, 'u1', 5n), true);
});

Deno.test('رمز البريد مرتين متزامنتين ينجح مرة', async () => {
  const tables: Record<string, Row[]> = { email_otps: [{ id: 'e1', verified: false }] };
  const sb = fakeDb(tables);
  const both = await Promise.all([consumeEmailOtp(sb, 'e1'), consumeEmailOtp(sb, 'e1')]);
  assertEquals(both.filter(Boolean).length, 1);
  assertEquals(await consumeEmailOtp(sb, 'e1'), false);
});
