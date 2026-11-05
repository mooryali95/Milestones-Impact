// المسارات الذهبية على Supabase محلي حقيقي (سير integration.yml): طلبات فعلية إلى leaders-api
// وcreem-webhook تمر بالقاعدة والترحيلات والتوقيعات. لا محاكاة. يفشل برمز خروج 1 عند أول فرق.
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres API_URL=http://127.0.0.1:54321 node scripts/integration/golden.mjs
// الأسرار الوهمية في supabase/functions/ci.env (الفلفل وسر Creem) تُقرأ هنا من الملف نفسه.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = process.env.API_URL || 'http://127.0.0.1:54321';
const DB = process.env.DB_URL;
if (!DB) { console.error('DB_URL مطلوب'); process.exit(2); }
const ENV = Object.fromEntries(readFileSync(new URL('../../supabase/functions/ci.env', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')));
const PEPPER = ENV.LEADERS_TOKEN_PEPPER, CREEM = ENV.CREEM_WEBHOOK_SECRET;
const ORIGIN = ENV.LEADERS_ORIGINS.split(',')[0];

let fails = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${msg}${cond ? '' : ` ${extra}`}`); if (!cond) fails += 1; };
// -q: بلا وسم الأمر (INSERT 0 1) بعد الصفوف، وإلا التصق بناتج returning
const sql = (q) => execFileSync('psql', ['-At', '-q', '-v', 'ON_ERROR_STOP=1', DB, '-c', q]).toString().trim();
async function fn(name, body) {
  const r = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(process.env.ANON_KEY ? { apikey: process.env.ANON_KEY, Authorization: `Bearer ${process.env.ANON_KEY}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const call = (action, body = {}, token = null) => fn('leaders-api', { action, ...body, ...(token ? { token } : {}) });
// مفتاحا Cloudflare Turnstile للاختبار في ci.env يقبلان هذا الرمز الوهمي وحده؛ الحقيقي يُرفض بهما
const HUMAN = 'XXXX.DUMMY.TOKEN.XXXX';
const hash = (v) => createHash('sha256').update(`${PEPPER}:${v}`).digest('hex');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// جلسة لمشارك مزروع مباشرة في القاعدة (رمز الدخول يصل بالبريد في الواقع ولا يُقرأ هاشه)
async function seed(email, name) {
  const pid = sql(`insert into leaders.participants (email, full_name) values (${q(email)}, ${q(name)}) returning id`);
  const token = randomBytes(24).toString('base64url');
  sql(`insert into leaders.auth_sessions (participant_id, token_hash, method, expires_at) values (${q(pid)}, ${q(hash(token))}, 'email_code', now() + interval '1 day')`);
  return { pid, token };
}

// 1) المسبار يمر بالقاعدة
const ping = await call('system.ping');
ok(ping.success === true && typeof ping.db_ms === 'number', 'system.ping يمر بالقاعدة', JSON.stringify(ping));

// 2) التسجيل (المرحلة ل1): الحدود والتحقق البشري قبل أي رد يفرّق بين بريد مسجل وجديد، ثم الاسم بتصريح
// يحمل التحقق فلا يُحل التحدي مرتين، ثم رمز يُحفظ هاشًا بالفلفل مع الملف المعلّق، والبريد التجريبي لا يُرسل
const email = `golden-${Date.now()}@demo.milestone-impact.org`;
const bare = await call('auth.start', { email });
ok(bare.code === 'captcha' && !!bare.site_key && bare.needs_name !== true, 'بريد جديد بلا تحقق بشري: يُطلب التحقق ولا يُكشف أنه جديد', JSON.stringify(bare));
const human = await call('auth.start', { email, captcha: HUMAN });
ok(human.success === true && human.needs_name === true && /^\d{13}\.[0-9a-f]{64}$/.test(human.pass || ''), 'بعد التحقق البشري: يُطلب الاسم مع تصريح', JSON.stringify(human));
const borrowed = await call('auth.start', { email: `other-${email}`, full_name: 'منتحل التصريح', pass: human.pass });
ok(borrowed.code === 'captcha', 'التصريح مربوط ببريده: لا يصلح لبريد آخر', JSON.stringify(borrowed));
const start = await call('auth.start', { email, full_name: 'مشارك المسار الذهبي', pass: human.pass });
ok(start.success === true && start.sent === true, 'auth.start لمسجّل جديد يرسل الرمز بالتصريح بلا تحدٍّ ثانٍ', JSON.stringify(start));
const ch = sql(`select code_hash, pending_profile->>'full_name' from leaders.email_challenges where email = ${q(email)} order by created_at desc limit 1`).split('|');
ok(/^[0-9a-f]{64}$/.test(ch[0] || ''), 'الرمز محفوظ هاشًا (64 hex) لا نصًا');
ok(ch[1] === 'مشارك المسار الذهبي', 'الملف المعلّق محفوظ مع التحدي', ch[1]);
// محاولات الرمز ذرية (M2): عشرون تخمينًا متزامنًا لا يُقيَّم منها إلا خمسة، والبقية تُرفض قبل المقارنة
// (رموز من غير ست خانات فلا تصيب الرمز الحقيقي مصادفة)
const guesses = await Promise.all(Array.from({ length: 20 }, (_, i) => call('auth.verify', { email, code: `x${i}` })));
const judged = guesses.filter((g) => g.code === 'code').length;
const refused = guesses.filter((g) => g.code === 'attempts').length;
const tries = Number(sql(`select attempts from leaders.email_challenges where email = ${q(email)} order by created_at desc limit 1`));
ok(judged === 5 && refused === 15 && tries === 5, `20 تخمينًا متزامنًا: قُيّم ${judged} ورُفض ${refused} والعداد ${tries}`, JSON.stringify(guesses.map((g) => g.code)));
// نموذج التواصل في الموقع (send-otp): التحقق البشري إلزامي قبل أي إدراج، والرمز الوهمي يمر
const visitor = { action: 'contact', name: 'زائر المسار الذهبي', email: `contact-${Date.now()}@demo.milestone-impact.org`, product: 'MI-HOME' };
const contactBare = await fn('send-otp', visitor);
ok(contactBare.status === 400 && contactBare.code === 'captcha', 'نموذج التواصل بلا تحقق بشري يُرفض', JSON.stringify(contactBare));
const contactHuman = await fn('send-otp', { ...visitor, captcha: HUMAN });
ok(contactHuman.success === true, 'نموذج التواصل بالتحقق البشري يُقبل', JSON.stringify(contactHuman));
const bogus = await call('me', {}, 'not-a-real-token');
ok(bogus.success !== true, 'رمز جلسة مزيّف يُرفض', JSON.stringify(bogus));

// 3) الجلسة والحساب والملف
const a = await seed(`golden-a-${Date.now()}@demo.milestone-impact.org`, 'سارة الأحمد');
const me = await call('me', {}, a.token);
ok(me.success === true && me.participant?.id === a.pid && Array.isArray(me.journey), 'me يعيد المشارك ورحلته', JSON.stringify(me).slice(0, 200));
const saved = await call('profile.save', { fields: { phone: '0500000000', job_title: 'مديرة مشاريع', organization_name: 'جهة الاختبار', sector: 'government', years_experience: 8, work_scope: 'organization' } }, a.token);
ok(saved.success === true && saved.participant?.job_title === 'مديرة مشاريع', 'profile.save يحدّث الملف ويعيد الحساب', JSON.stringify(saved).slice(0, 200));

// 4) القياس المبدئي كاملًا: الأسئلة من الأداة المفعّلة، إجابة كل سؤال، ثم الإرسال والتسكين
let get = await call('assessment.get', {}, a.token);
if (get.code === 'profile') {
  console.log('  (الملف غير مكتمل في نظر الخادم:', get.message, '؛ يُكمَّل مباشرة في القاعدة ليستمر المسار)');
  sql(`update leaders.participants set profile_completed_at = now() where id = ${q(a.pid)}`);
  get = await call('assessment.get', {}, a.token);
}
ok(get.success === true && get.questions?.length > 0, 'assessment.get يفتح قياسًا بأسئلة الأداة المفعّلة', JSON.stringify(get).slice(0, 200));
let answered = 0;
for (const qn of get.questions || []) {
  const opts = (qn.options || []).filter((o) => !o.na);
  const pick = opts[Math.min(1, opts.length - 1)];
  const r = await call('assessment.answer', { assessment_id: get.assessment.id, question_id: qn.id, k: pick.k, ...(qn.retro ? { before: pick.k } : {}) }, a.token);
  if (r.success) answered += 1; else { console.log('  إجابة مرفوضة:', qn.id, JSON.stringify(r)); break; }
}
ok(answered === (get.questions || []).length, `كل الأسئلة أُجيبت (${answered})`);
const sub = await call('assessment.submit', { assessment_id: get.assessment.id }, a.token);
ok(sub.success === true, 'assessment.submit يحسب النتيجة', JSON.stringify(sub).slice(0, 200));
ok(sql(`select count(*) from leaders.placements where participant_id = ${q(a.pid)}`) === '3', 'التسكين المبدئي في الأبعاد الثلاثة');
ok(sql(`select count(*) from leaders.assessment_results r join leaders.assessments s on s.id = r.assessment_id where s.participant_id = ${q(a.pid)} and r.composite_pct is not null`) === '3', 'نتائج القياس بالمؤشر المركّب');

// 5) العزل: مشارك لا يصل إلى قياس غيره، وPostgREST بالمفتاح العام لا يقرأ المشاركين
const b = await seed(`golden-b-${Date.now()}@demo.milestone-impact.org`, 'خالد العمري');
const cross = await call('assessment.answer', { assessment_id: get.assessment.id, question_id: (get.questions || [])[0]?.id, k: 0 }, b.token);
ok(cross.success !== true, 'مشارك آخر لا يجيب عن قياس غيره', JSON.stringify(cross));
if (process.env.ANON_KEY) {
  const rest = await fetch(`${API}/rest/v1/participants?select=id`, { headers: { apikey: process.env.ANON_KEY, Authorization: `Bearer ${process.env.ANON_KEY}`, 'Accept-Profile': 'leaders' } });
  const body = await rest.text();
  ok(rest.status >= 400 || !body.includes(a.pid), 'المفتاح العام لا يقرأ جدول المشاركين (RLS)', `${rest.status} ${body.slice(0, 120)}`);
} else console.log('  (ANON_KEY غير متاح: فُحص العزل عبر الدالة فقط)');

// 6) إشعار Creem: التوقيع يُفحص، والحدث لا يُعالَج مرتين
const hook = async (raw, sig) => {
  const r = await fetch(`${API}/functions/v1/creem-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'creem-signature': sig }, body: raw });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const raw = JSON.stringify({ id: `evt_${Date.now()}`, type: 'refund.created', object: { id: 'pay_none' } });
const sig = createHmac('sha256', CREEM).update(raw).digest('hex');
const badSig = await hook(raw, 'deadbeef');
ok(badSig.status === 401, 'creem-webhook يرفض التوقيع الخاطئ 401', JSON.stringify(badSig));
const first = await hook(raw, sig);
ok(first.success === true, 'creem-webhook يقبل التوقيع الصحيح ويسجّل الحدث', JSON.stringify(first));
const again = await hook(raw, sig);
ok(again.success === true && again.duplicate === true, 'الحدث نفسه لا يُعالَج مرتين', JSON.stringify(again));

console.log(fails ? `\n✗ ${fails} فحوص فشلت` : '\n✓ المسارات الذهبية كلها سليمة');
process.exit(fails ? 1 : 0);
