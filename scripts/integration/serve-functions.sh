#!/usr/bin/env bash
# يقدّم الدوال بـ supabase functions serve في الخلفية وينتظر جاهزيتها (سير التكامل، الوظيفتان golden-paths وproduction-schema).
#   API_URL=http://127.0.0.1:54321 bash scripts/integration/serve-functions.sh     السجل في /tmp/functions.log
# جاهزية حقيقية: system.ping يمر بالقاعدة ويرد success. أي رد HTTP لا يكفي، لأن Kong يرد 502
# ما دام وقت تشغيل الدوال يُقلع، فتقع أولى طلبات المسار الذهبي في نافذة الإقلاع (حدث في طلب الدمج #200)
set -euo pipefail
: "${API_URL:?API_URL مطلوب}"
nohup supabase functions serve --env-file supabase/functions/ci.env --no-verify-jwt > /tmp/functions.log 2>&1 &
eval "$(supabase status -o env 2>/dev/null | grep -E '^ANON_KEY=' || true)"
auth=(); [ -n "${ANON_KEY:-}" ] && auth=(-H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
for i in $(seq 1 60); do
  if curl -s --max-time 10 -X POST -H 'Content-Type: application/json' "${auth[@]}" \
    -d '{"action":"system.ping"}' "$API_URL/functions/v1/leaders-api" | grep -q '"success":true'; then
    echo "leaders-api ready after $i tries"; exit 0
  fi
  sleep 2
done
echo "::error::leaders-api did not answer system.ping within two minutes"; tail -60 /tmp/functions.log; exit 1
