# DevAI Gateway API

Web version: https://devai-dashboard-six.vercel.app/docs

**Base URL:** `https://devai-gateway.onrender.com/v1`

DevAI speaks the OpenAI Chat Completions format: any OpenAI client works by changing the base URL and API key. It is **bring-your-own-key (BYOK)**: requests run only on provider keys you add yourself. Behind the endpoint the gateway picks one of your providers and keys, retries on the next key or provider when one fails, and records tokens and latency.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /v1/chat/completions` | `dvai_` key | Chat completion on your own provider keys, JSON or streaming (SSE) |
| `GET /v1/models` | `dvai_` key | Models of the providers your key routes over |
| `GET /v1/usage` | `dvai_` key | Usage summary for the calling key's project |
| `GET /v1/health` | none | Gateway, database and Redis health (no provider needed) |
| `/user/*` | Clerk session | Your provider keys, key health, `dvai_` keys and hackathon kits |
| `/admin/*` | admin | Shared providers, projects, analytics (admin only) |
| `GET /public/kits/:shareToken` | none | Hackathon kit status (quota left, expiry) |

Every response has an `X-Request-ID` header. The gateway runs on a free hosting tier, so the first request after a quiet period can be slow while it wakes up.

## Bring your own key

DevAI has no provider keys of its own to lend. Every signed-in user:

1. Adds their own provider keys in the dashboard under **Your keys** (`/dashboard/pool`): OpenAI, Anthropic, Google Gemini, Groq, OpenRouter or Mistral. Keys are encrypted (AES-256-GCM).
2. Creates a DevAI API key (`dvai_…`) on the same page.
3. Calls `/v1/chat/completions` with it. The gateway routes **only** over that user's keys.

With no provider key (or all disabled) the gateway answers `400 no_provider_keys` and never falls back to anyone else's keys:

```json
{ "error": { "type": "no_provider_keys", "message": "no_provider_keys: add your own provider key in the dashboard (Your keys → Add a key), then retry. DevAI never uses shared keys for your requests.", "request_id": "req_…" } }
```

A model none of your keys serves → `400 no_provider_for_model` (use `"model": "auto"`, `devai.providers`, or add a key for that provider).

| Provider | `provider` id when adding a key | Default model for `auto` |
|---|---|---|
| OpenAI | `openai` | `gpt-4o-mini` |
| Anthropic | `anthropic` | `claude-3-5-haiku-20241022` |
| Google Gemini | `gemini` | `gemini-2.5-flash` |
| Groq | `groq` | `llama-3.1-8b-instant` |
| OpenRouter | `openrouter` | `openrouter/auto` (any model id) |
| Mistral | `mistral` | `mistral-small-latest` (any model id) |

You can set your own default model per provider when adding a key. The gateway admin may run shared providers (Dashboard → Shared providers) for the admin's own projects; those keys never serve other users' traffic.

## Authentication

All `/v1` endpoints except `/v1/health` need a DevAI API key (create it under **Your keys**; keys start with `dvai_` and are shown once):

```
Authorization: Bearer dvai_your_key
```

Missing/invalid header, unknown or revoked key, or inactive project → `401 authentication_error`. Keep the key server-side; browsers are only allowed from origins on the gateway's CORS allowlist.

## Chat completions

`POST /v1/chat/completions`

```bash
curl https://devai-gateway.onrender.com/v1/chat/completions \
  -H "Authorization: Bearer $DEVAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{ "role": "user", "content": "Explain binary search in one line." }],
    "max_tokens": 200
  }'
```

```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "https://devai-gateway.onrender.com/v1", apiKey: process.env.DEVAI_KEY });
const completion = await client.chat.completions.create({
  model: "auto", // or any model your keys support, e.g. "gpt-4o-mini"
  messages: [{ role: "user", content: "Explain binary search in one line." }],
});
console.log(completion.choices[0].message.content);
```

```python
import os
from openai import OpenAI
client = OpenAI(base_url="https://devai-gateway.onrender.com/v1", api_key=os.environ["DEVAI_KEY"])
completion = client.chat.completions.create(
    model="auto",  # or e.g. "llama-3.1-8b-instant"
    messages=[{"role": "user", "content": "Explain binary search in one line."}],
)
print(completion.choices[0].message.content)
```

### Request body

| Field | Type | Description |
|---|---|---|
| `messages` | array, required | `{ role, content }`; role is `system`, `user` or `assistant`; content is a string |
| `model` | string | e.g. `gpt-4o-mini`, `llama-3.1-8b-instant`. Default `auto` (any of your providers, its default model) |
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
| `providers` | array (max 10) | Provider id, name or type (`google`, `openai`, `anthropic`, `groq`, `ollama`), optionally with a model: `"openai:gpt-4o-mini"` or `{ "provider": "groq", "model": "llama-3.1-8b-instant" }` |
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

Precedence: body `devai` → `x-devai-mode` header → project routing defaults → `single`. With `model: "auto"` and no provider list, every provider you have a key for takes part, ordered by configured priority then recent latency.

## Multi-key strategies

The strategy only changes the order keys are tried in. A failing key always falls through to the next key of the same provider before another provider is tried; cooling-down keys are skipped.

| Strategy | Order |
|---|---|
| `failover` | Priority order (oldest key first) |
| `round_robin` | Default for your keys. Rotates the starting key every request |
| `random` | Shuffles healthy keys per request |
| `least_used` | Fewest recent requests first |

Set it in the dashboard (Your keys → Rotation), or per request with `devai.keyStrategy` or the `x-devai-key-strategy` header (body wins over header, header over project default, project default over provider setting).

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

Plain requests on the admin's own projects (mode `single`, no `devai` field) are cached in Redis for 1 hour (`X-Cache: HIT`). Requests on users' own keys are never cached. Identical concurrent requests share one upstream call. Streams are cached when they finish normally.

## Models, usage, health

- `GET /v1/models` → `{ "object": "list", "data": [{ "id", "object": "model", "created", "owned_by": "<provider name>" }] }`: only models of the providers your key routes over (each provider's default model plus registered models); empty until you add a key
- `GET /v1/usage?period=today|week|month` → `{ requestCount, inputTokens, outputTokens, totalTokens, avgLatencyMs, cacheHitRate, period }`
- `GET /v1/health` (public, needs no provider) → `{ status: healthy|degraded|unhealthy, gateway, database, redis, byok: true, providers: [], providers_checked_at, uptime, timestamp }`. `status` reflects the database (unhealthy) and Redis (degraded) only. `providers` lists just the admin's shared providers from the last background check (key counts only, usually empty) and never changes `status`. Your own keys' health: `POST /user/pool/health` or the dashboard.

## Your provider keys (`/user/pool`)

Signed-in users add their own provider keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral) in the dashboard under **Your keys**. Their `dvai_` key routes **only** over those keys, with their rotation strategy. Rate-limited keys cool down and the next key answers. This traffic is never cached.

Limits: Free 2 keys, Student 10, Pro and Team unlimited (`403 plan_limit_reached` beyond the limit).

These endpoints use the Clerk session token as `Authorization: Bearer <session JWT>`:

| Endpoint | Description |
|---|---|
| `GET /user/pool` | Plan, limit, strategy, masked keys with `health` and `lastCheck`, `onboarding` (`hasProviderKey`, `hasApiKey`, `nextStep`: `add_provider_key` \| `create_api_key` \| `done`), 30-day `stats` (`served`, `tokens`, `rateLimitsAbsorbed`, `stretchFactor`) |
| `POST /user/pool/keys` | `{ provider: openai\|anthropic\|gemini\|groq\|openrouter\|mistral, apiKey, name?, defaultModel?, quotaLimit? }` |
| `POST /user/pool/health` | Test every enabled key with a cheap authenticated call (no tokens): `{ status: healthy\|degraded\|unhealthy\|no_keys, healthy, total, keys: [...] }`. A failing key is skipped by routing for 5 min |
| `POST /user/pool/keys/:id/test` | Test one key |
| `PATCH /user/pool/keys/:id` | `{ enabled?, name? }` |
| `DELETE /user/pool/keys/:id` | Remove a key |
| `PUT /user/pool/strategy` | `{ keyStrategy }` |
| `POST /user/pool/api-keys` / `DELETE /user/pool/api-keys/:id` | Create (shown once) / revoke your `dvai_` key |

`stretchFactor` = answers served by all your keys ÷ answers served by your busiest single key.

## Hackathon kits

Team plan users can create kits: temporary `dvai_` team keys with a request cap and/or token cap, an end time (≤ 30 days), an optional max team size (≤ 50 keys) and an optional allowed-model list. Kit traffic runs on the owner's own provider keys. With an allowed-model list, `"model": "auto"` uses the first allowed model. Caps are counted in Redis across all of the kit's keys. Tokens are added when a response finishes, so the last request can go slightly over a token cap.

| Endpoint | Auth | Description |
|---|---|---|
| `GET /user/kits` | Clerk session | Kits with `status` and `usage` (`requests`, `tokens`, `requestsRemaining`, `tokensRemaining`) |
| `POST /user/kits` | Clerk session (Team) | `{ name, expiresAt, requestCap?, tokenCap?, maxTeamSize?, keyCount?, allowedModels? }`; returns the keys once |
| `POST /user/kits/:id/revoke` | Clerk session | Revoke the kit |
| `POST /user/coupons/validate` | Clerk session | `{ code, plan, period }` → `{ code, kind, duration, basePaise, discountPaise, finalPaise }` (nothing held) |
| `POST /user/coupons/reserve` | Clerk session | Same body; atomically holds one use for 60 min, adds `redemptionId` |
| `POST /user/coupons/redemptions/:id/release` | Clerk session | Give the held use back (checkout abandoned) |
| `POST /user/coupons/redemptions/:id/confirm` | Clerk session | `{ subscriptionId }`; marks the use as paid (idempotent) |
| `GET /public/kits/:shareToken` | none | Name, status, expiry, caps, usage (no keys). Shown at `/kit/<shareToken>` |

## Errors

`{ "error": { "type", "message", "request_id" } }`

| Status | `error.type` | When |
|---|---|---|
| 400 | `invalid_request` | Body not JSON or invalid |
| 400 | `no_provider_keys` | You have no (enabled) provider key: add one under Your keys. Shared keys are never used instead |
| 400 | `no_provider_for_model` | None of your provider keys serves the requested model |
| 400 | `no_eligible_providers` | None of the providers in `devai.providers` are yours |
| 400 | `validation_error` | Admin API: missing/invalid field |
| 401 | `authentication_error` | Bad/missing credentials |
| 403 | `permission_error` | Admin API: Clerk user not allowlisted |
| 404 | `not_found` | Unknown route or resource |
| 409 | `conflict` | Admin API: model already exists |
| 500 | `server_error` | Unexpected error |
| 502 | `all_providers_failed` | Every provider/key failed; has `retry_after` and `attempts` |
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

Admin only (regular users never need it). `/admin/*` accepts **either** the gateway `ADMIN_API_KEY` **or** a Clerk session token of a user on `ADMIN_EMAILS` / `ADMIN_USER_IDS` (`Authorization: Bearer …`). Other Clerk users get `403`. Project keys don't work. Results are wrapped in `data`.

| Endpoint | Description |
|---|---|
| `GET /admin/me` | `{ method: "admin_key" }` or `{ method: "clerk", userId, email }` |
| `GET /admin/coupons` | Promo codes with `confirmedCount` and `reservedCount` |
| `POST /admin/coupons` | `{ code, kind: "percent"\|"flat", percentOff? (1-90), amountOffInr?, plans?, periods?, duration: "first_cycle"\|"forever", expiresAt?, maxRedemptions?, oncePerUser?, razorpayOfferId?, note? }` |
| `PATCH /admin/coupons/:id` | `{ status?: "active"\|"disabled", expiresAt?, maxRedemptions? }` |
| `POST /admin/coupons/redemptions/:id/confirm` | `{ subscriptionId }`; used by the dashboard webhook with `GATEWAY_ADMIN_API_KEY` |
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
