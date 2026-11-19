// إشعار دخول المالك (login_notice.ts و_shared/login-device.js): التصور 2026-11-16، القسمان 10.4 و10.6.
// جهاز معروف لا يرسل بريدًا، وجهاز جديد يرسل، وحساب بلا سجل يرسل، ووصف متصفح مطابق من شبكة أخرى جهاز جديد.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { coarseIp, deviceOf, loginFingerprint } from '../_shared/login-device.js';
import { KNOWN_DEVICE_TITLE, knownDevice, loginLine, NEW_DEVICE_TITLE, ownerLoginNotice } from './login_notice.ts';

type Row = Record<string, any>;
// قاعدة في الذاكرة تفهم eq على مسار jsonb (meta->>fp) كما يفهمه PostgREST
function fakeDb(rows: Row[], { fail = false } = {}) {
  const from = (_t: string) => {
    const f: ((r: Row) => boolean)[] = [];
    let lim = Infinity;
    const val = (r: Row, k: string) => {
      const m = /^(\w+)->>(\w+)$/.exec(k);
      return m ? (r[m[1]]?.[m[2]] == null ? undefined : String(r[m[1]][m[2]])) : r[k];
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { f.push((r) => val(r, k) === v); return q; },
      gte: (k: string, v: string) => { f.push((r) => r[k] >= v); return q; },
      limit: (n: number) => { lim = n; return q; },
      then: (ok: (x: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve().then(() => (fail ? { data: null, error: { message: 'down' } } : { data: rows.filter((r) => f.every((x) => x(r))).slice(0, lim), error: null })).then(ok, bad),
    };
    return q;
  };
  return { from };
}

const OWNER = '11111111-1111-1111-1111-111111111111';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const NOW = Date.parse('2026-11-16T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 864e5).toISOString();
async function loginRow(ip: string, ua: string, method: string, created_at: string, user_id = OWNER): Promise<Row> {
  return { user_id, action: 'login', created_at, meta: { method, ip, fp: await loginFingerprint(ip, ua) } };
}

Deno.test('العنوان المقرب: IPv4 إلى /24، وIPv6 إلى /48، وما لا يُفهم null', () => {
  assertEquals(coarseIp('203.0.113.77'), '203.0.113.0/24');
  assertEquals(coarseIp('::ffff:203.0.113.9'), '203.0.113.0/24');
  assertEquals(coarseIp('2001:db8:abcd:12::1'), '2001:db8:abcd::/48');
  assertEquals(coarseIp('2001:0db8:abcd:0012:0000:0000:0000:0001'), '2001:db8:abcd::/48');
  assertEquals(coarseIp('[2001:db8:abcd::5]'), '2001:db8:abcd::/48');
  for (const bad of ['', 'unknown', '300.1.1.1', '1.2.3', 'gggg::1', '1::2::3']) assertEquals(coarseIp(bad), null, bad);
});

Deno.test('البصمة: الجهاز في الشبكة نفسها بصمة واحدة، والمتصفح وحده بلا عنوان لا بصمة له، ولا يظهر فيها نص المتصفح', async () => {
  const a = await loginFingerprint('203.0.113.5', UA_MAC);
  assertEquals(a, await loginFingerprint('203.0.113.200', UA_MAC));
  assert(a !== await loginFingerprint('198.51.100.5', UA_MAC), 'شبكة أخرى بصمة أخرى');
  assert(a !== await loginFingerprint('203.0.113.5', UA_WIN), 'متصفح آخر بصمة أخرى');
  assertEquals(await loginFingerprint('', UA_MAC), null);
  assertEquals(await loginFingerprint('203.0.113.5', ''), null);
  assert(/^[0-9a-f]{64}$/.test(String(a)));
  assertEquals(deviceOf(UA_MAC), 'Mac · Safari');
});

Deno.test('جهاز معروف: بصمة تطابق دخولًا بالطريقة نفسها في آخر 30 يومًا', async () => {
  const sb = fakeDb([await loginRow('203.0.113.5', UA_MAC, 'totp', daysAgo(3))]);
  const fp = await loginFingerprint('203.0.113.40', UA_MAC);
  assertEquals(await knownDevice(sb, { userId: OWNER, method: 'totp', fp }, NOW), true);
});

Deno.test('جهاز جديد: لا دخول سابق بهذه البصمة، أو بطريقة أخرى، أو أقدم من 30 يومًا، أو لحساب آخر', async () => {
  const fp = await loginFingerprint('203.0.113.5', UA_MAC);
  const sb = fakeDb([
    await loginRow('203.0.113.5', UA_WIN, 'totp', daysAgo(1)),
    await loginRow('203.0.113.5', UA_MAC, 'email', daysAgo(1)),
    await loginRow('203.0.113.5', UA_MAC, 'totp', daysAgo(31)),
    await loginRow('203.0.113.5', UA_MAC, 'totp', daysAgo(1), '22222222-2222-2222-2222-222222222222'),
  ]);
  assertEquals(await knownDevice(sb, { userId: OWNER, method: 'totp', fp }, NOW), false);
});

Deno.test('حساب بلا سجل سابق: جهاز جديد، وسطور الدخول القديمة بلا بصمة لا تطابق', async () => {
  const fp = await loginFingerprint('203.0.113.5', UA_MAC);
  assertEquals(await knownDevice(fakeDb([]), { userId: OWNER, method: 'email', fp }, NOW), false);
  const legacy = fakeDb([{ user_id: OWNER, action: 'login', created_at: daysAgo(1), meta: { method: 'email', ip: '203.0.113.5' } }]);
  assertEquals(await knownDevice(legacy, { userId: OWNER, method: 'email', fp }, NOW), false);
});

Deno.test('وصف متصفح مطابق من شبكة مختلفة: جهاز جديد (المتصفح وحده لا يُعرّف الجهاز)', async () => {
  const sb = fakeDb([await loginRow('203.0.113.5', UA_MAC, 'email', daysAgo(2))]);
  const other = await loginFingerprint('198.51.100.5', UA_MAC);
  assertEquals(await knownDevice(sb, { userId: OWNER, method: 'email', fp: other }, NOW), false);
  // وبلا عنوان أصلًا: لا بصمة، فلا معرفة
  assertEquals(await knownDevice(sb, { userId: OWNER, method: 'email', fp: await loginFingerprint('', UA_MAC) }, NOW), false);
});

Deno.test('مفتاح مرور سبق استعماله: جهاز معروف بلا بصمة، والمفتاح الجديد أول مرة جهاز جديد', async () => {
  assertEquals(await knownDevice(fakeDb([]), { userId: OWNER, method: 'passkey', fp: null, passkeyUsedBefore: true }, NOW), true);
  assertEquals(await knownDevice(fakeDb([]), { userId: OWNER, method: 'passkey', fp: null, passkeyUsedBefore: false }, NOW), false);
  // الاستعمال السابق شرط لمفتاح المرور وحده
  assertEquals(await knownDevice(fakeDb([]), { userId: OWNER, method: 'email', fp: null, passkeyUsedBefore: true }, NOW), false);
});

Deno.test('تعذر قراءة السجل: جهاز جديد (الشك يرسل البريد)', async () => {
  const fp = await loginFingerprint('203.0.113.5', UA_MAC);
  assertEquals(await knownDevice(fakeDb([], { fail: true }), { userId: OWNER, method: 'totp', fp }, NOW), false);
});

function deps({ configured = true, delivered = true } = {}) {
  const mails: string[] = [], posted: string[] = [], deliveredLines: string[] = [];
  const d = {
    sb: fakeDb([]),
    mail: async (title: string) => { mails.push(title); },
    slackPost: (t: string) => { posted.push(t); },
    slackDeliver: async (t: string) => { deliveredLines.push(t); return delivered; },
    slackConfigured: () => configured,
  };
  return { d, mails, posted, deliveredLines };
}
const ROWS: [string, string][] = [['الطريقة', 'رمز البريد'], ['عنوان IP', '203.0.113.5'], ['المتصفح', UA_MAC]];

Deno.test('جهاز معروف: سطر Slack وحده ولا بريد', async () => {
  const { d, mails, posted, deliveredLines } = deps();
  const r = await ownerLoginNotice(d, 'passkey', 'known', ROWS);
  assertEquals(mails, []);
  assertEquals(posted, []);
  assertEquals(deliveredLines, [loginLine('passkey', 'known')]);
  assertEquals(r.kind, 'owner_login_known_device');
  assertEquals([r.routed.email, r.routed.slack], [false, true]);
});

Deno.test('جهاز معروف وSlack لا يصل أو غير مضبوط: البريد احتياطًا', async () => {
  for (const o of [{ delivered: false }, { configured: false }]) {
    const { d, mails } = deps(o);
    const r = await ownerLoginNotice(d, 'totp', 'known', ROWS);
    assertEquals(mails, [KNOWN_DEVICE_TITLE], JSON.stringify(o));
    assertEquals(r.routed.email, true);
  }
});

Deno.test('جهاز جديد: بريد وSlack معًا، ولا ينتظر Slack', async () => {
  const { d, mails, posted, deliveredLines } = deps();
  const r = await ownerLoginNotice(d, 'email', 'new', ROWS);
  assertEquals(mails, [NEW_DEVICE_TITLE]);
  assertEquals(posted, [loginLine('email', 'new')]);
  assertEquals(deliveredLines, []);
  assertEquals(r.kind, 'owner_login_new_device');
  assertEquals([r.routed.email, r.routed.slack, r.routed.locked], [true, true, true]);
  // Slack غير مضبوط: البريد وحده
  const off = deps({ configured: false });
  await ownerLoginNotice(off.d, 'email', 'new', ROWS);
  assertEquals([off.mails, off.posted], [[NEW_DEVICE_TITLE], []]);
});

Deno.test('صف التوجيه يطفئ Slack: لا سطر ولو ضُبط Slack، والبريد كما يقرره الصف', async () => {
  // جهاز معروف إلى الملخص وحده: لا سطر فوري ولا بريد
  const digestOnly = { preset: 'balanced', rows: { owner_login_known_device: { email: false, slack: false, digest: true } } };
  const k = deps();
  const rk = await ownerLoginNotice({ ...k.d, settings: digestOnly }, 'passkey', 'known', ROWS);
  assertEquals([k.posted, k.deliveredLines, k.mails], [[], [], []]);
  assertEquals([rk.routed.email, rk.routed.slack, rk.routed.digest], [false, false, true]);
  // جهاز معروف إلى البريد وحده: بريد بلا سطر
  const mailOnly = { preset: 'balanced', rows: { owner_login_known_device: { email: true, slack: false, digest: false } } };
  const m = deps();
  const rm = await ownerLoginNotice({ ...m.d, settings: mailOnly }, 'totp', 'known', ROWS);
  assertEquals([m.posted, m.deliveredLines, m.mails], [[], [], [KNOWN_DEVICE_TITLE]]);
  assertEquals(rm.routed.slack, false);
  // جهاز جديد (مقفل البريد) وSlack مطفأ: البريد وحده
  const newMail = { preset: 'balanced', rows: { owner_login_new_device: { email: true, slack: false, digest: false } } };
  const n = deps();
  const rn = await ownerLoginNotice({ ...n.d, settings: newMail }, 'email', 'new', ROWS);
  assertEquals([n.posted, n.deliveredLines, n.mails], [[], [], [NEW_DEVICE_TITLE]]);
  assertEquals([rn.routed.email, rn.routed.slack], [true, false]);
});

Deno.test('index.ts: بصمة الجهاز من رأس الوكيل الموثوق وحده، لا من x-forwarded-for', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes('trustedIp: req.headers.get("cf-connecting-ip")?.trim() || ""'));
  assert(src.includes('loginFingerprint(ctx.trustedIp ?? "", ctx.ua)'));
  assert(!src.includes('loginFingerprint(ctx.ip'));
});

Deno.test('سطر Slack: الطريقة والجهاز فقط، بلا بريد ولا عنوان ولا متصفح ولا ستة أرقام', () => {
  for (const m of ['passkey', 'totp', 'email', 'other']) {
    for (const dv of ['known', 'new'] as const) {
      const line = loginLine(m, dv);
      assert(!/@/.test(line), line);
      assert(!/\d{6}/.test(line), line);
      assert(!/\d+\.\d+\.\d+/.test(line), line);
      assert(!/Mac|Safari|Chrome|Windows|iPhone/.test(line), line);
      assert(!/[\u2013\u2014]/.test(line), line);
    }
  }
  assertEquals(loginLine('passkey', 'known'), '🔐 دخول المالك · مفتاح المرور · جهاز معروف');
});

Deno.test('index.ts: البصمة تُسأل قبل سطر الدخول وتُحفظ فيه بلا نص المتصفح، ومفتاح المرور يمرر استعماله السابق', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const fn = src.slice(src.indexOf('async function issueSession'), src.indexOf('// تنبيه أمني بالبريد'));
  const audit = fn.slice(fn.indexOf('from("admin_audit_log").insert'));
  assert(fn.indexOf('knownDevice(') < fn.indexOf('from("admin_audit_log").insert'), 'المعرفة قبل كتابة السطر');
  const meta = audit.slice(audit.indexOf('meta:'), audit.indexOf('});'));
  assert(meta.includes('fp'), 'البصمة في السطر');
  assert(!/\bua\b/.test(meta), 'لا نص المتصفح في السطر');
  assert(!fn.includes('securityMail(email, "دخول جديد إلى حسابك"'), 'لا بريد لكل دخول');
  assert(src.includes('const usedBefore = !!pk.last_used_at;'));
  assert(src.indexOf('const usedBefore') < src.indexOf('last_used_at: new Date().toISOString() }).eq("id", pk.id)'), 'يُقرأ قبل تحديثه');
  assert(src.includes('clientCtx(req), usedBefore)'));
});
