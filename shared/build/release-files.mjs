// ════════════════════════════════════════════════════════════════
// ملفات الإصدار في البناء (تصور تحديث المنصة، المرحلة 5): version.json، وملفات الإصدارات السابقة المحتفظ بها
// ════════════════════════════════════════════════════════════════
// إضافتان صغيرتان لـVite يستعملهما تطبيق القادة ولوحة الإدارة (vite.config.js):
// - versionFile: يكتب /version.json ببصمة قطعة الدخول (اسم assets/index-<hash>.js)، وهي نفسها التي يقرؤها main.jsx من
//   وسم السكربت، فمصدر المعرّف واحد. لا SHA ولا وقت بناء: الناتج المودع يطابق إعادة بنائه من المصدر (ci.yml).
// - retainedAssets: ينسخ ملفات الإصدارات السابقة من مجلدها المودع (releases/<التطبيق>/assets/) إلى assets/ في الناتج، كما
//   يُنسخ public/. المجلد لا يكتبه البناء: يحدّثه scripts/ops/retain-assets.mjs وحده (الخيار أ في البند 6)، بقائمته الصريحة
//   retained.json، فالناتج يبقى دالة في المودع وحده لا في حالة فرع. ملف بالاسم نفسه في البناء الحالي لا يُستبدل.
//   ويكتب خارج الناتج (node_modules/.cache، غير مودع) قائمة ما بناه المصدر نفسه، فيعرف retain-assets.mjs update ما يبنيه
//   المصدر ولو كان اسمه في retained.json أيضًا (تراجع يعيد بصمة قديمة)، فلا يحذفه من الناتج.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const ENTRY_FILE = /^assets\/index-([\w-]+)\.js$/;

/** بصمة البناء من حزمة Rollup: قطعة الدخول assets/index-<hash>.js */
export function buildIdOf(bundle) {
  for (const f of Object.values(bundle || {})) {
    if (f && f.type === 'chunk' && f.isEntry) {
      const m = String(f.fileName).match(ENTRY_FILE);
      if (m) return m[1].slice(0, 40);
    }
  }
  return null;
}

export function versionFile() {
  return {
    name: 'mi-version-file',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const build = buildIdOf(bundle);
      if (!build) this.error('version.json: لم توجد قطعة الدخول assets/index-<hash>.js');
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ build })}\n` });
    },
  };
}

/** قائمة الملفات المحتفظ بها في المجلد المودع: { "<اسم الملف>": "YYYY-MM-DD" } */
export function readRetained(storeDir) {
  const f = join(storeDir, 'retained.json');
  if (!existsSync(f)) return {};
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
}

/** ملف قائمة ما بناه المصدر لمجلد releases/<التطبيق>: <الجذر>/node_modules/.cache/mi-release-files/<التطبيق>.json */
export function builtListFile(storeDir) {
  return join(dirname(dirname(storeDir)), 'node_modules', '.cache', 'mi-release-files', `${basename(storeDir)}.json`);
}

/** أسماء ملفات assets/ التي بناها المصدر نفسه (لا المنسوخة من المجلد)، من حزمة Rollup */
export function ownAssetsOf(bundle) {
  return Object.keys(bundle || {}).filter((k) => k.startsWith('assets/') && !k.slice(7).includes('/')).map((k) => k.slice(7)).sort();
}

// ════════════════════════════════════════════════════════════════
// assetWorker: عامل Pages لـ/assets/* (shared/build/asset-worker.js) يُكتب إلى _worker.js في الناتج كما هو، ومعه
// _routes.json يحصره في /assets/* وحده، فكل ما سواه يُخدم كما كان بـ_headers و_redirects. سبب العامل وسبب اختياره بدل
// مجلد functions/ في رأس asset-worker.js. مصدر واحد للتطبيقين، والناتج المودع يطابق مصدره كبقية الملفات.
// ════════════════════════════════════════════════════════════════
export const ASSET_ROUTES = { version: 1, include: ['/assets/*'], exclude: [] };
export function assetWorker() {
  return {
    name: 'mi-asset-worker',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(new URL('./asset-worker.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: '_worker.js', source });
      this.emitFile({ type: 'asset', fileName: '_routes.json', source: `${JSON.stringify(ASSET_ROUTES)}\n` });
    },
  };
}

export function retainedAssets(storeDir) {
  return {
    name: 'mi-retained-assets',
    apply: 'build',
    writeBundle(opts, bundle) {
      const out = opts.dir;
      const current = new Set(Object.keys(bundle || {}));
      const listFile = builtListFile(storeDir);
      mkdirSync(dirname(listFile), { recursive: true });
      writeFileSync(listFile, `${JSON.stringify({ own: ownAssetsOf(bundle) })}\n`);
      const list = readRetained(storeDir);
      mkdirSync(join(out, 'assets'), { recursive: true });
      for (const name of Object.keys(list).sort()) {
        const rel = `assets/${name}`;
        if (current.has(rel)) continue;
        const src = join(storeDir, 'assets', name);
        if (!existsSync(src)) this.error(`releases: ${name} في retained.json وليس في المجلد`);
        copyFileSync(src, join(out, rel));
      }
    },
  };
}
