#!/usr/bin/env bash
# النسخ الاحتياطي خارج GitHub بأمر واحد (D09): يشغله backup.yml ليليًا، ويشغله المالك من جهازه أثناء حجب Actions.
#   SUPABASE_DB_URL=... BACKUP_PUBLIC_KEY_FILE=backup-public.asc R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
#   R2_SECRET_ACCESS_KEY=... R2_BUCKET=mi-backups scripts/ops/backup.sh
# يفرّغ مخططات leaders وpublic وauth (ومعها دلو leaders-private إن وُجد SUPABASE_SERVICE_ROLE_KEY)،
# ويشفّر عند المصدر بالمفتاح العام فلا يحمل المشغّل ما يفك التشفير، ويرفع إلى R2 مع بيان بالبصمات
# وعدد الصفوف يقارنه تمرين الاستعادة. المفتاح الخاص عند المالك في مكانين خارج GitHub وCloudflare.
# خيارات البيئة: BACKUP_SCHEMAS (افتراضيًا leaders,public,auth)، وBACKUP_PREFIX (daily، أو archive لتفريغ مرة واحدة
# مثل مخطط sspdf في D13)، وBACKUP_OUT (مجلد تبقى فيه النسخ المشفرة، افتراضيًا مجلد مؤقت يُحذف).
# بلا مفتاح عام وبـ BACKUP_PASSPHRASE وحده يعمل بالتشفير المتماثل القديم مع تحذير، حتى يضبط المالك المفتاح.
# المتطلبات: bash وgpg وnode 20، وpg_dump من إصدار الخادم (BACKUP_PG_MAJOR، افتراضيًا 17) أو docker.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL مطلوب (Session pooler)}"
SCHEMAS="${BACKUP_SCHEMAS:-leaders,public,auth}"
PREFIX="${BACKUP_PREFIX:-daily}"
# اسم كل كائن فريد بلحظة تشغيله: daily/ تحت قفل احتفاظ يمنع الكتابة فوق كائن قائم (409 ObjectLockedByBucketPolicy)،
# فكان الاسم باليوم وحده يُفشل كل تشغيل ثانٍ في اليوم (ops-2: نسخة ما قبل الترحيل، أو إعادة تشغيل فاشل). latest.json يدل على الأحدث
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
DAY="${STAMP%%T*}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${BACKUP_OUT:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
[ -n "$OUT" ] || OUT="$WORK/out"
mkdir -p "$OUT"
TAG="$(echo "$SCHEMAS" | tr ',' '-')"

pgtool() {   # pg_dump/psql من الإصدار 17 محليًا، وإلا من docker
  local tool="$1"; shift
  if command -v "$tool" >/dev/null && [ "$("$tool" --version | grep -oE '[0-9]+' | head -1)" -ge "${BACKUP_PG_MAJOR:-17}" ]; then "$tool" "$@"
  else docker run --rm -i -e PGCONNECT_TIMEOUT=30 postgres:17 "$tool" "$@"; fi
}

encrypt() {   # $1 الملف الصريح ← $1.gpg
  if [ -n "${BACKUP_PUBLIC_KEY_FILE:-}" ] || [ -n "${BACKUP_PUBLIC_KEY:-}" ]; then
    local key="${BACKUP_PUBLIC_KEY_FILE:-$WORK/public.asc}"
    [ -n "${BACKUP_PUBLIC_KEY_FILE:-}" ] || printf '%s\n' "$BACKUP_PUBLIC_KEY" > "$key"
    gpg --batch --yes --quiet --trust-model always --recipient-file "$key" --encrypt -o "$1.gpg" "$1"
    MODE=public-key
  elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    echo "::warning::لا مفتاح عام (BACKUP_PUBLIC_KEY)، فالتشفير متماثل بعبارة مرور تحملها بيئة التشغيل. اضبط المفتاح العام (D09)." >&2
    gpg --batch --yes --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$1.gpg" "$1"
    MODE=symmetric
  else
    echo "لا مفتاح عام ولا عبارة مرور: لا تُحفظ نسخة غير مشفرة" >&2; exit 1
  fi
  rm -f "$1"
}

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
bytes() { wc -c < "$1" | tr -d ' '; }

# ── القاعدة ──
dump="$OUT/db-$TAG-$STAMP.dump"
args=(--no-owner --no-privileges -Fc)
for s in ${SCHEMAS//,/ }; do args+=("--schema=$s"); done
pgtool pg_dump "$SUPABASE_DB_URL" "${args[@]}" > "$dump"
test -s "$dump"

# عدد الصفوف لحظة النسخ، فيقارنه التمرين بعد الاستعادة
ROWS="{}"
if [ "$PREFIX" = daily ]; then
  ROWS="$(pgtool psql "$SUPABASE_DB_URL" -At -v ON_ERROR_STOP=1 -c "select json_build_object(
    'leaders.participants', (select count(*) from leaders.participants),
    'leaders.placements', (select count(*) from leaders.placements),
    'leaders.certificates', (select count(*) from leaders.certificates),
    'leaders.audit_log', (select count(*) from leaders.audit_log),
    'public.contact_requests', (select count(*) from public.contact_requests),
    'auth.users', (select count(*) from auth.users))")"
fi
encrypt "$dump"
files=("$dump.gpg")

# ── الملفات الخاصة (السير الذاتية والأدلة) ──
if [ "$PREFIX" = daily ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  ( cd "$WORK" && SUPABASE_URL="${SUPABASE_URL:-https://eormhcupwgwpllhrfxxg.supabase.co}" node "$ROOT/scripts/db/backup-storage.mjs" storage leaders-private )
  ( cd "$WORK/storage" && find . -type f -print0 | sort -z | xargs -0 -I{} sh -c 'printf "%s\t%s\n" "$(wc -c < "{}" | tr -d " ")" "{}"' ) > "$WORK/storage-files.tsv"
  cp "$WORK/storage-files.tsv" "$WORK/storage/.files.tsv"
  tar czf "$OUT/storage-$STAMP.tar.gz" -C "$WORK" storage
  encrypt "$OUT/storage-$STAMP.tar.gz"
  files+=("$OUT/storage-$STAMP.tar.gz.gpg")
elif [ "$PREFIX" = daily ]; then
  echo "::warning::SUPABASE_SERVICE_ROLE_KEY غير مضبوط: دلو leaders-private (السير الذاتية والأدلة) لم يُنسخ." >&2
fi

# ── البيان ──
manifest="$OUT/manifest-$TAG-$STAMP.json"
{
  printf '{"at":"%s","day":"%s","prefix":"%s","schemas":"%s","encryption":"%s","rows":%s,"files":[' "$(date -u +%FT%TZ)" "$DAY" "$PREFIX" "$SCHEMAS" "$MODE" "$ROWS"
  sep=""
  for f in "${files[@]}"; do printf '%s{"key":"%s/%s","sha256":"%s","bytes":%s}' "$sep" "$PREFIX" "$(basename "$f")" "$(sha "$f")" "$(bytes "$f")"; sep=","; done
  printf ']}\n'
} > "$manifest"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$manifest"

# ── الرفع ──
if [ -n "${R2_BUCKET:-}" ]; then
  for f in "${files[@]}" "$manifest"; do node "$ROOT/scripts/ops/r2.mjs" put "$PREFIX/$(basename "$f")" "$f"; done
  if [ "$PREFIX" = daily ]; then
    # الشهرية في أول كل شهر بقفل أطول، وlatest.json خارج القفل يقرؤه مراقب الحداثة
    if [ "$(date -u +%d)" = 01 ]; then for f in "${files[@]}" "$manifest"; do node "$ROOT/scripts/ops/r2.mjs" put "monthly/$(basename "$f")" "$f"; done; fi
    node "$ROOT/scripts/ops/r2.mjs" put latest.json "$manifest" application/json
  fi
else
  echo "::warning::R2 غير مضبوط (R2_ACCOUNT_ID وR2_ACCESS_KEY_ID وR2_SECRET_ACCESS_KEY وR2_BUCKET): النسخة لم تخرج من بيئة التشغيل." >&2
fi
echo "BACKUP_DIR=$OUT"
cat "$manifest"
