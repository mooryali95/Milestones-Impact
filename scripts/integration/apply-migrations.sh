#!/usr/bin/env bash
# يطبّق ترحيلات supabase/migrations بالترتيب على قاعدة Supabase المحلية (سير التكامل)،
# متخطيًا ترحيلات القرار (scripts/db/data-only.mjs) كما يفعل بناء اللقطة، ثم يطبّقها بعد الحلقة بترتيبها هناك.
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash scripts/integration/apply-migrations.sh
set -euo pipefail
: "${DB_URL:?DB_URL مطلوب}"
# الامتدادات التي يوفرها الإنتاج قبل أي ترحيل (الترحيلات لا تنشئها): الجدولة والطلبات والخزنة
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "create extension if not exists pg_cron; create extension if not exists pg_net; create extension if not exists supabase_vault;
-- ما يسبق الترحيلات في الإنتاج: مخطط SSPDF (منصة مستقلة في المشروع نفسه، دالة definer تشير إليه)،
-- وحساب المالك في Auth الذي يشترطه ترحيل 20261022110000 (المعرّف هنا عشوائي ولا كلمة مرور)
create schema if not exists sspdf;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'milestonesimpact@gmail.com', now(), now()
where not exists (select 1 from auth.users where email = 'milestonesimpact@gmail.com');" > /dev/null
# اللقطة المودعة أولًا (البنية كاملة كما في الإنتاج)، ثم الترحيلات بالترتيب: DDL مشروط يمر بلا أثر،
# وإدراج البيانات (الأدوات والأسئلة والبرامج والمحتوى) يُطبَّق. الترحيلات الأولى تفترض جداول من عهد server/*.sql
# لا توجد في قاعدة فارغة، واللقطة توفرها.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/schema/baseline.sql > /dev/null
# الصفوف المرجعية التي سبقت مجلد الترحيلات في الإنتاج (الأدوار، المراحل، نموذج التسكين، الخلايا، المتطلبات الأولى)
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f scripts/integration/seed-reference.sql > /dev/null
echo "baseline + reference seed applied"
order=$(node -e "import('./scripts/db/data-only.mjs').then((m) => console.log(m.DATA_ONLY_ORDER.join(' ')))")
skip=" $order "
n=0
for f in $(ls supabase/migrations/*.sql | sort); do
  name=$(basename "$f" .sql)
  case "$skip" in *" $name "*) echo "skip  $name"; continue;; esac
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null
  n=$((n + 1))
done
# ترحيلات القرار بعد الحلقة بترتيبها في data-only.mjs، كما طُبّقت على الإنتاج: حراس التفعيل تمر بعد أن سجّل
# 20261105150000 و20261107190000 نفسيهما، فتجري المسارات الذهبية على baseline-v5 كالإنتاج. التفعيل أقدم من
# السجل فلا يسجّل نفسه، فيُسجَّل هنا كما أُضيف سطره يدويًا على الإنتاج (HANDOFF.md)
for name in $order; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "supabase/migrations/$name.sql" > /dev/null
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "insert into leaders.schema_migrations (name) values ('$name') on conflict do nothing;" > /dev/null
  echo "apply $name (data only, after the loop)"
  n=$((n + 1))
done
# PostgREST بدأ على مخطط leaders فارغًا (supabase/seeds/leaders-schema.sql)؛ يعيد قراءة البنية بعد امتلائها
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "notify pgrst, 'reload schema';"
echo "applied $n migrations"
