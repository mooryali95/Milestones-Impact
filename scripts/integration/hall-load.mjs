// اختبار حمل القاعة على Supabase محلي حقيقي (سير integration.yml): N جهازًا افتراضيًا يمرون بجلسة قاعة كاملة
// بالطلبات نفسها التي يرسلها تطبيق المشارك (hall.state بالفاصل نفسه من hallPoll.js، وhall.join وhall.hand وkaton.answer)،
// والخبير يفتح ويقسّم ويدير الجولات ويكشف ويغلق من اللوحة. لا محاكاة للخادم.
// يقيس زمن الرد لكل إجراء والأخطاء وعدد الطلبات وحجم الردود، ويتحقق من سلامة الحالة عند التزامن:
//   1. لا جهاز يبقى على حالة قديمة بعد أن تهدأ القاعة (كل جهاز يرى عدد المجيبين والأيدي كما في القاعدة).
//   2. رقم الإصدار لا يضيع منه تغيير (تغييران متزامنان لا يأخذان الرقم نفسه).
//   3. كل الحاضرين في الحضور، وكلهم مقسَّمون، وكل إجاباتهم محفوظة.
//   4. الطاولات: لكل مشارك رقم طاولة محفوظ، من خمسة إلى سبعة في الطاولة، يثبت طوال الجلسة ويراه على جهازه.
//   5. المؤقت: وقت نهاية الإجابة من الخادم مع كل جولة، وبعد انتهائه ومهلته تُرفض الإجابة (time_up).
//   6. الحضور: القاعة تلتقط جلسة الورشة الجارية، وعند الإغلاق يُكتب حضور من شارك في workshop_attendance بطريقة hall.
// يفشل برمز خروج 1 عند أي خطأ في السلامة أو تجاوز حدود الزمن.
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres API_URL=http://127.0.0.1:54321 node scripts/integration/hall-load.mjs --devices=50
// الخيارات: --devices=50 · --rounds=3 · --round-seconds=12 · --fn-url=<عنوان الدالة مباشرة> · --p95=<حد زمن الرد بالملي ثانية> · --json=<ملف التقرير>
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { POLL_FAIL_LIMIT, POLL_FAST_MS, POLL_SLOW_MS, pollPeriod } from '../../leaders-app/src/hallPoll.js';

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const N = Number(arg('devices', 50));
const ROUNDS = Number(arg('rounds', 3));
const ROUND_S = Number(arg('round-seconds', 12));
const P95_LIMIT = Number(arg('p95', 0));          // 0: بلا حد زمن (السلامة وحدها تحكم)
const API = process.env.API_URL || 'http://127.0.0.1:54321';
const FN = arg('fn-url', `${API}/functions/v1/leaders-api`);
const DB = process.env.DB_URL;
if (!DB) { console.error('DB_URL مطلوب'); process.exit(2); }
const ENV = Object.fromEntries(readFileSync(new URL('../../supabase/functions/ci.env', import.meta.url), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('=')));
const PEPPER = ENV.LEADERS_TOKEN_PEPPER;
const ORIGIN = ENV.LEADERS_ORIGINS.split(',')[0];
const ADMIN_ORIGIN = (ENV.LEADERS_ADMIN_ORIGINS || ORIGIN).split(',')[0];

const sql = (q) => execFileSync('psql', ['-At', '-q', '-v', 'ON_ERROR_STOP=1', DB, '-c', q], { maxBuffer: 64e6 }).toString().trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (v) => createHash('sha256').update(v).digest('hex');

// ── القياس ──
const stats = new Map();   // action → { ms: [], bytes, errors: [] }
const rec = (action) => { if (!stats.has(action)) stats.set(action, { ms: [], bytes: 0, errors: [], fromFunction: 0 }); return stats.get(action); };
async function call(action, body, token, origin = ORIGIN) {
  const s = rec(action);
  const t0 = performance.now();
  try {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...(process.env.ANON_KEY ? { apikey: process.env.ANON_KEY, Authorization: `Bearer ${process.env.ANON_KEY}` } : {}) },
      body: JSON.stringify({ action, ...body, token }),
    });
    const text = await r.text();
    s.ms.push(performance.now() - t0); s.bytes += text.length;
    let j = {}; try { j = JSON.parse(text); } catch { /* رد غير JSON يُحسب خطأ أدناه */ }
    if (j.success !== true) { s.errors.push(`${r.status} ${j.code || ''} ${String(j.message || text).slice(0, 120)}`); if ('success' in j) s.fromFunction += 1; }
    return j;
  } catch (e) {
    s.ms.push(performance.now() - t0); s.errors.push(`network ${String(e?.message || e).slice(0, 120)}`);
    return {};
  }
}
const pct = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]; };

// ── البذرة: دفعة جارية بـN مشاركًا معتمدي المسار، وموضوع منشور، وجلسة مدير ──
const run = `load-${Date.now()}`;
const programId = sql('select id from leaders.programs order by created_at limit 1');
const cohortId = sql(`insert into leaders.cohorts (name, status, program_id) values (${q(`دفعة اختبار الحمل ${run}`)}, 'running', ${q(programId)}) returning id`);
const topicId = sql(`select t.id from leaders.katon_topics t join leaders.katon_sentences s on s.topic_id = t.id group by t.id, t.sort having count(*) >= ${ROUNDS} order by t.sort limit 1`);
if (!topicId) { console.error(`لا موضوع كاتون فيه ${ROUNDS} جمل على الأقل`); process.exit(2); }
const topicWas = sql(`select status from leaders.katon_topics where id = ${q(topicId)}`);
sql(`update leaders.katon_topics set status = 'published' where id = ${q(topicId)}`);
const sentences = sql(`select id from leaders.katon_sentences where topic_id = ${q(topicId)} order by sort`).split('\n');
// إجابات سابقة على الموضوع (تشغيل سابق على القاعدة نفسها) لا تدخل العدّ: مشاركو هذا التشغيل جدد
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const devices = [];
{
  const rows = [], sess = [], enr = [], pls = [];
  for (let i = 0; i < N; i++) {
    const token = randomBytes(24).toString('base64url');
    devices.push({ i, token, email: `${run}-${i}@demo.milestone-impact.org`, version: 0, view: null, inside: false, stop: false, polls: 0 });
    rows.push(`(${q(devices[i].email)}, ${q(`مشارك ${i + 1} الحمل`)}, now(), now())`);
  }
  const ids = sql(`insert into leaders.participants (email, full_name, profile_completed_at, consented_at) values ${rows.join(',')} returning id`).split('\n');
  ids.forEach((id, i) => {
    devices[i].id = id;
    sess.push(`(${q(id)}, ${q(sha(`${PEPPER}:${devices[i].token}`))}, 'email_code', now() + interval '1 day')`);
    enr.push(`(${q(id)}, ${q(cohortId)}, 'active')`);
    for (const d of ['milestone', 'impact', 'leadership']) pls.push(`(${q(id)}, ${q(d)}, ${q(LEVELS[i % 3])}, 'admin', now(), 'load-test')`);
  });
  sql(`insert into leaders.auth_sessions (participant_id, token_hash, method, expires_at) values ${sess.join(',')}`);
  sql(`insert into leaders.enrollments (participant_id, cohort_id, status) values ${enr.join(',')}`);
  sql(`insert into leaders.placements (participant_id, dimension, level, source, approved_at, approved_by) values ${pls.join(',')}`);
}
// جلسة ورشة جارية للدفعة: القاعة تلتقطها عند الفتح، وفيها يُكتب الحضور عند الإغلاق
const workshopReq = sql(`select id from leaders.stage_requirements where kind = 'workshop' order by sort limit 1`);
if (!workshopReq) { console.error('لا متطلب ورشة مزروع (T-ATTEND) لربط جلسة القاعة به'); process.exit(2); }
const workshopId = sql(`insert into leaders.workshop_sessions (requirement_id, title_ar, starts_at, ends_at, secret, cohort_id) values (${q(workshopReq)}, ${q(`يوم تدريبي ${run}`)}, now() - interval '10 minutes', now() + interval '3 hours', ${q(randomBytes(16).toString('hex'))}, ${q(cohortId)}) returning id`);
const adminToken = randomBytes(32).toString('base64url');
sql(`insert into public.api_sessions (token_hash, kind, subject, meta, expires_at) values (${q(sha(adminToken))}, 'admin', 'load@test', '{"email":"load@test","role":"super_admin","method":"passkey"}', now() + interval '1 hour')`);
const admin = (action, body = {}) => call(action, body, adminToken, ADMIN_ORIGIN);

let fails = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${msg}${cond ? '' : ` ${extra}`}`); if (!cond) fails += 1; };

// ── الجهاز: يسأل بالفاصل الذي يحسبه التطبيق من حال القاعة، ويحمل رقم إصداره كما يفعل Hall.jsx ──
function absorb(d, r) {
  if (!r.success || r.unchanged) return;
  d.version = r.session?.version || 0; d.view = r; d.inside = r.inside ?? d.inside;
}
async function pollLoop(d) {
  await sleep(Math.random() * POLL_SLOW_MS);   // الأجهزة لا تبدأ في اللحظة نفسها
  while (!d.stop) {
    const r = await call('hall.state', { since: d.version }, d.token);
    // كما في Hall.jsx: إخفاق السؤال الدوري يصلحه السؤال التالي، وتوالي الإخفاقات هو ما يراه المشارك خطأً
    if (r.success) d.failRun = 0; else { d.failRun = (d.failRun || 0) + 1; d.worstRun = Math.max(d.worstRun || 0, d.failRun); }
    absorb(d, r);
    d.polls += 1;
    await sleep(pollPeriod(d.view));
  }
}
// الإجراء في التطبيق: hall.join وhall.hand يعيدان الحالة، وkaton.answer يتبعه تحميل كامل (since: 0)
async function act(d, action, body) {
  const r = await call(action, body, d.token);
  if (action === 'katon.answer') { if (r.success) absorb(d, await call('hall.state', { since: 0 }, d.token)); return r; }
  absorb(d, r);
  return r;
}
// يهدأ حين يمر فاصلان بطيئان بلا إجراء: كل جهاز سأل مرة على الأقل بعد آخر تغيير
const settle = () => sleep(POLL_SLOW_MS * 2 + 1500);
const live = () => {
  const [stage, version, sentence] = sql(`select stage, version, coalesce(sentence_id::text, '') from leaders.hall_sessions where cohort_id = ${q(cohortId)} and stage <> 'closed'`).split('|');
  return { stage, version: Number(version), sentence };
};
// كل جهاز يرى ما في القاعدة: الإصدار، وعدد المجيبين، وعدد الأيدي المرفوعة
function consistent(label, { answered = null, hands = null } = {}) {
  const s = live();
  const stale = devices.filter((d) => d.version !== s.version);
  ok(!stale.length, `${label}: كل الأجهزة على الإصدار الحي ${s.version}`, `${stale.length} جهازًا على إصدار أقدم (مثل ${stale[0]?.version})`);
  if (answered != null) {
    const wrong = devices.filter((d) => d.view?.answered !== answered);
    ok(!wrong.length, `${label}: كل الأجهزة ترى ${answered} مجيبًا`, `${wrong.length} جهازًا يرى غير ذلك (مثل ${wrong[0]?.view?.answered})`);
  }
  if (hands != null) {
    const wrong = devices.filter((d) => (d.view?.people || []).filter((p) => p.hand).length !== hands);
    ok(!wrong.length, `${label}: كل الأجهزة ترى ${hands} يدًا مرفوعة`, `${wrong.length} جهازًا يرى غير ذلك`);
  }
}

console.log(`\nاختبار حمل القاعة: ${N} جهازًا، ${ROUNDS} جولات، الجولة ${ROUND_S} ثانية، الفاصل ${POLL_FAST_MS / 1000}/${POLL_SLOW_MS / 1000} ثانية\n`);
const started = Date.now();

// 1) الخبير يفتح القاعة، والأجهزة تبدأ السؤال ثم تنضم خلال ثوانٍ (لحظة «افتحوا القاعة الآن»)
const opened = await admin('admin.hall-open', { cohort_id: cohortId, topic_id: topicId, mode: 'live' });
ok(opened.success === true && opened.session?.stage === 'enter', 'الخبير يفتح القاعة', JSON.stringify(opened).slice(0, 200));
const sessionId = opened.session?.id;
ok(opened.attendance?.workshop?.id === workshopId, 'القاعة التقطت جلسة الورشة الجارية للحضور', JSON.stringify(opened.attendance || null));
ok(sql(`select coalesce(workshop_session_id::text, '') from leaders.hall_sessions where id = ${q(sessionId)}`) === workshopId, 'الربط بجلسة الورشة محفوظ في القاعدة');
const loops = devices.map(pollLoop);
const v0 = live().version;
await Promise.all(devices.map(async (d) => { await sleep(Math.random() * 4000); await act(d, 'hall.join', {}); }));
ok(Number(sql(`select count(*) from leaders.hall_presence where session_id = ${q(sessionId)}`)) === N, `الحضور: ${N} في القاعدة`);
// كل انضمام يرفع الإصدار مرة: إن ضاع رفع فقد أخذ تغييران الرقم نفسه، وجهاز سأل بينهما يبقى على القديم
ok(live().version - v0 === N, `${N} انضمامًا متزامنًا رفعت الإصدار ${N} مرة`, `ارتفع ${live().version - v0} فقط: ضاعت ${N - (live().version - v0)}`);
await settle();
consistent('بعد الدخول');
ok(devices.every((d) => (d.view?.people || []).filter((p) => p.joined).length === N), `كل جهاز يرى ${N} منضمًّا`);

// 2) التقسيم الآلي ثم أول جولة
const split = await admin('admin.hall-split', { session_id: sessionId, method: 'mixed' });
ok(split.success === true && split.session?.stage === 'split', 'التقسيم الآلي', JSON.stringify(split).slice(0, 200));
ok(Number(sql(`select count(*) from leaders.cohort_roles where cohort_id = ${q(cohortId)}`)) === N, `كل الحاضرين (${N}) في فريق`);
await sleep(POLL_FAST_MS * 2);

// 2ب) الطاولات: محفوظة لكل مشارك، من خمسة إلى سبعة، وكل طاولة من فريق واحد، وكل جهاز يرى طاولته
const seatsNow = () => Object.fromEntries(sql(`select participant_id || '|' || team || '|' || coalesce(table_no::text, '') from leaders.cohort_roles where cohort_id = ${q(cohortId)}`).split('\n').map((l) => { const [id, team, no] = l.split('|'); return [id, { team, no: Number(no) || null }]; }));
const seats0 = seatsNow();
ok(Object.values(seats0).every((x) => x.no), `الطاولات: لكل من الـ${N} رقم طاولة محفوظ`, `${Object.values(seats0).filter((x) => !x.no).length} بلا طاولة`);
{
  const sizes = {}, teams = {};
  for (const x of Object.values(seats0)) { sizes[x.no] = (sizes[x.no] || 0) + 1; (teams[x.no] ||= new Set()).add(x.team); }
  const ns = Object.values(sizes);
  // القيادة أصغر الفرق (ثُمن العدد)، فطاولتها قد تقل عن خمسة في الأعداد الصغيرة؛ الحد الأدنى يُفحص من 40 مشاركًا
  ok(Math.max(...ns) <= 7 && (N < 40 || Math.min(...ns) >= 5), `الطاولات: ${ns.length} طاولة، في كل منها من خمسة إلى سبعة`, `الأحجام ${ns.sort((a, b) => a - b).join(',')}`);
  ok(Object.values(teams).every((t) => t.size === 1), 'الطاولات: كل طاولة من فريق واحد');
}
await settle();
ok(devices.every((d) => (d.view?.people || []).find((p) => p.id === d.id)?.table === seats0[d.id].no), 'الطاولات: كل جهاز يرى رقم طاولته المحفوظ');
// نقل مشارك إلى فريق آخر من الخبير: يترك طاولته ويُلحق بطاولة من فريقه الجديد، ولا يتحرك غيره
{
  const mover = devices[0], to = seats0[mover.id].team === 'eval' ? 'guide' : 'eval';
  const moved = await admin('admin.hall-assign', { session_id: sessionId, participant_id: mover.id, team: to });
  const after = seatsNow();
  const teamTables = new Set(Object.entries(seats0).filter(([, x]) => x.team === to).map(([, x]) => x.no));
  ok(moved.success === true && after[mover.id].team === to && teamTables.has(after[mover.id].no), `النقل: المشارك انتقل إلى طاولة من فريقه الجديد (${after[mover.id].no})`, JSON.stringify(after[mover.id]));
  ok(Object.keys(seats0).every((id) => id === mover.id || after[id].no === seats0[id].no), 'النقل: لم تتغير طاولة أحد غيره');
}
const seats1 = seatsNow();

// 3) الجولات: الكل يجيب في أوقات متفرقة داخل الجولة، وخُمسهم يرفع يده، ثم الكشف، ثم الجملة التالية
for (let r = 0; r < ROUNDS; r++) {
  const step = r === 0 ? await admin('admin.hall-step', { session_id: sessionId, stage: 'round' }) : await admin('admin.hall-step', { session_id: sessionId, next: true });
  ok(step.success === true && step.session?.stage === 'round', `الجولة ${r + 1}: تبدأ`, JSON.stringify(step).slice(0, 200));
  const sid = live().sentence;
  // المؤقت يملكه الخادم: وقت نهاية في الرد وفي القاعدة، بعد الآن وضمن المدة الافتراضية
  {
    const left = (new Date(step.session?.ends_at || 0).getTime() - new Date(step.now || 0).getTime()) / 1000;
    ok(left > 60 && left <= 91, `الجولة ${r + 1}: المؤقت من الخادم (${Math.round(left)} ثانية)`, `ends_at ${step.session?.ends_at} · now ${step.now}`);
  }
  await sleep(POLL_FAST_MS + 500);   // الأجهزة تلتقط الجملة
  const raisers = devices.filter((d) => d.i % 5 === r % 5);
  const vBefore = live().version;
  await Promise.all(devices.map(async (d) => {
    await sleep(Math.random() * ROUND_S * 1000);
    if (raisers.includes(d)) await act(d, 'hall.hand', { raised: true });
    await act(d, 'katon.answer', { sentence_id: sid, verdict: d.i % 2 ? 'true' : 'false', confidence: 1 + (d.i % 3), stances: [] });
  }));
  const saved = Number(sql(`select count(*) from leaders.katon_answers where sentence_id = ${q(sid)} and participant_id in (select participant_id from leaders.enrollments where cohort_id = ${q(cohortId)})`));
  ok(saved === N, `الجولة ${r + 1}: ${N} إجابة محفوظة`, `المحفوظ ${saved}`);
  const bumps = N + raisers.length;
  ok(live().version - vBefore === bumps, `الجولة ${r + 1}: ${bumps} تغييرًا متزامنًا رفعت الإصدار ${bumps} مرة`, `ارتفع ${live().version - vBefore}: ضاعت ${bumps - (live().version - vBefore)}`);
  await settle();
  consistent(`الجولة ${r + 1} بعد الإجابات`, { answered: N, hands: raisers.length });
  // آخر جولة: بعد انتهاء الوقت ومهلته تُرفض الإجابة برمز time_up، ثم يمدّد الخبير فتُقبل (طلبان خارج القياس)
  if (r === ROUNDS - 1) {
    const raw = async (d, body) => (await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(process.env.ANON_KEY ? { apikey: process.env.ANON_KEY, Authorization: `Bearer ${process.env.ANON_KEY}` } : {}) }, body: JSON.stringify({ action: 'katon.answer', ...body, token: d.token }) })).json().catch(() => ({}));
    const again = { sentence_id: sid, verdict: 'true', confidence: 1, stances: [] };
    sql(`update leaders.hall_sessions set phase_ends_at = now() - interval '30 seconds' where id = ${q(sessionId)}`);
    const late = await raw(devices[1], again);
    ok(late.success === false && late.code === 'time_up', 'المؤقت: الإجابة بعد انتهاء الوقت تُرفض (time_up)', JSON.stringify(late).slice(0, 160));
    const more = await admin('admin.hall-step', { session_id: sessionId, extend: 30 });
    ok(more.success === true && new Date(more.session?.ends_at || 0).getTime() > new Date(more.now || 0).getTime(), 'المؤقت: التمديد يفتح الإجابة من جديد', JSON.stringify(more.session || null).slice(0, 160));
    const fine = await raw(devices[1], again);
    ok(fine.success === true, 'المؤقت: الإجابة بعد التمديد تُقبل', JSON.stringify(fine).slice(0, 160));
    await settle();
  }
  const reveal = await admin('admin.hall-step', { session_id: sessionId, stage: 'reveal' });
  ok(reveal.success === true && reveal.revealed === true, `الجولة ${r + 1}: الكشف`, JSON.stringify(reveal).slice(0, 160));
  await Promise.all(raisers.map((d) => act(d, 'hall.hand', { raised: false })));
  await settle();
  consistent(`الجولة ${r + 1} بعد الكشف`, { hands: 0 });
  ok(devices.every((d) => d.view?.revealed === true && d.view?.sentence?.key != null), `الجولة ${r + 1}: كل جهاز يرى المفتاح بعد الكشف`);
}

// الطاولات ثبتت طوال الجولات
{
  const end = seatsNow();
  ok(Object.keys(seats1).every((id) => end[id]?.no === seats1[id].no && end[id]?.team === seats1[id].team), 'الطاولات: ثبتت أرقامها وفرقها طوال الجولات');
}

// 4) الإغلاق: يُكتب حضور من شارك في حضور الورشة، والأجهزة تعود إلى «لا قاعة مفتوحة»
const closed = await admin('admin.hall-close', { session_id: sessionId });
ok(closed.success === true, 'الخبير يغلق القاعة', JSON.stringify(closed).slice(0, 160));
ok(closed.attendance?.written === N && closed.attendance?.rounds === ROUNDS, `الحضور: الإغلاق يبلّغ بكتابة ${N} حاضرًا عن ${ROUNDS} جولات`, JSON.stringify(closed.attendance || null));
ok(Number(sql(`select count(*) from leaders.workshop_attendance where session_id = ${q(workshopId)} and method = 'hall'`)) === N, `الحضور: ${N} صفًّا بطريقة hall في حضور الورشة`);
await sleep(POLL_FAST_MS * 2);
for (const d of devices) d.stop = true;
await Promise.all(loops);
const seconds = (Date.now() - started) / 1000;

// ── التقرير ──
const rows = [...stats.entries()].map(([action, s]) => ({
  action, n: s.ms.length, errors: s.errors.length, p50: Math.round(pct(s.ms, 50)), p95: Math.round(pct(s.ms, 95)), max: Math.round(Math.max(0, ...s.ms)), kb: Math.round(s.bytes / 1024),
}));
const total = rows.reduce((a, r) => a + r.n, 0);
const polls = rec('hall.state');
console.log(`\n${'الإجراء'.padEnd(18)} ${'الطلبات'.padStart(8)} ${'أخطاء'.padStart(6)} ${'p50'.padStart(6)} ${'p95'.padStart(6)} ${'الأقصى'.padStart(7)} ${'ك.ب'.padStart(8)}`);
for (const r of rows) console.log(`${r.action.padEnd(18)} ${String(r.n).padStart(8)} ${String(r.errors).padStart(6)} ${String(r.p50).padStart(6)} ${String(r.p95).padStart(6)} ${String(r.max).padStart(7)} ${String(r.kb).padStart(8)}`);
const perHour = Math.round((total / seconds) * 3600);
console.log(`\nالمدة ${Math.round(seconds)} ثانية · ${total} طلبًا (${(total / seconds).toFixed(1)} في الثانية، نحو ${perHour.toLocaleString('en')} في الساعة) · ${Math.round(rows.reduce((a, r) => a + r.kb, 0) / 1024 * 10) / 10} م.ب ردودًا`);
const errors = rows.reduce((a, r) => a + r.errors, 0);
const detail = [...stats.entries()].filter(([, s]) => s.errors.length).map(([a, s]) => `${a}: ${s.errors.length} (${s.errors[0]})`).join(' · ');
// الدالة نفسها لا تخطئ أبدًا، وكل كتابة (دخول، يد، إجابة، وأوامر الخبير) تنجح. سؤال الحالة الدوري قد تردّه بوابة
// الدوال 500 عابرًا تحت الحمل (واحد من نحو 1900 في CI): يُقبل ما دام نادرًا وأصلحه السؤال التالي قبل أن يراه المشارك
const fromFunction = [...stats.values()].reduce((a, s) => a + s.fromFunction, 0);
const writeErrors = errors - polls.errors.length;
const worst = Math.max(0, ...devices.map((d) => d.worstRun || 0));
ok(fromFunction === 0, 'الدالة لم ترد خطأً على أي طلب', detail);
ok(writeErrors === 0, 'لا كتابة فاشلة (دخول، يد، إجابة، أوامر الخبير)', detail);
ok(polls.errors.length <= Math.ceil(polls.ms.length * 0.005), `إخفاقات سؤال الحالة العابرة ${polls.errors.length} من ${polls.ms.length} (الحد نصف بالمئة)`, detail);
ok(worst < POLL_FAIL_LIMIT, `لا جهاز توالت إخفاقاته حتى حد العرض ${POLL_FAIL_LIMIT} (الأسوأ ${worst})`);
if (polls.errors.length) console.log(`  إخفاقات عابرة من البوابة: ${detail}`);
if (P95_LIMIT) for (const r of rows) ok(r.p95 <= P95_LIMIT, `${r.action}: p95 ${r.p95} م.ث ضمن ${P95_LIMIT}`);
const out = arg('json', '');
if (out) writeFileSync(out, JSON.stringify({ devices: N, rounds: ROUNDS, seconds, total, per_hour: perHour, polls_per_device: Math.round(polls.ms.length / N), rows, fails }, null, 2));

// ── التنظيف: ما زُرع لهذا التشغيل وحده ──
sql(`delete from leaders.workshop_sessions where id = ${q(workshopId)}`);
sql(`delete from leaders.participants where email like ${q(`${run}-%`)}`);
sql(`delete from leaders.cohorts where id = ${q(cohortId)}`);
sql(`delete from public.api_sessions where subject = 'load@test'`);
sql(`update leaders.katon_topics set status = ${q(topicWas)} where id = ${q(topicId)}`);

console.log(fails ? `\n✗ ${fails} فحوص فشلت` : '\n✓ القاعة سليمة تحت الحمل');
process.exit(fails ? 1 : 0);
