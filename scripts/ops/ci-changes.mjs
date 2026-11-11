// ما الذي يلزم فحصه في CI لقائمة ملفات متغيرة. المصدر الواحد لقرار «ما يمسه التعديل» في ci.yml وintegration.yml،
// ويحرسه ci-selective.test.js. القاعدة: الشك يشغّل الفحص، فكل ملف لا يُعرف مجاله يشغّل كل شيء.
//
//   git diff --name-only A B | node scripts/ops/ci-changes.mjs            يطبع key=value (لـ $GITHUB_OUTPUT)
//   node scripts/ops/ci-changes.mjs --all                                 كل شيء (دفع بلا أساس معروف، أو تشغيل يدوي)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupOf, serversOf } from './e2e-groups.mjs';

// يغيّر طريقة الفحص نفسها أو الاعتماديات: كل شيء
const EVERYTHING = [
  /^\.github\/(workflows|actions)\//, /^package(-lock)?\.json$/, /^\.nvmrc$/, /^\.eslintrc\.ci\.json$/,
  /^playwright\.config\.js$/, /^vitest\.config\./, /^scripts\/ops\/(ci-changes|e2e-groups)\.mjs$/,
];

// لا يقرؤها كود ولا اختبار (مسودات ومراجعات): لا فحص. ويهملها مشغّل السير نفسه (paths-ignore).
const INERT = [/^docs\/(audit|assessment|prototypes|workshop)\//];

// وثائق تقرؤها اختبارات الحراسة (RUNBOOK وdocs/ops وdocs/journey...): الفحوص الخفيفة وحدها
const DOCS = [/^docs\//, /\.md$/];

// مجال كل تطبيق: ما يدخل بناءه فعلًا (vite) أو يقدّمه خادم رحلاته
const SHARED = [/^shared\//, /^src\/lib\//, /^supabase\/functions\/(leaders-api|_shared)\//];
const AREAS = {
  home: [/^home\//, /^shared\//],
  matrix: [/^src\//, /^public\//, /^index\.html$/, /^vite\.config\.js$/, ...SHARED],
  leaders: [/^leaders-app\//, /^leaders\//, ...SHARED],
  admin: [/^admin-app\//, /^admin\//, ...SHARED],
  functions: [/^supabase\/functions\//, /^deno\.json$/],
  // الخادم على قاعدة حقيقية (integration.yml): الدوال والترحيلات والمحتوى المرحَّل وسكربتات التكامل
  backend: [/^supabase\//, /^scripts\/(integration|db)\//],
};

// كل ما سوى ذلك (scripts/ وsupabase/ وworkers/ وSSPDF/ وserver/...) يمر بالفحوص الخفيفة: الوحدات تحرسه
const KNOWN = [...DOCS, ...Object.values(AREAS).flat(), /^scripts\//, /^supabase\//, /^workers\//, /^SSPDF\//, /^server\//,
  /^e2e\//, /^\.gitignore$/, /^\.claude\//, /^CLAUDE\.md$/, /^deno\.lock$/];

const any = (f, res) => res.some((re) => re.test(f));

export function decide(files, { all = false } = {}) {
  const out = { checks: false, functions: false, home: false, matrix: false, leaders: false, admin: false, backend: false };
  const real = files.filter((f) => f && !any(f, INERT));
  if (all || real.some((f) => any(f, EVERYTHING) || !any(f, KNOWN))) {
    for (const k of Object.keys(out)) out[k] = true;
  } else {
    for (const f of real) {
      out.checks = true;
      for (const [k, res] of Object.entries(AREAS)) if (any(f, res)) out[k] = true;
    }
  }
  // رحلات المتصفح بمجموعاتها (scripts/ops/e2e-groups.mjs): تطبيق متغير يشغّل مجموعاته، وملف رحلة متغير يشغّل مجموعته
  const groups = { site: out.home || out.matrix, leaders: out.leaders || out.home, admin: out.admin, cross: out.leaders || out.admin };
  for (const f of real.filter((x) => /^e2e\//.test(x))) {
    const g = /\.spec\.js$/.test(f) ? groupOfSpec(f) : null;
    if (g) groups[g] = true;
    else for (const k of Object.keys(groups)) groups[k] = true;   // مساعد مشترك (readable.js) أو ملف لم يُقرأ: كلها
  }
  return { ...out, e2e_site: groups.site, e2e_leaders: groups.leaders, e2e_admin: groups.admin, e2e_cross: groups.cross };
}

function groupOfSpec(file) {
  try { return groupOf(serversOf(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../..', file), 'utf8'))); } catch { return null; }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const all = process.argv.includes('--all');
  const files = all ? [] : (await new Promise((res) => {
    let s = ''; process.stdin.on('data', (d) => { s += d; }); process.stdin.on('end', () => res(s));
  })).split('\n').map((l) => l.trim()).filter(Boolean);
  const d = decide(files, { all });
  console.error(all ? 'كل الفحوص (بلا أساس للمقارنة)' : `${files.length} ملفًا متغيرًا`);
  for (const [k, v] of Object.entries(d)) console.log(`${k}=${v}`);
  // للـmatrix في ci.yml: مجموعات الرحلات المطلوبة بترتيب ثابت، و[] حين لا رحلة
  console.log(`e2e_groups=${JSON.stringify(['site', 'leaders', 'admin', 'cross'].filter((g) => d[`e2e_${g}`]))}`);
}
