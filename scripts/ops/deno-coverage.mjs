// حد تغطية اختبارات Deno للدوال الطرفية (البند أ5 من تقرير الجاهزية): يقرأ lcov.info الذي يكتبه deno coverage --lcov،
// ويجمع الأسطر والفروع على كل ملفات الدوال (بلا ملفات الاختبار ولا محاكياتها)، وينشر الملخص في GITHUB_STEP_SUMMARY إن وُجد،
// ويفشل تحت الحد. الحد أدنى من القيمة يوم وُضع (أسطر 75.9%، فروع 71.9% من lcov في 2026-11-28) فلا يُفشل تذبذب صغير،
// ويُرفع بطلب دمج كلما ارتفعت التغطية، ولا يُخفض إلا بقرار معلل.
//   node scripts/ops/deno-coverage.mjs <lcov.info>
import { appendFileSync, readFileSync } from 'node:fs';

export const MIN = { lines: 75, branches: 71 };
// ملفات تُستبعد من الحساب: الاختبارات ومحاكيات القاعدة والشبكة
export const skip = (file) => /_test\.ts$|\/_fake_[^/]*\.ts$|\/_test_env\.ts$/.test(file);

export function summarize(lcov) {
  const files = [];
  let cur = null;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) cur = { file: line.slice(3), lf: 0, lh: 0, brf: 0, brh: 0 };
    else if (cur && /^(LF|LH|BRF|BRH):/.test(line)) { const [k, v] = line.split(':'); cur[k.toLowerCase()] = Number(v) || 0; }
    else if (line === 'end_of_record' && cur) { if (!skip(cur.file)) files.push(cur); cur = null; }
  }
  const sum = (k) => files.reduce((n, f) => n + f[k], 0);
  const pct = (h, t) => (t ? Math.round((h / t) * 1000) / 10 : 100);
  return { files: files.length, lines: pct(sum('lh'), sum('lf')), branches: pct(sum('brh'), sum('brf')), lf: sum('lf'), brf: sum('brf') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) { console.error('usage: node scripts/ops/deno-coverage.mjs <lcov.info>'); process.exit(2); }
  const s = summarize(readFileSync(path, 'utf8'));
  const ok = s.lines >= MIN.lines && s.branches >= MIN.branches;
  const md = [
    '### تغطية اختبارات Deno (supabase/functions)',
    '',
    '| المقياس | القيمة | الحد الأدنى |',
    '| --- | --- | --- |',
    `| الأسطر | ${s.lines}% (${s.lf}) | ${MIN.lines}% |`,
    `| الفروع | ${s.branches}% (${s.brf}) | ${MIN.branches}% |`,
    '',
    `${s.files} ملفًا. ${ok ? 'فوق الحد.' : 'تحت الحد: أضف اختبارات أو علّل خفض الحد في طلب الدمج.'}`,
    '',
  ].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  if (!ok) process.exit(1);
}
