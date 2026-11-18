#!/usr/bin/env node
// دخان ما بعد النشر للدوال السبع بمعيار ش6 (تصور تحديث المنصة، المرحلة 2). منطق القرار نقي يختبره
// scripts/ops/release-safety.test.js، والتشغيل يسأل الإنتاج بطلبات المسبار نفسها التي يسألها probe.yml.
//
//   node scripts/ops/smoke.mjs deploy    بعد نشر الدوال: 10 محاولات لكل دالة على مدى دقيقتين تقريبًا
//   node scripts/ops/smoke.mjs check     بلا نشر (ترقية الواجهة وحدها، أو التحقق بعد تراجع): 3 محاولات
//   --tree=<مجلد>  الشجرة المنشورة فعلًا (بعد تراجع إلى إيداع أقدم): يُسأل كل دالة بما تعرفه تلك الشجرة (probesFor)
//
// القاعدة (ش6): الفشل العابر (BOOT_ERROR واحد، أو مهلة واحدة) يُعاد فحصه ولا يُسقط النشر. الفشل المستمر وحده
// يُسقطه: 3 إخفاقات متتالية لدالة واحدة، أو إخفاقات أكثر من 20% من محاولات الوضع (في 10 محاولات: 3 فأكثر).
// في 10 محاولات تكفي القاعدة الثانية وحدها، والأولى تختصر الانتظار: تُعلن الفشل فور ثالث إخفاق متتالٍ.
// شرط «5 من 5» يُنتج تراجعات كاذبة، وكل تراجع نشر جديد بإقلاع بارد جديد.
// رمز الخروج: 0 نجاح، 1 فشل مستمر (يقرأه ci.yml فيتراجع)، 2 خطأ في الاستدعاء.
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_REF = 'eormhcupwgwpllhrfxxg';
export const FUNCTION_REGION = 'ap-south-1';

// الدوال السبع بترتيب نشرها في ci.yml وdeploy-leaders-api.yml (وخطوتا التسخين فيهما بالقائمة نفسها، يحرسها
// release-safety.test.js)، وطلب مسبار كل منها. الخمس التي تخدم واجهة
// بإجراء يمر بالقاعدة، والخطافان بطلب GET لا يمس شيئًا (_shared/health.ts)
export const FUNCTIONS = [
  { name: 'leaders-api', method: 'POST', action: 'system.ping' },
  { name: 'creem-webhook', method: 'GET', noVerifyJwt: true },
  { name: 'leaders-hooks', method: 'GET', noVerifyJwt: true },
  { name: 'send-otp', method: 'POST', action: 'ping' },
  { name: 'admin-api', method: 'POST', action: 'ping' },
  { name: 'user-api', method: 'POST', action: 'ping' },
  { name: 'agent-chat', method: 'POST', action: 'ping' },
];

// المسابير الثلاثة الجديدة (فحص GET في الخطافين وping في send-otp) أُضيفت في 2026-11-18، والتراجع يشغّل دخان main
// على كود أقدم. فبـ --tree يُسأل كل دالة بما تعرفه شجرتها: الخطاف بلا _shared/health.ts يرد على GET بـ405 من
// الدالة نفسها {"success":false}، وsend-otp بلا ping يرد بـ400 {"error":"Invalid action"}، وكلاهما رد من دالة
// أقلعت (عطل الإقلاع يرد من البوابة بغير هذا). ودالة لا تعرف شجرتها مسبارها أصلًا لا تُفحص، وتظهر في الجدول بذلك.
export const LEGACY = {
  'creem-webhook': { marker: /healthCheck\(req/, alive: { status: 405, body: { success: false } } },
  'leaders-hooks': { marker: /healthCheck\(req/, alive: { status: 405, body: { success: false } } },
  'send-otp': { marker: /action === ["']ping["']/, alive: { status: 400, body: { error: 'Invalid action' } } },
};

// read(relPath) نص الملف أو null، list(relDir) أسماء الملفات أو []. يُحقنان في الاختبار
export function probesFor({ read, list }, functions = FUNCTIONS) {
  return functions.map((fn) => {
    const dir = `supabase/functions/${fn.name}`;
    const files = list(dir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
    if (!files.length) return { ...fn, skip: 'الدالة غير موجودة في الشجرة' };
    const src = files.map((f) => read(`${dir}/${f}`) || '').join('\n');
    const legacy = LEGACY[fn.name];
    if (legacy && !legacy.marker.test(src)) return { ...fn, legacy: legacy.alive };
    if (fn.action && !src.includes(`'${fn.action}'`) && !src.includes(`"${fn.action}"`)) return { ...fn, skip: `الشجرة لا تعرف المسبار ${fn.action}` };
    return fn;
  });
}

export function treeReader(root) {
  return {
    read: (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return null; } },
    list: (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)) : []),
  };
}

export const MODES = {
  deploy: { attempts: 10, intervalMs: 12_000, maxConsecutive: 3, maxFailRatio: 0.2, decides: true },
  // بلا نشر: الدالة سليمة بأول نجاح، وتفشل بثلاثة إخفاقات متتالية فقط
  check: { attempts: 3, intervalMs: 10_000, maxConsecutive: 3, maxFailRatio: 1, passOnOk: true, decides: true },
};

// حكم دالة واحدة من نتائج محاولاتها حتى الآن (true نجاح): fail أو pass أو pending (تُكمل المحاولات)
export function verdict(results, rule) {
  let run = 0;
  for (let i = results.length - 1; i >= 0 && !results[i]; i--) run++;
  const failures = results.filter((ok) => !ok).length;
  if (run >= rule.maxConsecutive) return 'fail';
  if (failures / rule.attempts > rule.maxFailRatio) return 'fail';
  if (rule.passOnOk && results.at(-1)) return 'pass';
  return results.length >= rule.attempts ? 'pass' : 'pending';
}

// طلب المسبار لدالة: الرابط والخيارات. المفتاح العام وحده، والمنطقة نفسها التي تطلبها الواجهات
export function probeRequest(fn, { ref = PROJECT_REF, anon = '' } = {}) {
  const url = `https://${ref}.supabase.co/functions/v1/${fn.name}?forceFunctionRegion=${FUNCTION_REGION}`;
  const headers = { Origin: 'https://leaders.sunkvalue.com' };
  if (anon) Object.assign(headers, { apikey: anon, Authorization: `Bearer ${anon}` });
  if (fn.method === 'GET') return { url, init: { method: 'GET', headers } };
  return { url, init: { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: fn.action }) } };
}

// المحاولة تنجح برد 200 وجسم JSON فيه success: true، وكل ما سواه إخفاق (ومعه سببه للسجل)
// legacy: رد الشجرة القديمة الذي يثبت أن الدالة أقلعت (LEGACY)، يطابق حالته وكل حقل في جسمه
export function judge(status, text, legacy = null) {
  let body = null;
  try { body = JSON.parse(text); } catch { /* ليس JSON */ }
  if (status === 200 && body && body.success === true) return { ok: true, note: body.db_ms != null ? `db_ms ${body.db_ms}` : 'ok' };
  if (legacy && status === legacy.status && body && Object.entries(legacy.body).every(([k, v]) => body[k] === v)) return { ok: true, note: `legacy ${status}` };
  return { ok: false, note: `${status} ${String(text || '').replace(/\s+/g, ' ').slice(0, 160)}` };
}

export async function probeOnce(fn, { fetchImpl = fetch, timeoutMs = 20_000, ...opts } = {}) {
  const { url, init } = probeRequest(fn, opts);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { ...init, signal: ctl.signal });
    return judge(r.status, await r.text(), fn.legacy || null);
  } catch (e) {
    return { ok: false, note: `network ${e?.name === 'AbortError' ? 'timeout' : String(e?.message || e).slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}

// جولات متتالية، كل جولة تسأل الدوال المعلقة معًا. يتوقف فور فشل مستمر لأي دالة (فيبدأ التراجع أسرع)،
// أو حين تحسم كل الدوال. probe وsleep يُحقنان في الاختبار.
export async function runSmoke({ functions = FUNCTIONS, rule, probe, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  const state = new Map(functions.map((f) => [f.name, { fn: f, results: [], notes: f.skip ? [f.skip] : [], verdict: f.skip ? 'skipped' : 'pending' }]));
  for (let round = 0; round < rule.attempts; round++) {
    if (round) await sleep(rule.intervalMs);
    const open = [...state.values()].filter((s) => s.verdict === 'pending');
    await Promise.all(open.map(async (s) => {
      const r = await probe(s.fn);
      s.results.push(r.ok);
      s.notes.push(r.note);
      s.verdict = verdict(s.results, rule);
      log(`${s.fn.name} #${s.results.length}: ${r.ok ? 'ok' : 'FAIL'} ${r.note}`);
    }));
    if (rule.decides && [...state.values()].some((s) => s.verdict === 'fail')) break;
    if (![...state.values()].some((s) => s.verdict === 'pending')) break;
  }
  const rows = [...state.values()].map((s) => ({
    name: s.fn.name, verdict: s.verdict === 'pending' ? (rule.decides ? 'stopped' : 'done') : s.verdict,
    ok: s.results.filter(Boolean).length, tries: s.results.length, last: s.notes.at(-1) || '',
  }));
  return { ok: !rows.some((r) => r.verdict === 'fail'), rows };
}

export function renderTable(mode, res) {
  const label = { pass: 'سليمة', fail: 'فشل مستمر', stopped: 'أُوقف الفحص', done: 'تم', skipped: 'لم تُفحص' };
  const L = [`### دخان الدوال (${mode})`, '', '| الدالة | الحكم | نجح | من | آخر رد |', '|---|---|---|---|---|'];
  for (const r of res.rows) L.push(`| ${r.name} | ${label[r.verdict] || r.verdict} | ${r.ok} | ${r.tries} | ${r.last.replace(/\|/g, '/')} |`);
  return L.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const mode = args.find((a) => !a.startsWith('--')) || 'deploy';
  const tree = args.find((a) => a.startsWith('--tree='))?.slice('--tree='.length);
  if (tree !== undefined && (!tree || !existsSync(join(tree, 'supabase/functions')))) { console.error(`--tree بلا supabase/functions: ${tree}`); process.exit(2); }
  const rule = MODES[mode];
  if (!rule) { console.error(`وضع غير معروف: ${mode}. المتاح: ${Object.keys(MODES).join('، ')}`); process.exit(2); }
  const anon = process.env.SUPABASE_ANON || '';
  const ref = process.env.PROJECT_REF || PROJECT_REF;
  const functions = tree ? probesFor(treeReader(tree)) : FUNCTIONS;
  for (const f of functions) if (f.skip || f.legacy) console.log(`${f.name}: ${f.skip || `شجرة أقدم: يُقبل رد ${f.legacy.status} من الدالة نفسها`}`);
  const res = await runSmoke({ functions, rule, probe: (fn) => probeOnce(fn, { anon, ref }), log: (l) => console.log(l) });
  const table = renderTable(mode, res);
  console.log(`\n${table}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
  for (const r of res.rows.filter((x) => x.verdict === 'fail')) console.log(`::error::${r.name}: فشل مستمر بعد ${r.tries} محاولات (${r.ok} نجاح). آخر رد: ${r.last}`);
  process.exit(rule.decides && !res.ok ? 1 : 0);
}
