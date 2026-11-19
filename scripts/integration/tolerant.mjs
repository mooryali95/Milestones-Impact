// وعد «deploy-gate: tolerant» على قاعدة حقيقية (تصور تحديث المنصة بلا أثر، المرحلة 6، البند 6): كل ميزة لها ترحيل متسامح
// تُسأل بطلب حقيقي، ويُتحقق أن ردها هو المكتوب في وسمها حين يغيب جدولها، وأنها تعمل حين يوجد. يجري في الوظيفتين:
// golden-paths (كل الترحيلات) وproduction-schema (بنية الإنتاج)، فيُختبر الطرفان.
//   DB_URL=... API_URL=http://127.0.0.1:54321 node scripts/integration/tolerant.mjs
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = process.env.API_URL || 'http://127.0.0.1:54321';
const DB = process.env.DB_URL;
if (!DB) { console.error('DB_URL مطلوب'); process.exit(2); }
const ENV = Object.fromEntries(readFileSync(new URL('../../supabase/functions/ci.env', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')));
const ORIGIN = ENV.LEADERS_ORIGINS.split(',')[0];
const sql = (q) => execFileSync('psql', ['-At', '-q', '-v', 'ON_ERROR_STOP=1', DB, '-c', q]).toString().trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const has = (t) => sql(`select to_regclass(${q(t)}) is not null`) === 't';
let fails = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${msg}${cond ? '' : ` ${extra}`}`); if (!cond) fails += 1; };

async function call(action, body = {}, token = null) {
  const r = await fetch(`${API}/functions/v1/leaders-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(process.env.ANON_KEY ? { apikey: process.env.ANON_KEY, Authorization: `Bearer ${process.env.ANON_KEY}` } : {}) },
    body: JSON.stringify({ action, ...body, ...(token ? { token } : {}) }),
  });
  return { status: r.status, idem: r.headers.get('x-idem'), body: await r.json().catch(() => ({})) };
}

const events = has('leaders.client_events');
const idem = has('leaders.idempotency_keys');
console.log(`البنية: client_events ${events ? 'موجود' : 'غائب'}، idempotency_keys ${idem ? 'موجود' : 'غائب'}، demo_links ${has('leaders.demo_links') ? 'موجود' : 'غائب'}`);

// 20261118150000: قبله يرد client.event بـ not_migrated (503) فيُسقط العميل طابوره بصمت، وبعده يُحفظ
const ev = await call('client.event', { events: [{ kind: 'offline', act: 'me', tries: 1, at: new Date().toISOString() }] });
if (events) ok(ev.status === 200 && ev.body.success === true, 'client.event يُحفظ حين يوجد جدوله', JSON.stringify(ev));
else ok(ev.status === 503 && ev.body.code === 'not_migrated', 'client.event قبل ترحيله: not_migrated لا خطأ داخلي', JSON.stringify(ev));

// 20261118140000: قبله يُتجاهل مفتاح منع التكرار وتعمل الكتابة كما كانت ولا تُعلن x-idem، وبعده يُحفظ والإعادة ترد النتيجة نفسها
const PEPPER = ENV.LEADERS_TOKEN_PEPPER;
const pid = sql(`insert into leaders.participants (email, full_name) values (${q(`tolerant-${Date.now()}@example.com`)}, 'مشارك الوعد المتسامح') returning id`);
const token = randomBytes(24).toString('base64url');
sql(`insert into leaders.auth_sessions (participant_id, token_hash, method, expires_at) values (${q(pid)}, ${q(createHash('sha256').update(`${PEPPER}:${token}`).digest('hex'))}, 'email_code', now() + interval '1 day')`);
const key = randomBytes(18).toString('base64url');
const fields = { job_title: 'مديرة مشاريع' };
const first = await call('profile.save', { fields, idem: key }, token);
ok(first.status === 200 && first.body.success === true, 'كتابة بمفتاح منع التكرار تعمل', JSON.stringify(first.body).slice(0, 200));
if (idem) {
  const again = await call('profile.save', { fields, idem: key }, token);
  ok(again.body.success === true && again.idem === 'replayed', 'الإعادة بالمفتاح نفسه ترد النتيجة المحفوظة (x-idem: replayed)', `${again.idem} ${JSON.stringify(again.body).slice(0, 120)}`);
} else {
  ok(first.idem === null, 'قبل ترحيل المفتاح لا تُعلن x-idem، فلا يعيد العميل الكتابة تلقائيًا', String(first.idem));
}

// 20261119100000: قبله يرد demo.link-open بـ not_migrated (503) وتعرض اللوحة «لم تُفعَّل بعد»، وبعده رمز لا رابط له يُرد link_invalid (404)
const links = has('leaders.demo_links');
const dl = await call('demo.link-open', { t: randomBytes(32).toString('base64url') });
if (links) ok(dl.status === 404 && dl.body.code === 'link_invalid', 'demo.link-open برمز لا رابط له: link_invalid حين يوجد جدوله', JSON.stringify(dl));
else ok(dl.status === 503 && dl.body.code === 'not_migrated', 'demo.link-open قبل ترحيله: not_migrated لا خطأ داخلي', JSON.stringify(dl));

const ping = await call('system.ping');
ok(ping.body.success === true, 'system.ping بعد ذلك كله', JSON.stringify(ping.body));
if (fails) { console.error(`\n${fails} فحص لم يجتز`); process.exit(1); }
console.log('\nالوعد المتسامح محقق على هذه البنية');
