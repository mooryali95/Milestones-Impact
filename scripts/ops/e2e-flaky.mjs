// التنبيه على رحلات المتصفح التي نجحت بعد إعادة المحاولة (flaky) من تقارير Playwright JSON.
// كل مجموعة تكتب e2e-reports/<group>.json (scripts/ops/e2e-groups.mjs بالمتغير PLAYWRIGHT_JSON_OUTPUT_NAME).
//
//   node scripts/ops/e2e-flaky.mjs [--max=N] [dir]
// يكتب القائمة في GITHUB_STEP_SUMMARY إن وُجد، و::warning لكل اختبار. بلا --max لا يفشل أبدًا (طلبات الدمج)؛
// بـ --max=N يفشل إن تجاوز عددها N (السير الأسبوعي في stage-gates.yml).
import { existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// يجمع الاختبارات بحالة flaky (Playwright: نجح بعد فشل) من تقرير JSON واحد
export function flakyOf(report) {
  const out = [];
  const walk = (suite, file) => {
    const f = suite.file || file;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        if (t.status === 'flaky') out.push({ file: f, title: spec.title, line: spec.line, retries: (t.results || []).length - 1 });
      }
    }
    for (const s of suite.suites || []) walk(s, f);
  };
  for (const s of report.suites || []) walk(s, s.file);
  return out;
}

export function summarize(list) {
  if (!list.length) return '### رحلات المتصفح المتذبذبة\n\nلا اختبار نجح بعد إعادة المحاولة.\n';
  return `### رحلات المتصفح المتذبذبة (${list.length})\n\nنجحت بعد إعادة المحاولة، فتُصلَح قبل أن تخفي عطلًا حقيقيًا:\n\n`
    + list.map((t) => `- \`${t.file}:${t.line}\` ${t.title} (إعادات: ${t.retries})`).join('\n') + '\n';
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const maxArg = args.find((a) => a.startsWith('--max='));
  const max = maxArg ? Number(maxArg.slice(6)) : null;
  const dir = args.find((a) => !a.startsWith('--')) || 'e2e-reports';
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const list = files.flatMap((f) => flakyOf(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  for (const t of list) console.log(`::warning file=${t.file},line=${t.line}::رحلة متذبذبة نجحت بعد إعادة المحاولة: ${t.title}`);
  const md = summarize(list);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (max !== null && list.length > max) {
    console.log(`::error::${list.length} رحلة متذبذبة تتجاوز الحد ${max}`);
    process.exit(1);
  }
}
