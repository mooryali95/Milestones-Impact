#!/usr/bin/env node
// هل التراجع الآلي بالدوال إلى origin/release آمن في هذا النشر؟ (تصور تحديث المنصة، المرحلة 2 البند 3، وق5)
// التراجع آمن ما دامت القاعدة متوافقة مع الكود القديم. ترحيل حاجب جديد بين release والإيداع المنشور يعني أن
// المالك طبّقه للتو (وإلا أوقفت بوابة الترحيلات النشر)، وقد لا يعمل الكود القديم على البنية الجديدة، فلا يُتراجع
// آليًا ويُنبَّه المالك بدلًا منه، إلى أن تفرض المرحلة 6 قاعدة التوسيع ثم الانكماش. المتسامح (tolerant) يعمل قبله
// وبعده، والمؤجل (deferred) لا تعتمد عليه الدوال، فلا يمنعان التراجع.
//
//   node scripts/ops/rollback-guard.mjs <release-sha>     يكتب auto=true|false في $GITHUB_OUTPUT ويطبع السبب
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateOf } from './pending-migrations.mjs';

// added: [{ name, sql }] ترحيلات أضيفت منذ release. الوسم من سطور الملف وحدها (بلا بيان المطبّق: المطلوب
// هل يتحمله الكود القديم، لا هل وسمه منتهٍ)
export function rollbackSafety(added) {
  const blocking = added.filter((m) => gateOf(m.sql).gate === 'blocking').map((m) => m.name);
  if (blocking.length) return { auto: false, blocking, reason: `النشر تلا ترحيلًا حاجبًا (${blocking.join('، ')}): الكود القديم قد لا يعمل على البنية الجديدة، فلا تراجع آلي` };
  return { auto: true, blocking: [], reason: added.length ? `ترحيلات جديدة متسامحة أو مؤجلة وحدها (${added.length}): التراجع آمن` : 'لا ترحيل جديد منذ release: التراجع آمن' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const release = process.argv[2];
  const out = (s) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, s);
  let res;
  if (!release) {
    res = { auto: false, reason: 'لا مرجع لـ release: لا شيء يُتراجع إليه آليًا' };
  } else {
    const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', release, 'HEAD', '--', 'supabase/migrations/'], { encoding: 'utf8' })
      .split('\n').filter((f) => f.endsWith('.sql'));
    res = rollbackSafety(files.map((f) => ({ name: basename(f, '.sql'), sql: readFileSync(f, 'utf8') })));
  }
  console.log(`${res.auto ? '::notice::' : '::warning::'}${res.reason}`);
  out(`auto=${res.auto}\n`);
}
