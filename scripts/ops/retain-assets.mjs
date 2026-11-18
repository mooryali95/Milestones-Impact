// ════════════════════════════════════════════════════════════════
// الاحتفاظ بملفات الإصدارات السابقة 14 يومًا (تصور تحديث المنصة، المرحلة 5 البند 6، الخيار أ؛ ش2)
// ════════════════════════════════════════════════════════════════
// تبويب فُتح قبل النشر يطلب عند فتح قسم لأول مرة ملفًا باسم بنائه هو (assets/<قسم>-<hash>.js). البناء يمسح الناتج كل مرة
// (emptyOutDir)، فبلا هذا يجد 404 بعد كل نشر. الحل: مجلد مودع منفصل لكل تطبيق، releases/leaders/ وreleases/admin/:
//   assets/<الملف>     نسخة الملف كما قُدّم في الإنتاج
//   retained.json      القائمة الصريحة { "<الملف>": "YYYY-MM-DD" } بتاريخ دخوله المجلد
// يحدّثه هذا السكربت وحده (لا vite build)، من الإصدار المرقّى فعلًا (فرع release الذي تبني منه Cloudflare Pages)، وينسخ
// البناء محتواه إلى assets/ كما يُنسخ public/ (shared/build/release-files.mjs)، فيبقى الناتج دالة في المودع وحده.
// وما مضى على دخوله 14 يومًا يُحذف، إلا ما يقدّمه الإصدار المرقّى الآن.
//
//   node scripts/ops/retain-assets.mjs update [--ref=origin/release] [--today=YYYY-MM-DD]
//       بعد البناء وقبل الإيداع، في كل طلب يعيد بناء leaders/ أو admin/ (ومن يُدمج ثانيًا يعيده بعد دمج main).
//   node scripts/ops/retain-assets.mjs check [--ref=origin/release]
//       الفحص في CI: كل ملف يقدّمه الإصدار المرقّى موجود في الناتج الجديد (إلا ما انقضت مدته)، والمجلد يطابق قائمته.
//   node scripts/ops/retain-assets.mjs size     حجم المجلد لكل تطبيق
// بلا فرع release (أول نشر، أو تعذّر جلبه) يكتفي الفحص بتحذير، ويرفض التحديث.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtListFile } from '../../shared/build/release-files.mjs';

export const KEEP_DAYS = 14;
export const APPS = [{ app: 'leaders-app', out: 'leaders' }, { app: 'admin-app', out: 'admin' }];
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** عدد الأيام بين تاريخين بصيغة YYYY-MM-DD */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
export const expired = (since, today, days = KEEP_DAYS) => DAY.test(String(since)) && daysBetween(since, today) > days;
export const todayUtc = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * خطة التحديث، دالة خالصة.
 * live: ملفات assets/ في الإصدار المرقّى، وliveRetained: قائمته هو (ما نسخه بناؤه من مجلده). own: ما يبنيه المصدر الحالي
 * (الناتج بلا ما نُسخ من المجلد). retained: القائمة الحالية. fixed: ملفات public/assets/ (صفحة 404 والشعار بلا بصمة) لا تُحتفظ.
 * ما بناه مصدر الإصدار المرقّى نفسه يبقى ما دام مرقّى، وما سواه يبقى 14 يومًا من دخوله أول مجلد.
 * يعيد { retained: القائمة الجديدة مرتبة، add: ما يُنسخ من الإصدار المرقّى، drop: ما يُحذف من المجلد }
 */
export function planRetention({ live = [], liveRetained = {}, own = [], retained = {}, fixed = [], today, days = KEEP_DAYS }) {
  const ownSet = new Set(own);
  const fixedSet = new Set(fixed);
  const liveOwn = new Set(live.filter((n) => !(n in liveRetained)));
  const dated = (v) => (DAY.test(String(v)) ? v : null);
  const next = {};
  const add = [];
  const drop = [];
  const consider = (name, since, fromLive) => {
    if (ownSet.has(name) || fixedSet.has(name)) return false;
    if (!liveOwn.has(name) && expired(since, today, days)) return false;
    next[name] = since;
    if (fromLive && !(name in retained)) add.push(name);
    return true;
  };
  // ما يبنيه الإصدار المرقّى نفسه يبدأ عدّه من آخر تحديث رآه حيًا (اليوم)، لا من أول تحديث في الطلب: الطلب قد يبقى مفتوحًا
  // أيامًا والملف ما زال يُقدَّم، فيبقى بعد ترقية الطلب 14 يومًا كاملة. وما نُسخ من مجلد سابق يبقى بتاريخ دخوله الأول
  for (const name of live) consider(name, liveOwn.has(name) ? today : (dated(retained[name]) || dated(liveRetained[name]) || today), true);
  for (const [name, since] of Object.entries(retained)) {
    if (name in next) continue;
    if (!consider(name, dated(since) || today, false)) drop.push(name);
  }
  const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
  return { retained: sorted, add: add.sort(), drop: drop.sort() };
}

/**
 * الفحص، دالة خالصة: ما يقدّمه الإصدار المرقّى ويغيب عن الناتج الجديد، إلا ما كان في قائمته وانقضت مدته.
 * live: ملفات الإصدار المرقّى. liveRetained: قائمته هو. next: ملفات الناتج الجديد. يعيد أسماء الغائب
 */
export function missingFromNext({ live = [], liveRetained = {}, next = [], fixed = [], today, days = KEEP_DAYS }) {
  const have = new Set(next);
  const fixedSet = new Set(fixed);
  return live.filter((n) => !have.has(n) && !fixedSet.has(n) && !(n in liveRetained && expired(liveRetained[n], today, days))).sort();
}

/** المجلد يطابق قائمته: كل اسم في القائمة ملف، ولا ملف بلا اسم. يعيد قائمة المشكلات */
export function storeProblems(retained, files) {
  const listed = new Set(Object.keys(retained));
  const present = new Set(files);
  const out = [];
  for (const n of listed) if (!present.has(n)) out.push(`${n}: في retained.json وليس في المجلد`);
  for (const n of present) if (!listed.has(n)) out.push(`${n}: في المجلد وليس في retained.json`);
  for (const [n, d] of Object.entries(retained)) if (!DAY.test(String(d))) out.push(`${n}: تاريخ غير صالح ${d}`);
  return out.sort();
}

// ── القراءة من القرص ومن git ──
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, ...opts });
const listDir = (d) => (existsSync(d) ? readdirSync(d).filter((f) => statSync(join(d, f)).isFile()) : []);
const storeDir = (out) => join(ROOT, 'releases', out);
export function readList(file) {
  if (!existsSync(file)) return {};
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
}

function refExists(ref) {
  try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'pipe' }); return true; } catch { return false; }
}
// فرع release من الخادم إلى origin/release، بعمق 1. فشل الجلب لا يُفشل شيئًا: يُستعمل ما هو موجود
function fetchRelease(ref) {
  if (ref !== 'origin/release') return;
  try { git(['fetch', '--no-tags', '--depth=1', 'origin', '+refs/heads/release:refs/remotes/origin/release'], { stdio: 'pipe' }); } catch { /* بلا شبكة: المحلي */ }
}
function refFiles(ref, dir) {
  const raw = git(['ls-tree', '-r', '-z', '--name-only', ref, '--', `${dir}/`], { encoding: 'buffer' }).toString('utf8');
  return raw.split('\0').filter(Boolean).filter((p) => !p.slice(dir.length + 1).includes('/')).map((p) => p.slice(dir.length + 1));
}
function refJson(ref, path) {
  try { return JSON.parse(git(['show', `${ref}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')); } catch { return {}; }
}

function args(argv) {
  const o = { cmd: argv[0] || 'check', ref: 'origin/release', today: todayUtc() };
  for (const a of argv.slice(1)) {
    const m = a.match(/^--(ref|today)=(.+)$/);
    if (m) o[m[1]] = m[2];
  }
  return o;
}

function fixedOf(app) { return listDir(join(ROOT, app, 'public', 'assets')); }

/** ما بناه المصدر في آخر بناء، ويتحقق أن الناتج على القرص هو ذلك البناء. يرمي إن لم يُبنَ أو تغيّر الناتج بعده */
export function ownFromBuilt(list, present, retained = {}, fixed = []) {
  if (!list || !Array.isArray(list.own)) throw new Error('لا قائمة لآخر بناء: شغّل npm run leaders:build && npm run admin:build أولًا');
  const own = new Set(list.own);
  const have = new Set(present);
  const fixedSet = new Set(fixed);
  const gone = [...own].filter((n) => !have.has(n));
  const stray = present.filter((n) => !own.has(n) && !(n in retained) && !fixedSet.has(n));
  if (gone.length || stray.length) throw new Error(`الناتج لا يطابق آخر بناء (${[...gone, ...stray].slice(0, 3).join('، ')}): أعد البناء ثم أعد الأمر`);
  return [...own].sort();
}
function builtOwn(sd, outAssets, retained, fixed) {
  const f = builtListFile(sd);
  const list = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  return ownFromBuilt(list, listDir(outAssets), retained, fixed);
}

export function update({ ref, today }) {
  fetchRelease(ref);
  if (!refExists(ref)) throw new Error(`${ref} غير موجود: لا يُعرف الإصدار المرقّى، فلا تحديث للمجلد`);
  const report = [];
  for (const { app, out } of APPS) {
    const sd = storeDir(out);
    const listFile = join(sd, 'retained.json');
    const retained = readList(listFile);
    const outAssets = join(ROOT, out, 'assets');
    // ما يبنيه المصدر: قائمة البناء الأخير نفسه (retainedAssets)، لا «الناتج بلا القائمة»: ملف في القائمة قد يبنيه المصدر
    // أيضًا (تراجع يعيد بصمة قديمة)، فيُحذف من الناتج وقطعة الدخول تستورده
    const own = builtOwn(sd, outAssets, retained, fixedOf(app));
    const live = refFiles(ref, `${out}/assets`);
    const liveRetained = refJson(ref, `releases/${out}/retained.json`);
    const plan = planRetention({ live, liveRetained, own, retained, fixed: fixedOf(app), today });
    mkdirSync(join(sd, 'assets'), { recursive: true });
    for (const n of plan.add) {
      writeFileSync(join(sd, 'assets', n), git(['show', `${ref}:${out}/assets/${n}`]));
      copyFileSync(join(sd, 'assets', n), join(outAssets, n));
    }
    for (const n of plan.drop) {
      rmSync(join(sd, 'assets', n), { force: true });
      // ملف يبنيه المصدر يبقى في الناتج، وما سواه كان نسخة من المجلد فيُحذف معه
      if (!own.includes(n)) rmSync(join(outAssets, n), { force: true });
    }
    writeFileSync(listFile, `${JSON.stringify(plan.retained, null, 2)}\n`);
    report.push(`${out}: أُضيف ${plan.add.length}، وحُذف ${plan.drop.length}، والمحتفظ به ${Object.keys(plan.retained).length}`);
  }
  return report;
}

export function check({ ref, today }) {
  const problems = [];
  const notes = [];
  for (const { out } of APPS) {
    const sd = storeDir(out);
    const retained = readList(join(sd, 'retained.json'));
    for (const p of storeProblems(retained, listDir(join(sd, 'assets')))) problems.push(`releases/${out}: ${p}`);
    // كل ملف في القائمة منسوخ إلى الناتج (البناء ينسخه، فغيابه يعني ناتجًا لم يُعد بناؤه)
    const next = listDir(join(ROOT, out, 'assets'));
    for (const n of Object.keys(retained)) if (!next.includes(n)) problems.push(`${out}/assets/${n}: في القائمة وليس في الناتج (أعد البناء)`);
  }
  fetchRelease(ref);
  if (!refExists(ref)) {
    notes.push(`${ref} غير موجود: لا إصدار مرقّى يُقارن به (أول نشر، أو تعذّر الجلب)`);
    return { problems, notes };
  }
  for (const { app, out } of APPS) {
    const live = refFiles(ref, `${out}/assets`);
    const liveRetained = refJson(ref, `releases/${out}/retained.json`);
    const next = listDir(join(ROOT, out, 'assets'));
    const missing = missingFromNext({ live, liveRetained, next, fixed: fixedOf(app), today });
    for (const n of missing) problems.push(`${out}/assets/${n}: يقدّمه الإصدار المرقّى (${ref}) وغاب عن الناتج الجديد`);
  }
  return { problems, notes };
}

export function size() {
  return APPS.map(({ out }) => {
    const d = join(storeDir(out), 'assets');
    const files = listDir(d);
    const bytes = files.reduce((s, f) => s + statSync(join(d, f)).size, 0);
    return { out, files: files.length, bytes };
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const o = args(process.argv.slice(2));
  try {
    if (o.cmd === 'update') {
      for (const line of update(o)) console.log(line);
    } else if (o.cmd === 'size') {
      for (const s of size()) console.log(`releases/${s.out}/assets: ${s.files} ملفًا، ${(s.bytes / 1024 / 1024).toFixed(2)} ميجابايت`);
    } else {
      const { problems, notes } = check(o);
      for (const n of notes) console.log(`::warning::${n}`);
      if (problems.length) {
        for (const p of problems) console.log(`::error::${p}`);
        console.log('ملفات الإصدار السابق ستغيب عن تبويب مفتوح قبل النشر (ش2). شغّل: node scripts/ops/retain-assets.mjs update بعد البناء، ثم أودع releases/ وleaders/ وadmin/ (RUNBOOK §2).');
        process.exit(1);
      }
      console.log('ملفات الإصدار المرقّى كلها في الناتج الجديد، والمجلد يطابق قائمته.');
    }
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
