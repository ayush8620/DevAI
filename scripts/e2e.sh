#!/usr/bin/env bash
# End-to-end smoke test against a running gateway.
# Usage:
#   ADMIN_API_KEY=... PROVIDER_TYPE=openai|anthropic|google|groq|ollama PROVIDER_API_KEY=... MODEL=<a model of that provider> \
#   [GATEWAY_URL=http://localhost:3001] ./scripts/e2e.sh
# Creates a test project, API key, provider and credential, then exercises every endpoint.
set -euo pipefail

URL="${GATEWAY_URL:-http://localhost:3001}"
# Bring your own key: no provider or model is assumed.
: "${PROVIDER_TYPE:?set PROVIDER_TYPE (openai, anthropic, google, groq or ollama)}"
: "${MODEL:?set MODEL (a model your PROVIDER_API_KEY can use, e.g. gpt-4o-mini or llama-3.1-8b-instant)}"
TYPE="$PROVIDER_TYPE"
: "${ADMIN_API_KEY:?set ADMIN_API_KEY}"
: "${PROVIDER_API_KEY:?set PROVIDER_API_KEY}"
ADMIN=(-H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json")
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log(eval('o'+process.argv[1]))})" "$1"; }
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }
code() { curl -s -o /tmp/e2e_body -w '%{http_code}' "$@"; }

check "GET /v1/health" "$(code "$URL/v1/health")" 200
check "admin rejects bad key" "$(code -H 'Authorization: Bearer nope' "$URL/admin/projects")" 401

PROJECT=$(curl -sf "${ADMIN[@]}" -X POST "$URL/admin/projects" -d '{"name":"e2e-test"}' | json .data.id)
KEY=$(curl -sf "${ADMIN[@]}" -X POST "$URL/admin/api-keys/project/$PROJECT" -d '{"name":"e2e"}' | json .data.key)
PROVIDER=$(curl -sf "${ADMIN[@]}" -X POST "$URL/admin/providers" -d "{\"type\":\"$TYPE\",\"name\":\"e2e-$TYPE\"}" | json .data.id)
CRED_BODY=$(node -e 'console.log(JSON.stringify({name:"e2e",apiKey:process.env.PROVIDER_API_KEY}))')
check "add credential" "$(code "${ADMIN[@]}" -X POST "$URL/admin/credentials/provider/$PROVIDER" -d "$CRED_BODY")" 201
check "provider health test" "$(code "${ADMIN[@]}" -X POST "$URL/admin/providers/$PROVIDER/test")" 200
check "sync models" "$(code "${ADMIN[@]}" -X POST "$URL/admin/providers/$PROVIDER/sync-models")" 200

USER=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json")
check "v1 rejects missing key" "$(code "$URL/v1/models")" 401
check "GET /v1/models" "$(code "${USER[@]}" "$URL/v1/models")" 200
BODY="{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"system\",\"content\":\"Answer in one word.\"},{\"role\":\"user\",\"content\":\"Capital of France? $RANDOM\"}],\"max_tokens\":300}"
check "POST /v1/chat/completions" "$(code "${USER[@]}" -X POST "$URL/v1/chat/completions" -d "$BODY")" 200
echo "  reply: $(json '.choices[0].message.content' < /tmp/e2e_body)"
CACHE=$(curl -s -D - -o /dev/null "${USER[@]}" -X POST "$URL/v1/chat/completions" -d "$BODY" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-cache"{print $2}')
check "second identical request is cached" "$CACHE" HIT
check "invalid body rejected" "$(code "${USER[@]}" -X POST "$URL/v1/chat/completions" -d '{"messages":"x"}')" 400
sleep 1
check "GET /v1/usage" "$(code "${USER[@]}" "$URL/v1/usage")" 200
for p in overview by-provider by-model by-project recent-requests; do
  check "GET /admin/analytics/$p" "$(code "${ADMIN[@]}" "$URL/admin/analytics/$p")" 200
done
check "GET /admin/audit-logs" "$(code "${ADMIN[@]}" "$URL/admin/audit-logs")" 200
check "GET /admin/providers" "$(code "${ADMIN[@]}" "$URL/admin/providers")" 200
check "unknown route 404" "$(code "$URL/nope")" 404

# Routing: a deliberately broken provider first, then the real one -> automatic failover
BROKEN=$(curl -sf "${ADMIN[@]}" -X POST "$URL/admin/providers" -d "{\"type\":\"openai\",\"name\":\"e2e-broken\",\"baseUrl\":\"http://127.0.0.1:9/v1\"}" | json .data.id)
curl -s -o /dev/null "${ADMIN[@]}" -X POST "$URL/admin/credentials/provider/$BROKEN" -d '{"name":"bad","apiKey":"invalid"}'
RBODY="{\"devai\":{\"providers\":[\"$BROKEN:gpt-4o-mini\",\"$PROVIDER:$MODEL\"]},\"messages\":[{\"role\":\"user\",\"content\":\"Say ok $RANDOM\"}]}"
FB=$(curl -s -D - -o /tmp/e2e_body "${USER[@]}" -X POST "$URL/v1/chat/completions" -d "$RBODY" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-devai-fallbacks"{print $2}')
check "failover to working provider (x-devai-fallbacks)" "$FB" 1
FBODY="{\"devai\":{\"mode\":\"fastest\",\"providers\":[\"$PROVIDER:$MODEL\"]},\"messages\":[{\"role\":\"user\",\"content\":\"Say ok $RANDOM\"}]}"
check "fastest mode" "$(code "${USER[@]}" -X POST "$URL/v1/chat/completions" -d "$FBODY")" 200
check "mode in metadata" "$(json .devai.mode < /tmp/e2e_body)" fastest
DOWN="{\"devai\":{\"providers\":[\"$BROKEN:gpt-4o\"]},\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"
check "all providers down -> 502" "$(code "${USER[@]}" -X POST "$URL/v1/chat/completions" -d "$DOWN")" 502
curl -s -o /dev/null "${ADMIN[@]}" -X DELETE "$URL/admin/providers/$BROKEN"

# Clean up test resources
curl -s -o /dev/null "${ADMIN[@]}" -X DELETE "$URL/admin/providers/$PROVIDER"
curl -s -o /dev/null "${ADMIN[@]}" -X DELETE "$URL/admin/projects/$PROJECT"

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
