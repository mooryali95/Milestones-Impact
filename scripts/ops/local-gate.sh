#!/usr/bin/env bash
# بوابة محلية: تعيد خطوات وظيفة build-and-test في .github/workflows/ci.yml بالترتيب نفسه.
# تُستعمل حين يتعذر GitHub Actions، وقبل طلب الدمج دائمًا. أي خطوة تُضاف إلى ci.yml تُضاف هنا.
# الاستعمال: npm run gate            كل الخطوات
#            npm run gate -- --fast  بلا اختبارات المتصفح
# لا تشغّل golden-paths (integration.yml): تلك تحتاج Supabase محليًا، انظر scripts/integration.
set -u
cd "$(dirname "$0")/../.."
FAST=0; [ "${1:-}" = "--fast" ] && FAST=1
OUT="$(mktemp)"; FAILED=0
step() { local n="$1"; shift; if "$@" > "$OUT" 2>&1; then echo "PASS $n"; else echo "FAIL $n"; tail -20 "$OUT"; FAILED=1; fi; }

step "ملفات مولدة: الأنماط" bash -c 'python3 shared/build-css.py > /dev/null && git diff --exit-code -- home public src/styles src/assets'
step "ملفات مولدة: قائمة الترحيلات" node scripts/db/migrations-list.mjs --check
step "ملفات مولدة: لقطة البنية" node scripts/db/snapshot.mjs --from-migrations --check
step "بنك القياس" bash -c 'node scripts/questions/build-v5.mjs > /dev/null && node scripts/questions/build-v5_1.mjs > /dev/null && node scripts/questions/build-v5_2.mjs > /dev/null && git diff --exit-code --stat -- supabase/content/questions/v5 supabase/content/questions/v5.1 supabase/content/questions/v5.2 supabase/migrations/20261102100000_leaders_instruments_v5.sql supabase/migrations/20261102100100_leaders_activate_v5.sql supabase/migrations/20261105150000_leaders_v5_1_pre_activation.sql supabase/migrations/20261107190000_leaders_v5_2_balance.sql && node scripts/questions/verify-v5.mjs > /dev/null && node scripts/questions/verify-v5_1.mjs > /dev/null'
step "بنك كاتون" bash -c 't=$(mktemp) && node scripts/katon/build-cbm-migration.mjs > "$t" && diff -q "$t" supabase/migrations/20261105160000_leaders_katon_cbm.sql && node scripts/katon/verify.mjs'
step "الكتيب وسجل المفاهيم" bash -c 'node scripts/handbook/build-migration.mjs > /dev/null && git diff --exit-code --stat -- supabase/migrations/20261102110000_leaders_handbook_v3.sql && node scripts/handbook/verify.mjs > /dev/null && node scripts/handbook/build-version.mjs --check && node scripts/concepts/registry.mjs --check'
step "لا أسرار في الملفات" node scripts/ops/secrets-scan.mjs
step "تدقيق الاعتماديات" npm audit --omit=dev --audit-level=high
step "الفحص النحوي" npm run lint
step "فحص أنواع الدوال" bash -c 'deno check --node-modules-dir=none supabase/functions/*/index.ts'
step "اختبارات Deno" deno test --node-modules-dir=none --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/leaders-api/
step "اختبارات الوحدة" npm test
step "بناء الموقع" npm run build
step "بناء القادة مودع" bash -c 'npm run leaders:build && git add -N leaders && git diff --exit-code --stat -- leaders'
step "بناء الإدارة مودع" bash -c 'npm run admin:build && git add -N admin && git diff --exit-code --stat -- admin'
[ "$FAST" = 1 ] || step "اختبارات المتصفح" npx playwright test --trace off --reporter=dot
rm -f "$OUT"
echo "الإيداع $(git rev-parse --short HEAD) · $([ "$FAILED" = 0 ] && echo 'البوابة ناجحة' || echo 'البوابة فاشلة')"
exit "$FAILED"
