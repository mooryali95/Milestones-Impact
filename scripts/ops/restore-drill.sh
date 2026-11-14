#!/usr/bin/env bash
# تمرين الاستعادة (D09): يجريه المالك شهريًا من جهازه، لأن المفتاح الخاص لا يكون في GitHub ولا Cloudflare.
#   scripts/ops/restore-drill.sh                 آخر نسخة من R2 (latest.json)
#   scripts/ops/restore-drill.sh <مجلد>          آخر بيان في مجلد محلي (BACKUP_OUT من backup.sh)
# يفشل عند: نسخة أقدم من DRILL_MAX_AGE_HOURS (36)، أو بصمة لا تطابق البيان، أو تعذّر فك التشفير، أو خطأ استعادة
# غير متوقع، أو عدد صفوف لا يطابق لحظة النسخ (ومنها auth.users)، أو ملف من عينة الدلو الخاص مفقود أو بحجم آخر.
# القاعدة المؤقتة: DRILL_DB_URL إن ضُبط، وإلا حاوية postgres:17 تُحذف بعد التمرين. المفتاح الخاص في حلقة gpg المحلية،
# أو DRILL_PASSPHRASE للنسخ المتماثلة القديمة (قبل ضبط المفتاح العام).
# يطبع RPO (عمر النسخة) وزمن الاستعادة (مقياس RTO)، ويُسجَّل الناتج في HANDOFF.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAX_AGE="${DRILL_MAX_AGE_HOURS:-36}"
WORK="$(mktemp -d)"
CONTAINER=""
cleanup() { [ -z "$CONTAINER" ] || docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
T0=$(date +%s)
fail() { echo "✗ $*" >&2; exit 1; }
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
# أدوات Postgres من إصدار الخادم (DRILL_PG_MAJOR، افتراضيًا 17) محليًا، وإلا من docker على شبكة الجهاز
pgtool() {
  local tool="$1"; shift
  if command -v "$tool" >/dev/null && [ "$("$tool" --version | grep -oE '[0-9]+' | head -1)" -ge "${DRILL_PG_MAJOR:-17}" ]; then "$tool" "$@"
  else docker run --rm -i --network host -v "$WORK:$WORK" postgres:17 "$tool" "$@"; fi
}
j() { node -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); const v=($2); console.log(typeof v==='object'?JSON.stringify(v):v)" "$1"; }

# ── البيان والملفات ──
SRC="${1:-}"
if [ -n "$SRC" ]; then
  manifest="$(ls -t "$SRC"/manifest-*.json | head -1)"
  [ -f "$manifest" ] || fail "لا بيان في $SRC"
  cp "$manifest" "$WORK/manifest.json"
  fetch() { cp "$SRC/$(basename "$1")" "$WORK/$(basename "$1")"; }
else
  node "$ROOT/scripts/ops/r2.mjs" get latest.json "$WORK/manifest.json" >/dev/null
  fetch() { node "$ROOT/scripts/ops/r2.mjs" get "$1" "$WORK/$(basename "$1")" >/dev/null; }
fi
M="$WORK/manifest.json"
age_h=$(j "$M" "Math.floor((Date.now() - Date.parse(m.at)) / 36e5)")
[ "$age_h" -le "$MAX_AGE" ] || fail "آخر نسخة عمرها ${age_h} ساعة، فوق ${MAX_AGE}"
[ "$(j "$M" "Object.keys(m.rows || {}).length")" -gt 0 ] || fail "البيان بلا عدد صفوف، فلا يُتحقق من الاستعادة"
echo "• النسخة $(j "$M" "m.at") (عمرها ${age_h} ساعة، تشفير $(j "$M" "m.encryption"))"

for key in $(j "$M" "m.files.map((f) => f.key).join(' ')"); do
  fetch "$key"
  f="$WORK/$(basename "$key")"
  want=$(j "$M" "m.files.find((f) => f.key === '$key').sha256")
  [ "$(sha "$f")" = "$want" ] || fail "بصمة $key لا تطابق البيان"
  if [ -n "${DRILL_PASSPHRASE:-}" ]; then dec=(--pinentry-mode loopback --passphrase "$DRILL_PASSPHRASE"); else dec=(); fi
  # ${dec[@]+...}: مصفوفة فارغة تحت set -u خطأ في bash 3.2 (bash الافتراضي على macOS)، وهي فارغة دائمًا بالمفتاح العام
  gpg --batch --yes --quiet ${dec[@]+"${dec[@]}"} -d -o "${f%.gpg}" "$f" 2>"$WORK/gpg.err" || fail "تعذّر فك تشفير $key: $(cat "$WORK/gpg.err")"
done
echo "✓ البصمات تطابق البيان، وفُك التشفير بالمفتاح الخاص"

# ── القاعدة المؤقتة ──
if [ -z "${DRILL_DB_URL:-}" ]; then
  CONTAINER="mi-drill-$$"
  docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=drill -p 54329:5432 postgres:17 >/dev/null
  DRILL_DB_URL="postgresql://postgres:drill@localhost:54329/postgres"
  for _ in $(seq 1 60); do docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
fi
PSQL=(pgtool psql "$DRILL_DB_URL" -v ON_ERROR_STOP=1 -q -At)
# ما توفره Supabase قبل أي ترحيل: الأدوار التي تشير إليها السياسات والملكيات، ومخطط الامتدادات
"${PSQL[@]}" <<'SQL'
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists "uuid-ossp" schema extensions;
SQL

dump="$(ls "$WORK"/db-*.dump | head -1)"
pgtool pg_restore -d "$DRILL_DB_URL" --no-owner --no-privileges "$dump" 2>"$WORK/restore.err" || true
# أخطاء متوقعة من كائنات Supabase الخاصة (امتدادات ومخططات خارج النسخة)؛ أي خطأ غيرها يُفشل التمرين
ALLOW='(extension|schema|role|type) "[^"]+" does not exist|must be owner of (extension|schema)|permission denied to create extension|already exists|extension "[^"]+" is not available'
unexpected="$(grep -E '^pg_restore: error:' "$WORK/restore.err" | grep -v -E "$ALLOW" || true)"
[ -z "$unexpected" ] || fail "أخطاء استعادة غير متوقعة:
$unexpected"
echo "✓ الاستعادة بلا خطأ غير متوقع ($(grep -c '^pg_restore: error:' "$WORK/restore.err" || true) خطأ متوقع من كائنات Supabase الخاصة)"

# ── الصفوف ──
for t in $(j "$M" "Object.keys(m.rows).join(' ')"); do
  want=$(j "$M" "m.rows['$t']")
  got=$("${PSQL[@]}" -c "select count(*) from $t")
  [ "$got" = "$want" ] || fail "$t: ${got} صفًا بعد الاستعادة، و${want} لحظة النسخ"
  echo "✓ $t = $got"
done

# ── عينة من الدلو الخاص ──
tarball="$(ls "$WORK"/storage-*.tar.gz 2>/dev/null | head -1 || true)"
if [ -n "$tarball" ]; then
  tar xzf "$tarball" -C "$WORK"
  list="$WORK/storage/.files.tsv"
  [ -f "$list" ] || fail "أرشيف الدلو بلا قائمة ملفات"
  total=$(wc -l < "$list" | tr -d ' ')
  [ "$(find "$WORK/storage" -type f ! -name .files.tsv | wc -l | tr -d ' ')" = "$total" ] || fail "عدد ملفات الدلو لا يطابق قائمته"
  while IFS=$'\t' read -r size path; do
    [ -f "$WORK/storage/$path" ] || fail "ملف مفقود من الدلو: $path"
    [ "$(wc -c < "$WORK/storage/$path" | tr -d ' ')" = "$size" ] || fail "حجم مختلف: $path"
  done < <(node -e "const l=require('fs').readFileSync(process.argv[1],'utf8').split('\n').filter(Boolean); for (let i=l.length-1;i>0;i--){const k=Math.floor(Math.random()*(i+1));[l[i],l[k]]=[l[k],l[i]]} console.log(l.slice(0,5).join('\n'))" "$list")
  echo "✓ الدلو الخاص: ${total} ملفًا، وعينة من 5 تطابق أحجامها"
else
  echo "! لا أرشيف للدلو الخاص في هذه النسخة (SUPABASE_SERVICE_ROLE_KEY غير مضبوط عند النسخ)"
fi
echo "✓ تمرين ناجح: RPO ${age_h} ساعة، وزمن الاستعادة $(( $(date +%s) - T0 )) ثانية"
