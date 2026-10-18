# DevAI Gateway API

Web version: https://devai-dashboard-six.vercel.app/docs

**Base URL:** `https://devai-gateway.onrender.com/v1`

DevAI speaks the OpenAI Chat Completions format: any OpenAI client works by changing the base URL and API key. Behind the endpoint the gateway picks a provider and key, retries on the next key or provider when one fails, and records tokens and latency.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /v1/chat/completions` | project key | Chat completion, JSON or streaming (SSE) |
| `GET /v1/models` | project key | Models registered in the gateway |
| `GET /v1/usage` | project key | Usage summary for the calling project |
| `GET /v1/health` | none | Gateway, database, Redis and provider health |
| `/admin/*` | admin | Providers, keys, projects, analytics (used by the dashboard) |
| `/user/*` | Clerk session | Your personal key pool and hackathon kits |
| `GET /public/kits/:shareToken` | none | Hackathon kit status (quota left, expiry) |

Every response has an `X-Request-ID` header. The gateway runs on a free hosting tier, so the first request after a quiet period can be slow while it wakes up.

## Authentication

All `/v1` endpoints except `/v1/health` need a project API key (create a project in the dashboard and generate a key; keys start with `dvai_` and are shown once):

```
Authorization: Bearer dvai_your_project_key
```

Missing/invalid header, unknown or revoked key, or inactive project → `401 authentication_error`. Keep the key server-side; browsers are only allowed from origins on the gateway's CORS allowlist.

## Chat completions

`POST /v1/chat/completions`

```bash
curl https://devai-gateway.onrender.com/v1/chat/completions \
  -H "Authorization: Bearer $DEVAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{ "role": "user", "content": "Explain binary search in one line." }],
    "max_tokens": 200
  }'
```

```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "https://devai-gateway.onrender.com/v1", apiKey: process.env.DEVAI_KEY });
const completion = await client.chat.completions.create({
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "Explain binary search in one line." }],
});
console.log(completion.choices[0].message.content);
```

```python
import os
from openai import OpenAI
client = OpenAI(base_url="https://devai-gateway.onrender.com/v1", api_key=os.environ["DEVAI_KEY"])
completion = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Explain binary search in one line."}],
)
print(completion.choices[0].message.content)
```

### Request body

| Field | Type | Description |
|---|---|---|
| `messages` | array, required | `{ role, content }`; role is `system`, `user` or `assistant`; content is a string |
| `model` | string | e.g. `gemini-2.5-flash`. Default `auto` (any active provider, its default model) |
| `temperature`, `max_tokens`, `top_p` | number | Passed to the provider |
| `stop` | string \| string[] | Stop sequence(s) |
| `stream` | boolean | Stream as SSE |
| `stream_options.include_usage` | boolean | With streaming: final usage chunk |
| `user` | string | Your end-user id |
| `devai` | object | DevAI routing overrides (never forwarded to providers) |

`devai` object:

| Field | Type | Description |
|---|---|---|
| `mode` | `single` \| `fastest` \| `best` | Routing mode (default `single`) |
| `providers` | array (max 10) | Provider id, name or type (`google`, `openai`, `anthropic`, `groq`, `ollama`), optionally with a model: `"google:gemini-2.5-flash"` or `{ "provider": "groq", "model": "llama-3.1-8b-instant" }` |
| `judge` | string \| object | Judge model for `best` |
| `timeoutMs` | integer 1000–120000 | Per-provider timeout, default 30000 |
| `keyStrategy` | `failover` \| `round_robin` \| `random` \| `least_used` | How a provider's keys are used |

Invalid body → `400 invalid_request` with per-field `details`.

### Response

The OpenAI `chat.completion` object plus `devai`: `mode`, `provider`, `model`, `fallbacks` (providers tried first), `key` (masked), `key_fallbacks` (keys tried first), `latency_ms`, `candidates` (one per provider call: `provider`, `provider_type`, `model`, `status`, `latency_ms`, `key`, `selected`, `error`, `usage`) and, in `best` mode, `judge` (`method`, `reason`, `provider`, `model`, `latency_ms`, `error`). Keys are always masked (prefix + last 4).

## Streaming (SSE)

`"stream": true` returns OpenAI-compatible `chat.completion.chunk` events, a final chunk with `finish_reason`, an optional usage chunk (`stream_options.include_usage`), then `data: [DONE]`.

Failover finishes before the first byte, so when every provider fails you get a normal JSON error with an HTTP status. If a provider breaks mid-stream, an event `{"error":{"type":"stream_error",...}}` is sent, then a final chunk with `finish_reason: "error"` and `[DONE]`. In `fastest` mode the first provider to produce text streams and the others are cancelled.

## Routing modes

| Mode | Behaviour |
|---|---|
| `single` | Default. One provider at a time in priority order; on failure the next key, then the next provider |
| `fastest` | Up to 5 providers in parallel; first valid answer wins, others are aborted |
| `best` | Collects every answer; a judge model picks the best (`devai.judge` in the response) |

Precedence: body `devai` → `x-devai-mode` header → project routing defaults → `single`. With `model: "auto"` and no provider list, every active provider takes part, ordered by configured priority then recent latency.

## Multi-key strategies

The strategy only changes the order keys are tried in. A failing key always falls through to the next key of the same provider before another provider is tried; cooling-down keys are skipped.

| Strategy | Order |
|---|---|
| `failover` | Default. Admin-defined priority order |
| `round_robin` | Rotates the starting key every request |
| `random` | Shuffles healthy keys per request |
| `least_used` | Fewest recent requests first |

Set per provider in the dashboard, or per request with `devai.keyStrategy` or the `x-devai-key-strategy` header (body wins over header, header over project default, project default over provider setting).

## Headers

Request: `Authorization`, `Content-Type`, `x-devai-mode` (`single`/`fastest`/`best`), `x-devai-key-strategy` (`failover`/`round_robin`/`random`/`least_used`). Unknown values are ignored.

Response (chat completions):

| Header | Description |
|---|---|
| `X-Request-ID` | Unique request id (every response) |
| `x-devai-mode` | Mode used |
| `x-devai-provider` | `Provider/model` that answered |
| `x-devai-fallbacks` | Providers that failed first |
| `x-devai-key` | Key name + masked hint |
| `x-devai-key-fallbacks` | Keys of the provider that failed first |
| `X-Cache` | `HIT` / `MISS` for cacheable requests |

## Caching

Plain requests (mode `single`, no `devai` field) are cached in Redis for 1 hour (`X-Cache: HIT`). Identical concurrent requests share one upstream call. Streams are cached when they finish normally.

## Models, usage, health

- `GET /v1/models` → `{ "object": "list", "data": [{ "id", "object": "model", "created", "owned_by": "devai" }] }`
- `GET /v1/usage?period=today|week|month` → `{ requestCount, inputTokens, outputTokens, totalTokens, avgLatencyMs, cacheHitRate, period }`
- `GET /v1/health` (public) → `{ status: healthy|degraded|unhealthy, providers: [{ id, name, type, status, latencyMs, error, keys: { total, healthy } }], redis, database, uptime, timestamp }`

## Personal key pool

Signed-in users can pool their own provider keys (Gemini, Groq, OpenRouter, OpenAI) in the dashboard under **Key pool**. A pool API key (`dvai_…`) works on `/v1/chat/completions` like a project key, but it routes **only** over that user's keys, with the pool's key strategy. Rate-limited keys cool down and the next key answers. Pool traffic is not cached.

Limits: Free 2 keys, Student 10, Pro and Team unlimited (`403 plan_limit_reached` beyond the limit).

Pool endpoints use the Clerk session token as `Authorization: Bearer <session JWT>`:

| Endpoint | Description |
|---|---|
| `GET /user/pool` | Plan, limit, strategy, masked keys with `health`, 30-day `stats` (`served`, `tokens`, `rateLimitsAbsorbed`, `stretchFactor`) |
| `POST /user/pool/keys` | `{ provider, apiKey, name?, defaultModel?, quotaLimit? }` |
| `PATCH /user/pool/keys/:id` | `{ enabled?, name? }` |
| `DELETE /user/pool/keys/:id` | Remove a key |
| `PUT /user/pool/strategy` | `{ keyStrategy }` |
| `POST /user/pool/api-keys` / `DELETE /user/pool/api-keys/:id` | Create (shown once) / revoke a pool `dvai_` key |

`stretchFactor` = answers served by the pool ÷ answers served by the busiest single key.

## Hackathon kits

Team plan users can create kits: temporary `dvai_` team keys with a request cap and/or token cap, an end time (≤ 30 days), an optional max team size (≤ 50 keys) and an optional allowed-model list. Kit traffic runs on the owner's key pool. With an allowed-model list, `"model": "auto"` uses the first allowed model. Caps are counted in Redis across all of the kit's keys. Tokens are added when a response finishes, so the last request can go slightly over a token cap.

| Endpoint | Auth | Description |
|---|---|---|
| `GET /user/kits` | Clerk session | Kits with `status` and `usage` (`requests`, `tokens`, `requestsRemaining`, `tokensRemaining`) |
| `POST /user/kits` | Clerk session (Team) | `{ name, expiresAt, requestCap?, tokenCap?, maxTeamSize?, keyCount?, allowedModels? }`; returns the keys once |
| `POST /user/kits/:id/revoke` | Clerk session | Revoke the kit |
| `GET /public/kits/:shareToken` | none | Name, status, expiry, caps, usage (no keys). Shown at `/kit/<shareToken>` |

## Errors

`{ "error": { "type", "message", "request_id" } }`

| Status | `error.type` | When |
|---|---|---|
| 400 | `invalid_request` | Body not JSON or invalid |
| 400 | `validation_error` | Admin API: missing/invalid field |
| 401 | `authentication_error` | Bad/missing credentials |
| 403 | `permission_error` | Admin API: Clerk user not allowlisted |
| 404 | `not_found` | Unknown route or resource |
| 409 | `conflict` | Admin API: model already exists |
| 500 | `server_error` | Unexpected error |
| 502 | `all_providers_failed` | Every provider/key failed; has `retry_after` and `attempts` |
| 503 | `no_providers` / `no_credentials` / `no_eligible_providers` | Nothing configured / usable (pool key: "Your key pool is empty") |
| 400 | `kit_model_not_allowed` | Hackathon kit: model not on the allowed list |
| 403 | `kit_revoked` / `kit_expired` | Hackathon kit revoked or ended |
| 403 | `plan_limit_reached` / `plan_required` | Pool key limit reached / kits need Team |
| 429 | `kit_request_cap_reached` / `kit_token_cap_reached` | Hackathon kit used its cap |

## Rate limits & quotas

The gateway adds no per-project request limit; your providers' limits apply, tracked per key:

| Provider response | DevAI |
|---|---|
| 429 rate limit | Key cools down 30 s (or `Retry-After`, 5 s–1 h); next key |
| 429/402 quota or billing | Key cools down 10 min (or provider hint); next key |
| 401/403 | Key cools down 5 min; next key |
| 5xx, timeout, network | Key + model cools down 60 s; next key |
| Other 4xx | Returned without trying other keys |

Provider keys can have a token quota (reset every 30 days). Google per-model quotas only cool down that key + model. When nothing is left: `502 all_providers_failed`.

## Admin API

`/admin/*` accepts **either** the gateway `ADMIN_API_KEY` **or** a Clerk session token of a user on `ADMIN_EMAILS` / `ADMIN_USER_IDS` (`Authorization: Bearer …`). Other Clerk users get `403`. Project keys don't work. Results are wrapped in `data`.

| Endpoint | Description |
|---|---|
| `GET /admin/me` | `{ method: "admin_key" }` or `{ method: "clerk", userId, email }` |
| `GET/POST /admin/providers` | List / add (`type`, `name`, `baseUrl`, `config`) |
| `PATCH/DELETE /admin/providers/:id` | Update (`name`, `baseUrl`, `status`, `config` merged: `keyStrategy`, `keyOrder`, `priority`) / delete |
| `POST /admin/providers/:id/test` | Test connection |
| `GET/POST /admin/providers/:id/models`, `DELETE /admin/providers/:id/models/:modelId` | Models |
| `POST /admin/providers/:id/sync-models` | Fetch models from the provider |
| `GET/POST /admin/credentials/provider/:providerId` | List (masked) / add key (`name`, `apiKey`, `quotaLimit`) |
| `PATCH/DELETE /admin/credentials/:id`, `POST /admin/credentials/:id/test` | Update / delete / test a key |
| `GET/POST /admin/projects`, `PATCH/DELETE /admin/projects/:id` | Projects (`routing` = same fields as `devai`) |
| `GET/POST /admin/api-keys/project/:projectId`, `DELETE /admin/api-keys/:id` | Project keys (full key only in the create response) / revoke |
| `GET /admin/analytics/overview\|by-provider\|by-model\|by-project?period=` | Analytics |
| `GET /admin/analytics/recent-requests?limit=` | Latest requests (default 50) |
| `GET /admin/audit-logs` | Audit log |
