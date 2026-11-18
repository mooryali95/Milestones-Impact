// ════════════════════════════════════════════════════════════════
// التحقق بعد الترقية (تصور تحديث المنصة، المرحلة 5 البند 8، ش8): الإنتاج يقدّم الإصدار الجديد، وملفاته كلها بنوعها
// ════════════════════════════════════════════════════════════════
// بعد دفع release تبني Cloudflare Pages الموقعين دون أن ينتظرها CI. هذا السكربت (خطوة في وظيفة deploy):
// 1) ينتظر حتى يقدّم كل موقع /version.json بالبصمة التي في الناتج المودع (leaders/version.json وadmin/version.json)، حتى 15 دقيقة.
// 2) ثم يطلب كل ملف JS وCSS في assets/ (الأقسام الكسولة كلها، وملفات الإصدارات السابقة المحتفظ بها في releases/، ش2)
//    ويتحقق أنه 200 بنوع JavaScript أو CSS، لا صفحة HTML.
// 3) وينظر في ملف غائب: 404 لا صفحة التطبيق (المرحلة 1 البند 2). تحذير لا فشل، حتى يُتحقق منه على رابط معاينة.
// جدار الحماية يحجب مشغّلات GitHub أحيانًا (403 مع server: cloudflare): يُفحص النشر نفسه على pages.dev كما في probe.yml.
// عند الفشل: الوظيفة تحمرّ برسالة تراجع الواجهة (RUNBOOK §2). الدوال نُشرت ودُخّنت قبلها، فالفشل هنا في الواجهة وحدها.
//
//   node scripts/ops/verify-live.mjs [--wait=900] [--site=leaders,admin] [--tree=<مجلد>]
//   --tree: شجرة الإيداع المرقّى إن لم تكن المجلد الحالي (سير التراجع الموحد). شجرة أقدم من هذه المرحلة بلا version.json
//   لا تُفحص (تحذير)، فالتراجع إليها لا يحمرّ وهو سليم.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const SITES = {
  leaders: { out: 'leaders', origin: 'https://leaders.sunkvalue.com', fallback: 'https://mi-leaders.pages.dev' },
  admin: { out: 'admin', origin: 'https://admin.sunkvalue.com', fallback: 'https://mi-admin.pages.dev' },
};
const UA = 'MilestoneImpactProbe/1.0 (+https://mi.sunkvalue.com)';
export const JS_CSS = /\.(?:m?js|css)$/;
const TYPE_OF = { js: /^(?:application|text)\/(?:x-)?javascript\b/i, css: /^text\/css\b/i };

/** نوع الرد يطابق امتداد الملف؟ */
export function typeOk(name, contentType) {
  const ext = /\.css$/.test(name) ? 'css' : 'js';
  return TYPE_OF[ext].test(String(contentType || '').trim());
}

/** رد حجبه جدار الحماية لعنوان المشغّل لا تعطل */
export const blocked = (r) => r && r.status === 403 && /cloudflare/i.test(r.headers?.get?.('server') || '');

/** يطلب من الأصل، فإن حُجب فمن pages.dev، ويتذكر الأصل الذي أجاب. يعيد { r, base } */
export async function fetchSite(site, path, { fetchImpl = fetch, state = {} } = {}) {
  const opts = { headers: { 'user-agent': UA }, redirect: 'follow', cache: 'no-store' };
  if (!state.useFallback) {
    const r = await fetchImpl(`${site.origin}${path}`, opts);
    if (!blocked(r)) return { r, base: site.origin };
    state.useFallback = true;
  }
  return { r: await fetchImpl(`${site.fallback}${path}`, opts), base: site.fallback };
}

/** ينتظر حتى يقدّم الموقع version.json بالبصمة المتوقعة. يعيد { ok, seen, base } */
export async function waitForBuild(site, expected, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), waitMs = 900_000, everyMs = 30_000, state = {} } = {}) {
  const t0 = now();
  let seen = null, base = site.origin;
  for (;;) {
    try {
      const res = await fetchSite(site, `/version.json?t=${now()}`, { fetchImpl, state });
      base = res.base;
      if (res.r.ok) { seen = (await res.r.json().catch(() => null))?.build || null; if (seen === expected) return { ok: true, seen, base }; }
      else seen = `HTTP ${res.r.status}`;
    } catch (e) { seen = String(e?.message || e); }
    if (now() - t0 + everyMs > waitMs) return { ok: false, seen, base };
    await sleep(everyMs);
  }
}

/** يطلب كل ملف بتوازٍ محدود ويعيد قائمة المشكلات */
export async function checkFiles(site, names, { fetchImpl = fetch, state = {}, parallel = 6 } = {}) {
  const problems = [];
  const queue = [...names];
  const worker = async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      try {
        const { r } = await fetchSite(site, `/assets/${n}`, { fetchImpl, state });
        const ct = r.headers?.get?.('content-type') || '';
        if (r.status !== 200) problems.push(`${n}: HTTP ${r.status}`);
        else if (!typeOk(n, ct)) problems.push(`${n}: نوعه ${ct || 'بلا نوع'} لا ${/\.css$/.test(n) ? 'CSS' : 'JavaScript'}`);
        await r.arrayBuffer?.().catch(() => {});
      } catch (e) { problems.push(`${n}: ${e?.message || e}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, names.length || 1) }, worker));
  return problems.sort();
}

/** ملف غائب: 404 لا صفحة التطبيق برمز 200. يعيد نص تحذير أو null */
export async function missingIs404(site, { fetchImpl = fetch, state = {}, rand = () => Math.random().toString(36).slice(2, 10) } = {}) {
  try {
    const { r } = await fetchSite(site, `/assets/does-not-exist-${rand()}.js`, { fetchImpl, state });
    if (r.status === 404) return null;
    return `الملف الغائب يُرد ${r.status} بنوع ${r.headers?.get?.('content-type') || 'بلا نوع'} لا 404 (المرحلة 1 البند 2)`;
  } catch (e) { return `تعذّر فحص الملف الغائب: ${e?.message || e}`; }
}

function expectedOf(tree, out) {
  const f = join(tree, out, 'version.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8')).build;
}
const assetsOf = (tree, out) => readdirSync(join(tree, out, 'assets')).filter((n) => JS_CSS.test(n)).sort();

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
  const waitMs = Number(opt('wait', '900')) * 1000;
  const sites = opt('site', 'leaders,admin').split(',').map((s) => s.trim()).filter(Boolean);
  const treeArg = opt('tree', null);
  const tree = treeArg || ROOT;
  let failed = false;
  for (const key of sites) {
    const site = SITES[key];
    if (!site) throw new Error(`موقع غير معروف: ${key}`);
    const state = {};
    const expected = expectedOf(tree, site.out);
    if (!expected) {
      if (treeArg) { console.log(`::warning::${key}: شجرة الهدف بلا ${site.out}/version.json (أقدم من المرحلة 5)، فلا تحقق من الإصدار المنشور`); continue; }
      throw new Error(`${site.out}/version.json غير موجود في الناتج المودع`);
    }
    console.log(`${key}: ينتظر version.json = ${expected}`);
    const w = await waitForBuild(site, expected, { waitMs, state });
    if (!w.ok) {
      console.log(`::error::${key}: لم يقدّم الإنتاج الإصدار الجديد خلال ${waitMs / 60000} دقيقة (آخر ما رُئي: ${w.seen}، من ${w.base}). هل فشل بناء Cloudflare Pages؟`);
      failed = true;
      continue;
    }
    if (state.useFallback) console.log(`::warning::${key}: ${site.origin} حُجب بـ403 من Cloudflare لعنوان المشغّل (ليس تعطلًا)؛ فُحص النشر على ${w.base}`);
    const names = assetsOf(tree, site.out);
    const problems = await checkFiles(site, names, { state });
    for (const p of problems) console.log(`::error::${key}: ${p}`);
    if (problems.length) failed = true;
    else console.log(`${key}: الإصدار ${expected} منشور، و${names.length} ملف JS وCSS (منها ملفات الإصدارات السابقة) تُخدم بنوعها من ${w.base}`);
    const warn = await missingIs404(site, { state });
    if (warn) console.log(`::warning::${key}: ${warn}`);
  }
  if (failed) {
    console.log('::error::الواجهة المنشورة لا تطابق الإصدار المرقّى. التراجع: سير «Deploy or roll back (manual)» إلى آخر SHA سليم، أو لوحة Cloudflare Pages ثم Deployments ثم Rollback للمشروعين (RUNBOOK §2).');
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
