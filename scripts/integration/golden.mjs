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

// 2) التسجيل: الحدود والتحقق البشري قبل أي إرسال، والرد واحد لكل بريد مسجلًا كان أو جديدًا (التدقيق 2026-11-10)،
// والاسم بعد إثبات ملكية البريد: الرمز الصحيح بلا اسم يعيد needs_name ولا يُستهلك، ومعه الاسم يُنشأ الحساب
const email = `golden-${Date.now()}@demo.milestone-impact.org`;
const bare = await call('auth.start', { email });
ok(bare.code === 'captcha' && !!bare.site_key && bare.needs_name !== true, 'بريد جديد بلا تحقق بشري: يُطلب التحقق ولا يُكشف أنه جديد', JSON.stringify(bare));
const human = await call('auth.start', { email, captcha: HUMAN });
ok(human.success === true && human.sent === true && human.needs_name === undefined && human.pass === undefined, 'بريد جديد بعد التحقق البشري: يُرسل الرمز ولا يُطلب الاسم', JSON.stringify(human));
const known = await seed(`golden-known-${Date.now()}@demo.milestone-impact.org`, 'مشارك مسجل');
const knownEmail = sql(`select email from leaders.participants where id = ${q(known.pid)}`);
const old = await call('auth.start', { email: knownEmail, captcha: HUMAN });
const shape = (r) => JSON.stringify(Object.keys(r).filter((k) => k !== 'status').sort().map((k) => [k, r[k]]));
ok(shape(old) === shape(human), 'الرد نفسه لبريد مسجل وبريد جديد: لا يُعرف من صفحة الدخول من سُجّل', `${shape(old)} / ${shape(human)}`);
const ch = sql(`select code_hash, purpose, coalesce(pending_profile->>'full_name', '') from leaders.email_challenges where email = ${q(email)} order by created_at desc limit 1`).split('|');
ok(/^[0-9a-f]{64}$/.test(ch[0] || ''), 'الرمز محفوظ هاشًا (64 hex) لا نصًا');
ok(ch[1] === 'register' && ch[2] === '', 'التحدي تسجيل بلا اسم: الاسم بعد التحقق من البريد', ch.join('|'));
// الاسم بعد الرمز: تحدٍّ برمز معروف (الحقيقي يصل بالبريد ولا يُقرأ)
const fresh = `golden-new-${Date.now()}@demo.milestone-impact.org`;
const CODE = '135790';
sql(`insert into leaders.email_challenges (email, purpose, code_hash, link_token_hash, pending_profile, expires_at) values (${q(fresh)}, 'register', ${q(hash(CODE))}, ${q(hash(`l-${fresh}`))}, '{}'::jsonb, now() + interval '15 minutes')`);
const noName = await call('auth.verify', { email: fresh, code: CODE });
ok(noName.success === false && noName.code === 'needs_name' && !noName.token, 'الرمز الصحيح لبريد جديد بلا اسم: needs_name بلا جلسة', JSON.stringify(noName));
ok(sql(`select (consumed_at is null)::text from leaders.email_challenges where email = ${q(fresh)}`) === 'true', 'التحدي باقٍ صالحًا حتى يُكتب الاسم');
const badPhone = await call('auth.verify', { email: fresh, code: CODE, confirm_new: true, full_name: 'مشارك جديد', phone: '12' });
ok(badPhone.code === 'phone', 'جوال غير صحيح يُرفض قبل محاولات الرمز', JSON.stringify(badPhone));
const named = await call('auth.verify', { email: fresh, code: CODE, confirm_new: true, full_name: 'مشارك المسار الذهبي' });
ok(named.success === true && !!named.token && named.participant?.full_name === 'مشارك المسار الذهبي', 'الاسم مع الرمز: يُنشأ الحساب وتُفتح الجلسة', JSON.stringify(named).slice(0, 200));
ok(sql(`select attempts::text from leaders.email_challenges where email = ${q(fresh)}`) === '2', 'خطأ الجوال لم يستهلك محاولة: محاولتان فقط');
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

// 6ب) دورة دفع كاملة (مراجعة الدفع 2026-11-13): إشعار checkout.completed مطابق يسوّي الدفعة ويمنح الحق، ودفعة ناقصة
// تُعلَّق بلا حق، واسترداد يحمل معرّف الطلب نصًا (لا كائنًا) يسحب الحق. الدفعة تُنشأ في القاعدة كما ينشئها checkout.
const event = async (type, object) => {
  const body = JSON.stringify({ id: `evt_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, eventType: type, object });
  return hook(body, createHmac('sha256', CREEM).update(body).digest('hex'));
};
const newPayment = (pid, item, cents) => sql(`insert into leaders.payments (participant_id, email, item, product_id, mode, amount_cents, currency)
  values (${q(pid)}, 'pay-golden@example.sa', ${q(item)}, 'prod_golden', 'test', ${cents}, 'USD') returning id`);
const liveEnt = (pid, item) => sql(`select count(*) from leaders.entitlements where participant_id = ${q(pid)} and item = ${q(item)} and revoked_at is null`);
sql(`update leaders.entitlements set revoked_at = now() where participant_id = ${q(b.pid)} and revoked_at is null`);
const shortPay = newPayment(b.pid, 'assessment', 100);
const short = await event('checkout.completed', { request_id: shortPay, mode: 'test', order: { id: `ord_short_${Date.now()}`, amount: 50, currency: 'USD', product: 'prod_golden' } });
ok(short.success === true && liveEnt(b.pid, 'assessment') === '0', 'دفعة بمبلغ أقل من المطلوب تُعلَّق ولا تمنح حقًا', JSON.stringify(short));
const goodPay = newPayment(b.pid, 'assessment', 100);
const orderId = `ord_good_${Date.now()}`;
const paidEv = await event('checkout.completed', { request_id: goodPay, mode: 'test', order: { id: orderId, amount: 100, currency: 'USD', product: 'prod_golden' } });
ok(paidEv.success === true && liveEnt(b.pid, 'assessment') === '1', 'إشعار دفع مطابق يمنح حق القياس', JSON.stringify(paidEv));
ok(sql(`select status from leaders.payments where id = ${q(goodPay)}`) === 'paid', 'الدفعة سُوّيت paid');
const refundEv = await event('refund.created', { id: `ref_${Date.now()}`, order: orderId });
ok(refundEv.success === true && liveEnt(b.pid, 'assessment') === '0', 'استرداد بمعرّف الطلب نصًا يسحب الحق', JSON.stringify(refundEv));
ok(sql(`select status from leaders.payments where id = ${q(goodPay)}`) === 'refunded', 'الدفعة صارت refunded');

// استبيان سهولة الاستخدام SUS: الاستحقاق بعد أسبوع، والتأجيل، والإجابة مرة واحدة، والدرجة المحسوبة على الخادم
const susNew = await seed(`sus-new-${Date.now()}@example.sa`, 'مشارك جديد');
const susOld = await seed(`sus-old-${Date.now()}@example.sa`, 'مشارك منذ أسبوع');
sql(`update leaders.participants set created_at = now() - interval '9 days' where id = ${q(susOld.pid)}`);
const susA = await call('sus.state', {}, susNew.token);
ok(susA.success && susA.ready && !susA.due, 'SUS: حساب جديد غير مستحق', JSON.stringify(susA));
const susB = await call('sus.state', {}, susOld.token);
ok(susB.success && susB.due, 'SUS: مستحق بعد أسبوع', JSON.stringify(susB));
const susC = await call('sus.submit', { snooze: true }, susOld.token);
const susD = await call('sus.state', {}, susOld.token);
ok(susC.snoozed === true && susD.success && !susD.due && !susD.answered, 'SUS: التأجيل يخفي البطاقة ولا يُحسب إجابة', JSON.stringify(susD));
const susE = await call('sus.submit', { answers: [5, 1, 5] }, susOld.token);
ok(susE.status === 400, 'SUS: إجابة ناقصة تُرفض 400', JSON.stringify(susE));
const susF = await call('sus.submit', { answers: [4, 1, 5, 2, 4, 1, 5, 1, 4, 2] }, susOld.token);
ok(susF.success && sql(`select score from leaders.sus_responses where subject_id = ${q(susOld.pid)}`) === '87.5', 'SUS: الإجابة تُحفظ بدرجة 87.5', JSON.stringify(susF));
const susG = await call('sus.submit', { answers: [4, 1, 5, 2, 4, 1, 5, 1, 4, 2] }, susOld.token);
ok(susG.status === 409, 'SUS: إجابة ثانية تُرفض 409', JSON.stringify(susG));

// خريطة الرحلة في لوحة الجهة (2026-11-11): التجميع على قاعدة حقيقية من رحلة المشارك نفسها، والأسماء بصلاحية القائمة وحدها
const orgId = sql(`insert into leaders.organizations (name) values ('جهة خريطة الرحلة') returning id`);
const mapP = await seed(`map-${Date.now()}@example.sa`, 'مشارك الخريطة');
sql(`update leaders.participants set organization_id = ${q(orgId)} where id = ${q(mapP.pid)}`);
const coordId = sql(`insert into leaders.org_coordinators (organization_id, email, status, permissions) values (${q(orgId)}, ${q(`coord-map-${Date.now()}@example.sa`)}, 'active', '{"list": false}'::jsonb) returning id`);
sql(`insert into leaders.consent_events (subject, subject_id, kind, version) values ('coordinator', ${q(coordId)}, 'accept', '9999-12-31')`);
const coordToken = randomBytes(24).toString('base64url');
sql(`insert into leaders.coordinator_sessions (coordinator_id, token_hash, method, expires_at) values (${q(coordId)}, ${q(hash(coordToken))}, 'email_code', now() + interval '1 day')`);
const cm = await call('coord.me', { with_dashboard: true }, coordToken);
const jm = cm.preload?.dashboard?.journey_map;
ok(cm.success === true && Array.isArray(jm?.stages) && jm.stages.length >= 3, 'لوحة الجهة تحمل خريطة الرحلة بمراحل البرنامج', JSON.stringify(cm).slice(0, 400));
const here = (jm?.stages || []).reduce((n, s) => n + s.here, 0);
ok(jm?.totals?.total === 1 && here + (jm?.totals?.finished || 0) === 1 && jm.stages[0].here === 1, 'المشارك الجديد يقف عند أول مرحلة، ومجموع الواقفين والمنهين عدد المشاركين', JSON.stringify(jm?.stages?.map((s) => [s.key, s.here])));
ok(!JSON.stringify(jm || {}).includes('مشارك الخريطة') && jm?.stages?.[0]?.people === undefined, 'بلا صلاحية القائمة: لا اسم في الخريطة، وأسباب مجمّعة وحدها', JSON.stringify(jm?.stages?.[0]));

console.log(fails ? `\n✗ ${fails} فحوص فشلت` : '\n✓ المسارات الذهبية كلها سليمة');
process.exit(fails ? 1 : 0);
