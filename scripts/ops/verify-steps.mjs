// خطوات التحقق المحلي الكامل، بالترتيب نفسه الذي يجريه build-and-test في ci.yml.
// المصدر الواحد لأمر npm run verify (scripts/ops/verify.mjs)، ويحرس verify-parity.test.js
// أن كل أمر في build-and-test موجود هنا بنصه، فلا يمر طلب دمج بفحص ناقص ما دامت Actions موقوفة (D16).
//
// الحقل ci: الأمر موجود في ci.yml بنصه. الخطوات بلا ci إضافات D16 لا يجريها build-and-test بعد
// (الأسرار في الملفات، وثغرات حزم الإنتاج)، أو خطوات تحتاج سرًا لا يوجد محليًا.
export const STEPS = [
  { id: 'generated', title: 'الملفات المولّدة تطابق مصادرها', ci: true, cmds: [
    'python3 shared/build-css.py > /dev/null',
    'git diff --exit-code -- home public src/styles src/assets',
    'node scripts/db/migrations-list.mjs --check',
    'node scripts/db/snapshot.mjs --from-migrations --check',
    'node scripts/questions/build-v5.mjs > /dev/null && node scripts/questions/build-v5_1.mjs > /dev/null && node scripts/questions/build-v5_2.mjs > /dev/null',
    'git diff --exit-code --stat -- supabase/content/questions/v5 supabase/content/questions/v5.1 supabase/content/questions/v5.2 supabase/migrations/20261102100000_leaders_instruments_v5.sql supabase/migrations/20261102100100_leaders_activate_v5.sql supabase/migrations/20261105150000_leaders_v5_1_pre_activation.sql supabase/migrations/20261107190000_leaders_v5_2_balance.sql',
    'node scripts/questions/verify-v5.mjs > /dev/null && node scripts/questions/verify-v5_1.mjs > /dev/null',
    'node scripts/katon/build-cbm-migration.mjs > /tmp/katon_cbm.sql && diff -q /tmp/katon_cbm.sql supabase/migrations/20261105160000_leaders_katon_cbm.sql',
    'node scripts/katon/verify.mjs > /dev/null 2>&1',
    'node scripts/handbook/build-migration.mjs > /dev/null && git diff --exit-code --stat -- supabase/migrations/20261102110000_leaders_handbook_v3.sql',
    'node scripts/handbook/verify.mjs > /dev/null',
    'node scripts/handbook/build-version.mjs --check',
    'node scripts/concepts/registry.mjs --check',
  ] },
  { id: 'secrets', title: 'لا أسرار في الملفات المودعة', ci: true, cmds: ['node scripts/ops/secrets-scan.mjs'] },
  { id: 'audit', title: 'لا ثغرة عالية في حزم الإنتاج', ci: true, cmds: ['npm audit --omit=dev --audit-level=high'] },
  { id: 'lint', title: 'Lint', ci: true, cmds: ['npm run lint'] },
  { id: 'deno-check', title: 'أنواع الدوال كلها', ci: true, cmds: ['deno check --node-modules-dir=none supabase/functions/*/index.ts'] },
  { id: 'deno-test', title: 'اختبارات Deno', ci: true, cmds: ['deno test --node-modules-dir=none --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/leaders-api/'] },
  { id: 'vitest', title: 'اختبارات الوحدات', ci: true, cmds: ['npm test'] },
  { id: 'build', title: 'البناء، والمبني المودع يطابق مصدره', ci: true, cmds: [
    'npm run build',
    'npm run leaders:build',
    'git add -N leaders && git diff --exit-code --stat -- leaders',
    'npm run admin:build',
    'git add -N admin && git diff --exit-code --stat -- admin',
  ] },
  { id: 'e2e', title: 'رحلات المتصفح', ci: true, cmds: ['npm run e2e'] },
  // يحتاج SUPABASE_ACCESS_TOKEN، فيُجرى في وظيفة deploy قبل النشر. محليًا يُذكر مُتخطّى بسببه.
  { id: 'function-secrets', title: 'أسرار الدخول مضبوطة على المشروع (أسماء فقط)', needsToken: true, cmds: ['node scripts/ops/function-secrets.mjs --require=signin'] },
];

// أوامر build-and-test التي لا تفحص شيئًا: تثبيت الحزم والمتصفح
export const CI_SETUP = [/^npm ci\b/, /^npx playwright install\b/];
