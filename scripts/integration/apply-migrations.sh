#!/usr/bin/env bash
# يطبّق ترحيلات supabase/migrations بالترتيب على قاعدة Supabase المحلية (سير التكامل)،
# متخطيًا ترحيلات القرار (scripts/db/data-only.mjs) كما يفعل بناء اللقطة.
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash scripts/integration/apply-migrations.sh
set -euo pipefail
: "${DB_URL:?DB_URL مطلوب}"
skip=" $(node -e "import('./scripts/db/data-only.mjs').then((m) => console.log([...m.DATA_ONLY].join(' ')))") "
n=0
for f in $(ls supabase/migrations/*.sql | sort); do
  name=$(basename "$f" .sql)
  case "$skip" in *" $name "*) echo "skip  $name"; continue;; esac
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" > /dev/null
  n=$((n + 1))
done
echo "applied $n migrations"
