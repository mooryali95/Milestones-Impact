#!/usr/bin/env bash
# يطبّق ترحيلات supabase/migrations بالترتيب على قاعدة Supabase المحلية (سير التكامل)،
# متخطيًا ترحيلات القرار (scripts/db/data-only.mjs) كما يفعل بناء اللقطة.
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
skip=" $(node -e "import('./scripts/db/data-only.mjs').then((m) => console.log([...m.DATA_ONLY].join(' ')))") "
n=0
for f in $(ls supabase/migrations/*.sql | sort); do
  name=$(basename "$f" .sql)
  case "$skip" in *" $name "*) echo "skip  $name"; continue;; esac
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null
  n=$((n + 1))
done
echo "applied $n migrations"
