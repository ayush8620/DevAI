<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/dashboard/public/brand/devai-logo-dark.svg">
    <img alt="DevAI" src="packages/dashboard/public/brand/devai-logo-light.svg" height="64">
  </picture>
</p>

# DevAI Gateway

**Live:** [devai-dashboard-six.vercel.app](https://devai-dashboard-six.vercel.app) · **Docs:** [API reference](https://devai-dashboard-six.vercel.app/docs) · **Pricing:** [plans](https://devai-dashboard-six.vercel.app/pricing) · **API:** `https://devai-gateway.onrender.com/v1/chat/completions` · [Health](https://devai-gateway.onrender.com/v1/health)

A production-ready API gateway that gives your applications **one unified, OpenAI-compatible AI endpoint** with failover, key rotation, quotas, caching, retries, health checks and usage tracking.

**Bring your own key (BYOK):** DevAI has no provider keys of its own. Every user adds their own OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral keys, and their requests run **only** on those keys. No provider is hard-coded or preferred; a user with no key gets a clear `400 no_provider_keys` error, never someone else's quota.

## Brand assets

Hand-written SVGs in `packages/dashboard/public/brand/`: `devai-mark.svg` (the "loop-route D": an outlined rounded tile with a D-shaped route that loops back to an orange dot; black on light backgrounds), `devai-mark-inverted.svg` (white, for dark backgrounds), `devai-logo-light.svg` / `devai-logo-dark.svg` (mark + wordmark for light / dark backgrounds) and `devai-og.svg`. The favicon is `packages/dashboard/src/app/icon.svg` (a filled white tile with a heavier black route and orange dot, so it reads on light and dark browser tabs at 16 px). Regenerate the PNGs (32 px favicon, 180 px Apple touch icon, 1200×630 Open Graph image) with `node scripts/brand-assets.mjs`.

## Architecture

```
Applications
     │
     ▼
┌──────────────────────────┐
│       DevAI Gateway      │
│                          │
│ Authentication           │
│ Request Validation       │
│ Cache                    │
│ Request Deduplication    │
│ Routing Engine           │
│ Quota Manager            │
│ Provider Adapters        │
│ Retry / Backoff          │
│ Usage Tracking           │
└────────────┬─────────────┘
             │
      ┌──────┼───────────┐
      ▼      ▼           ▼
   OpenAI  Anthropic  Gemini
   Groq  OpenRouter  Mistral
   (the user's own keys)
```

## Quick Start

### Prerequisites

- Node.js 20+
- Neon PostgreSQL database
- Upstash Redis instance

### Setup

```bash
git clone https://github.com/ayush8620/DevAI
cd DevAI
npm install

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL, and generate MASTER_ENCRYPTION_KEY
# and ADMIN_API_KEY with the commands shown in .env.example

# Create the database tables
npm run db:push

# Start gateway + dashboard
npm run dev
```

The gateway runs on `http://localhost:3001`. The dashboard runs on `http://localhost:3000`: the landing page is at `/` and the admin dashboard at `/dashboard`. The old paths (`/providers`, `/projects`, `/usage`, `/settings`, `/api-docs`) redirect to `/dashboard/...`.
Open **Settings** (`/dashboard/settings`) and paste your `ADMIN_API_KEY` (it is stored only in your browser). Or set up [Clerk sign-in](#clerk-sign-in-dashboard-login) so you sign in with email, Google or GitHub instead.

### Optional: Local PostgreSQL & Redis (Docker)

```bash
docker compose up -d
```

Then use these values in `.env`:

```env
DATABASE_URL=postgresql://devai:devai_local_password@localhost:5432/devai
REDIS_URL=redis://:devai_redis_password@localhost:6379
```

Neon URLs use Neon's serverless driver; any other PostgreSQL URL uses `node-postgres`.

### Production build

```bash
npm run build          # gateway -> packages/gateway/dist/index.js, dashboard -> .next
npm run start -w packages/gateway
npm run start -w packages/dashboard
```

### Tests

```bash
npm test               # gateway unit + integration tests (integration needs DB/Redis from .env) and dashboard billing tests
npm run lint           # type-check both packages

# End-to-end smoke test against a running gateway (creates and cleans up test data)
ADMIN_API_KEY=... PROVIDER_TYPE=groq PROVIDER_API_KEY=your_provider_key MODEL=llama-3.1-8b-instant npm run test:e2e
# PROVIDER_TYPE and MODEL are required (no provider is assumed). Optional: GATEWAY_URL=http://localhost:3001
```

## Usage

### For users: bring your own key

1. Sign in to the dashboard and open **Your keys** (`/dashboard/pool`). A new account sees **Add your first provider key**.
2. Add one or more keys from OpenAI, Anthropic, Google Gemini, Groq, OpenRouter or Mistral (free tiers work). They are encrypted and used only for your requests.
3. Create your DevAI API key (`dvai_…`) on the same page and call the gateway with it (below). Requests route only over your keys.

Without a provider key the gateway answers `400 no_provider_keys: add your own provider key in the dashboard`. Use **Check all keys** / the per-key **Test** button (or `POST /user/pool/health`) to see if your keys work; no tokens are spent.

### For the gateway admin (shared providers, optional)

The admin can still create **Projects** and **Shared providers** (`/dashboard/providers`) for the admin's own apps. A project key created there routes over the shared providers. Shared providers never serve other users' requests, and user keys never serve admin projects.

### Make requests

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer dvai_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      {"role": "user", "content": "Explain binary search"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

Your application only needs:

```env
AI_BASE_URL=http://localhost:3001/v1
AI_API_KEY=dvai_your_api_key
```

## Routing modes

Every app (project) has a routing mode. Pick it in the dashboard (**Projects → your app → Routing**) or override it per request.

| Mode | What happens | Cost |
|------|--------------|------|
| `single` (default) | One provider at a time, in priority order. If it fails (5xx, 429, timeout, network error, bad credential, empty answer), the next one is tried automatically. | 1 call (more only on failure) |
| `fastest` | Sends to all selected providers at once, returns the first valid answer and cancels the rest. | Up to N calls |
| `best` | Sends to all selected providers, waits for their answers (bounded by the timeout), and a judge model picks the best one. If the judge fails, the most complete answer is used. | N calls + 1 judge call |

Failed or slow providers never fail the request as long as one succeeds. If all fail you get `502 all_providers_failed` with every attempt listed.

**Circuit breaker:** a provider/model that just failed with 5xx, timeout, network or auth errors is skipped for 60 s (30 s for 429). Providers that failed their background health check are skipped for 5 minutes. Skipped targets show up as `"status": "skipped"`.

### Per-app defaults (admin API)

```bash
curl -X PATCH http://localhost:3001/admin/projects/<projectId> \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"routing": {
        "mode": "single",
        "providers": ["my-groq:llama-3.1-8b-instant", {"provider": "my-openai", "model": "gpt-4o-mini"}],
        "judge": "my-openai:gpt-4o-mini",
        "timeoutMs": 30000
      }}'
```

`providers` is the priority order (for `single`) or the participants (for `fastest`/`best`). Each entry is a provider id, name or type, optionally followed by `:model`. If you leave it out, every active provider of the key's owner that supports the requested model is used, ordered by the provider's `config.priority` (higher first) and then by recent latency. The `judge` defaults to the first provider in the list.

### Per-request override

Use the `x-devai-mode: fastest` header, or add a `devai` field to the body. The body wins over the header, and the header wins over the app default:

```json
{
  "model": "auto",
  "messages": [{"role": "user", "content": "Explain binary search"}],
  "devai": { "mode": "best", "providers": ["openai:gpt-4o-mini", "groq:llama-3.1-8b-instant"], "timeoutMs": 20000 }
}
```

### Response

Response headers:

- `x-devai-mode`
- `x-devai-provider` (`<provider name>/<model>`)
- `x-devai-fallbacks`: the number of providers that failed before the answer.
- `x-devai-key`: the name and masked key that answered, e.g. `Groq key (gsk_...DyMg)`. Only the prefix and the last 4 characters are shown.
- `x-devai-key-fallbacks`: the number of keys of the answering provider that failed first.
- `x-cache`: `HIT` or `MISS`.

 The body is the usual OpenAI-style response plus a `devai` object:

```json
"devai": {
  "mode": "best", "provider": "OpenAI", "model": "gpt-4o-mini", "fallbacks": 0, "key": "OpenAI key (sk-p…DyMg)", "key_fallbacks": 0, "latency_ms": 3900,
  "candidates": [
    {"provider": "Groq", "model": "llama-3.1-8b-instant", "status": "success", "latency_ms": 397, "usage": {"total_tokens": 63}},
    {"provider": "OpenAI", "model": "gpt-4o-mini", "status": "success", "latency_ms": 3374, "selected": true, "usage": {"total_tokens": 631}}
  ],
  "judge": {"method": "judge", "provider": "OpenAI", "model": "gpt-4o-mini", "reason": "Candidate 2 is more complete."}
}
```

Every provider call (including cancelled ones and the judge call) is saved as its own usage record, with its tokens, latency and status (200 ok, 499 cancelled, 502 error, 504 timeout).

> Adding routing creates a new `routing` column on `projects`, so run `npm run db:push` after upgrading.

## Streaming

Send `"stream": true` to get OpenAI-compatible Server-Sent Events. The OpenAI SDKs work unchanged.

```bash
curl -N https://devai-gateway.onrender.com/v1/chat/completions \
  -H "Authorization: Bearer dvai_your_api_key" -H "Content-Type: application/json" \
  -d '{"model":"auto","stream":true,"stream_options":{"include_usage":true},
       "messages":[{"role":"user","content":"Explain binary search"}]}'
```

```
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Binary"},"finish_reason":null}]}
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":9,"completion_tokens":120,"total_tokens":129}}
data: [DONE]
```

- **Failover before the first byte.** If a key or provider fails before it sends any text, the gateway retries with the next key, then the next provider. The client never sees the failure. The routing headers (`x-devai-provider`, `x-devai-key`, ...) describe the target that actually streams.
- **Errors after text has started** cannot be retried. The gateway sends `data: {"error":{"type":"stream_error",...}}` and then `data: [DONE]`.
- **Usage** is recorded when the stream ends: 200 on success, 499 if the client disconnects, 502 on an error mid-stream. If the provider reports no token counts, tokens are estimated.
- **Caching.** The assembled answer is cached only if the stream finished normally (`finish_reason: "stop"`). A cache hit is replayed as SSE.
- **Modes.** `single` streams from the first working target. `fastest` races the targets and streams from the first one that produces text; the others are cancelled. `best` waits for the judge and then sends the chosen answer as one chunk.
- Anthropic, OpenAI, Groq, Ollama and Gemini stream natively.

## Multiple keys per provider

Add as many API keys as you like to one provider (**Dashboard → Providers → Add Another Key**). The gateway tries them inside that provider before moving on to the next provider.

| Upstream failure | What happens to that key | Retry next key? |
|---|---|---|
| 429 rate limit | Cooled down for 30 s, or the provider's `Retry-After` / `RetryInfo` (5 s – 1 h) | yes |
| 429 / 402 quota or billing exhausted | Cooled down for 10 min, or the provider's hint | yes |
| 401 / 403, invalid API key | Cooled down for 5 min | yes |
| 5xx, timeout, network error | That key + model is cooled down for 60 s | yes |
| other 4xx (bad request) | No cooldown | no, moves to the next provider |

- Cooldowns are per key, shared through Redis, and also kept in memory.
- A provider is skipped only when **all** its keys are cooling down or unhealthy.
- Google per-model quota errors cool down only that key + model, so the key can still serve other models.
- Health checks test every key separately.
- The Providers page shows each key's live status (active, rate limited, quota exhausted, invalid, cooling down, unhealthy, disabled) with the remaining cooldown, the last error, and requests in the last minute. You can enable or disable each key.

### Key strategy

The key strategy decides which key a request tries first. Keys that are cooling down are always tried last, and on any failure the next key is tried.

| Strategy | Order |
|---|---|
| `failover` (default) | Priority order. The first healthy key is used until it fails. |
| `round_robin` | Rotates across the healthy keys, request by request. The counter lives in Redis. |
| `random` | Random order for each request. |
| `least_used` | Fewest requests in the last 60 s first. |

- **Priority order:** set it with the arrows on the Providers page. It is saved as `config.keyOrder`, a list of credential ids. Keys not in the list follow, oldest first.
- **Per provider:** pick the strategy on the Providers page, or use the admin API:

  ```bash
  curl -X PATCH $GATEWAY/admin/providers/<id> -H "Authorization: Bearer $ADMIN_API_KEY" \
    -H "Content-Type: application/json" -d '{"config":{"keyStrategy":"round_robin","keyOrder":["<credId1>","<credId2>"]}}'
  ```

  `config` is merged. Set a field to `null` to remove it.
- **Per project:** `routing.keyStrategy` in `PATCH /admin/projects/:id`.
- **Per request:** `"devai": {"keyStrategy": "random"}` in the body, or the header `x-devai-key-strategy: least_used`.

Precedence: request body > header > project > provider > `failover`.

## Gemini thinking models

Gemini 2.5+ "thinking" tokens count against `maxOutputTokens`. Without a fix, a small `max_tokens` can return an empty or cut-off answer. When `max_tokens` is set, the gateway does this:

| Models | What the gateway does |
|---|---|
| 2.5 Flash / Flash-Lite, `gemini-flash(-lite)-latest` | Turns thinking off (`thinkingBudget: 0`) |
| 2.5 Pro | Uses the minimum budget (128), added on top of `max_tokens` |
| Gemini 3+ | Sets `thinkingLevel: low` and adds 1024 tokens of headroom |
| Gemma 4+ | Adds 1024 tokens of headroom |

## CORS

Browsers may call the gateway only from the origins listed in `ALLOWED_ORIGINS` (comma-separated, e.g. `https://your-dashboard.vercel.app`). Use `ALLOWED_ORIGINS=*` to allow every origin.

- When `NODE_ENV` is not `production`, `http://localhost:*` and `127.0.0.1` are also allowed.
- Server-to-server requests (no `Origin` header) are not affected.

## Clerk sign-in (dashboard login)

Clerk sign-in is optional. When it is configured:

- `/dashboard` requires sign-in. `/`, `/sign-in` and `/sign-up` stay public.
- Users can sign in with email, Google or GitHub, or whatever else is enabled in Clerk. The code does not restrict sign-in methods.
- The dashboard sends the user's Clerk session token to the gateway instead of the admin key.

The gateway accepts **either** `ADMIN_API_KEY` **or** a valid Clerk session token on `/admin/*`. DevAI is single-tenant, so a Clerk account alone is not enough: the user must be on `ADMIN_EMAILS` or `ADMIN_USER_IDS`.

| Request | Result |
|---|---|
| `Bearer <ADMIN_API_KEY>` | 200 |
| Valid Clerk session of an allowlisted email / user id | 200 |
| Valid Clerk session of any other user | 403 `permission_error` |
| Valid Clerk session, but no allowlist configured | 403, plus a warning in the gateway log. Only the admin key works. |
| Bad, expired or tampered token, or wrong origin (`azp`) | 401 |

How the gateway checks a token:
- It verifies the token with `@clerk/backend`'s `verifyToken`. With `CLERK_SECRET_KEY` it fetches the JWKS; with `CLERK_JWT_KEY` it verifies without a network call.
- `authorizedParties` is set to `ALLOWED_ORIGINS`. A token minted for another site is rejected, and so is a token with no `azp` claim.
- Emails are looked up through the Clerk Backend API and cached for 10 minutes. Only verified addresses count.
- `GET /admin/me` returns the caller (`{method:"clerk", userId, email}` or `{method:"admin_key"}`), and audit logs record the admin's email.

The Settings page shows whether the gateway accepts the current session. The admin key field stays there as a fallback: if the Clerk token gets a 401 or 403, the dashboard retries with the saved key.

### Setup

1. **Clerk dashboard:**
   - Create an application and enable **Email**, **Google** and **GitHub** (Configure → SSO connections).
   - Development instances use Clerk's shared OAuth credentials, so this works out of the box.
   - For a production instance, add your own Google and GitHub OAuth client IDs, and use the redirect URI Clerk shows.
2. **Dashboard env** (Vercel, or `packages/dashboard/.env.local`):

   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
   CLERK_SECRET_KEY=sk_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   ```

   `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them. Without the publishable key the build still succeeds and the dashboard falls back to the admin key.
3. **Gateway env** (Render, or `.env`):

   ```env
   CLERK_SECRET_KEY=sk_...                  # same secret key as the dashboard
   ADMIN_EMAILS=you@example.com             # and/or ADMIN_USER_IDS=user_...
   ALLOWED_ORIGINS=https://your-dashboard.vercel.app
   ```

   `ALLOWED_ORIGINS` must contain the dashboard origin exactly, because Clerk tokens are checked against it. Optionally set `CLERK_JWT_KEY` (the PEM public key from Clerk → API keys) for networkless verification.
4. Sign in at `/sign-in`. **Settings → Admin Access** should show "Authorized".

No JWT template is needed: the default session token is used, and the email is looked up on the server. If you prefer, add `"email": "{{user.primary_email_address}}"` under Clerk → Sessions → Customize session token, and the gateway will read it from the token instead.

## Pricing & subscriptions (Razorpay)

Plans live in one file, [`packages/dashboard/src/lib/billing/plans.ts`](packages/dashboard/src/lib/billing/plans.ts). Paid plans are **Razorpay Subscriptions** that renew automatically until cancelled. Yearly billing costs 10 months (2 months free, about 17% off).

| Plan | Monthly | Yearly | Requests / day | Projects | Provider keys |
|------|---------|--------|----------------|----------|---------------|
| Free | ₹0 | ₹0 | 100 | 1 | 2 |
| Student (verified `.edu` / `.ac.in` email) | ₹99 | ₹990 | 2,000 | 3 | 5 |
| Pro | ₹499 | ₹4,990 | 20,000 | 10 | 20 |
| Team | ₹1,999 | ₹19,990 | 100,000 | 50 | 100 |

The public page is [`/pricing`](https://devai-dashboard-six.vercel.app/pricing) (Monthly / Yearly toggle); signed-in users manage their subscription at `/dashboard/billing` (current plan, status, renewal date, cancel, change plan). The subscription state is stored on the Clerk user (`publicMetadata.billing`: `plan`, `period`, `status`, `expiresAt` = end of the paid period, `subscriptionId`, `cancelAtPeriodEnd`, `scheduled`, `coupon`). The gateway reads `plan`/`status`/`expiresAt` to enforce the key-pool size and hackathon-kit access; the other limits are not enforced yet.

How it works:

1. `POST /api/billing/subscribe` `{ planId, period, code? }` (Clerk session): creates a Razorpay subscription with `plan_id` from `RAZORPAY_PLAN_ID_*`, `total_count` 120 (monthly) / 10 (yearly), and notes `{ userId, planId, period, ... }`. Amounts never come from the browser. The Student plan checks the account's verified emails.
2. The browser opens Checkout.js with `subscription_id`; the customer sets up UPI Autopay, a card or an eMandate.
3. `POST /api/billing/verify`: checks `HMAC_SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, RAZORPAY_KEY_SECRET)`, fetches the subscription, checks its `notes.userId`, and stores the plan.
4. `POST /api/billing/webhook` (public): checks `x-razorpay-signature` = `HMAC_SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)`, dedupes on `x-razorpay-event-id`, ignores events older than the last one applied, and updates the plan (`src/lib/billing/subscription.ts`, unit-tested):

| Event | Effect |
|-------|--------|
| `subscription.authenticated` | Mandate set up. Stored as a scheduled change if it starts later; active right away if the first period was paid upfront (promo code) |
| `subscription.activated`, `subscription.charged` | `status: active`, `expiresAt` = `current_end`; clears a payment error |
| `subscription.pending` | Renewal failing, Razorpay retries; plan kept until `expiresAt` |
| `subscription.halted` | Retries exhausted; plan kept until `expiresAt`, then Free |
| `subscription.cancelled`, `subscription.completed` | No renewal; plan kept until `expiresAt`, then Free |
| `payment.failed` | Records the error on the Billing page (subscription found via the payment's invoice) |

- **Cancel** (`POST /api/billing/cancel`): cancels at the end of the current cycle (`cancel_at_cycle_end: 1`). The user keeps the plan until the period ends.
- **Change plan**: a new subscription. Upgrades (higher price per month) start now and cancel the old subscription immediately, **without proration** (unused days are not refunded). Downgrades and switches to a cheaper period start at the end of the current period (`start_at`; Razorpay takes a ₹5 refundable authorisation), and the old subscription is cancelled at cycle end once the new mandate is set up.
- Old one-time 30-day plans keep working until they expire; buying a subscription then starts when they end.

### Promo codes

Admins create codes at `/dashboard/coupons` (gateway `/admin/coupons`, stored in the gateway database, migration `packages/gateway/drizzle/0003_coupons.sql`). A code has: percent (1-90%) or flat ₹ off, plans and billing periods it applies to, expiry, max redemptions, once per user, and **first payment only** or **every payment**. Customers enter it under **Have a code?**; the dashboard server validates and reserves it on the gateway (`/user/coupons/*`) with the user's Clerk session. Limits are enforced in single atomic SQL statements (a conditional counter update plus a partial unique index), so concurrent checkouts cannot exceed them. A reservation is held for 60 minutes and confirmed when the payment is verified.

How the discount is applied (Razorpay has no API to create offers):

- **First payment only**: the discounted first period is charged upfront (subscription `addons`) and the subscription's full-price billing starts one period later (`start_at`).
- **Every payment**: the subscription uses a discounted Razorpay plan created on the fly through the Plans API (cached per server instance, so a few extra plans may appear in Razorpay).
- **Razorpay offer**: if the code has a `razorpayOfferId` (an offer you created in Razorpay → Offers, with the same terms), the subscription is created with `offer_id` and Razorpay applies it.

Limitations: no 100% discounts (Razorpay needs at least ₹1); first-payment codes cannot be combined with a downgrade that starts at period end; Razorpay lists `addons` as a legacy feature, so test first-payment codes in test mode, or use a Razorpay offer instead; if the browser is closed right after paying and `GATEWAY_ADMIN_API_KEY` is not set on the dashboard, the reservation is released after 60 minutes (the discount still applies; the use is not counted). Example (documentation only, nothing is seeded): `LAUNCH20`, 20% off the first payment, max 100 redemptions, once per user.

### Environment variables (Vercel → dashboard project)

| Variable | Value |
|----------|-------|
| `RAZORPAY_KEY_ID` | Key id from Razorpay → Account & Settings → API keys (`rzp_test_…` / `rzp_live_…`) |
| `RAZORPAY_KEY_SECRET` | The matching key secret (server only) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Same as `RAZORPAY_KEY_ID`, used by Checkout.js |
| `RAZORPAY_PLAN_ID_STUDENT`, `RAZORPAY_PLAN_ID_PRO`, `RAZORPAY_PLAN_ID_TEAM` | Monthly plan ids |
| `RAZORPAY_PLAN_ID_STUDENT_YEARLY`, `RAZORPAY_PLAN_ID_PRO_YEARLY`, `RAZORPAY_PLAN_ID_TEAM_YEARLY` | Yearly plan ids (optional; without them yearly shows "Payments coming soon") |
| `RAZORPAY_WEBHOOK_SECRET` | Secret you set on the webhook |
| `GATEWAY_ADMIN_API_KEY` | Optional, server only: the gateway `ADMIN_API_KEY`, so the webhook can confirm promo-code redemptions |
| `GATEWAY_URL` | Optional: gateway URL for server-side calls (defaults to `NEXT_PUBLIC_API_URL`) |

Create the six plans with `RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… node scripts/razorpay-create-plans.mjs` (prints the `RAZORPAY_PLAN_ID_*` lines; reuses matching plans on re-runs; `--dry-run` shows what it would create). Run it once with test keys and once with live keys.

Webhook: Razorpay → Account & Settings → Webhooks → **Add new webhook**, URL `https://<dashboard>/api/billing/webhook`, the secret above, and these events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment.failed`.

Without the keys (or without Clerk, or without a plan id for a plan/period) the buttons show **Payments coming soon** and nothing calls Razorpay. The landing page's plan grid is static, so redeploy after adding keys.

## Bring your own key (BYOK)

Every signed-in user adds their own provider keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral) at `/dashboard/pool` (**Your keys**):

- Requests with the user's `dvai_` key route **only** over that user's keys. With no (enabled) key the gateway returns `400 no_provider_keys`; with no key that serves the requested model, `400 no_provider_for_model`. There is no fallback to the admin's or anyone else's keys.
- The Overview page shows the onboarding steps (add a provider key → create a DevAI key → call the gateway) until both are done, then a health summary of the user's keys.
- **Per-user key health:** `POST /user/pool/health` (all keys) and `POST /user/pool/keys/:id/test` (one key) make a cheap authenticated call (list models; OpenRouter: `/key`), no tokens spent. A key that fails is skipped by routing for 5 minutes.
- `/v1/models` lists only the models of the caller's own providers.

- Keys are encrypted with `MASTER_ENCRYPTION_KEY` (AES-256-GCM) and only ever shown as prefix + last 4.
- A pool API key (`dvai_…`) routes over **only that user's keys**, using the usual key strategies (`round_robin`, `least_used`, `failover`, `random`). A key that returns 429 cools down (30s, or the provider's retry hint) and the next key answers, so the user doesn't see the error.
- The page shows per-key health (healthy / cooling down / quota used / error / disabled) and "quota stretched" stats: answers served divided by what the busiest single key served, plus the number of rate limits absorbed.
- Plan limits are enforced by the gateway: Free **2** keys, Student **10**, Pro and Team **unlimited** (from `packages/gateway/src/billing/plans.ts`, kept in sync with the dashboard plan config by a unit test).
- User keys are never used for shared or admin traffic, the background health check skips them (so it doesn't spend free quota), and their traffic is not cached.
- The public `/v1/health` needs no provider: it reports gateway, database and Redis; provider keys never change its status.

## Hackathon kits (Team plan)

At `/dashboard/kits`, Team users create a **kit**: temporary team API keys with:

- a request cap and/or token cap (Redis counters `kit:<id>:requests` and `kit:<id>:tokens`),
- an end date and time (up to 30 days),
- an optional max team size (up to 50 keys) and an allowed-model list.

The keys are shown once. Kit traffic uses the owner's own provider keys. Each kit has a public share page, `/kit/<shareToken>`, that shows the quota left and the deadline, but no keys. The owner can revoke a kit at any time. The gateway returns clear errors: `kit_revoked` / `kit_expired` (403), `kit_model_not_allowed` (400), and `kit_request_cap_reached` / `kit_token_cap_reached` (429). See [/docs#kits](https://devai-dashboard-six.vercel.app/docs#kits).

### Database migration (pool + kits)

The pool and kits need new columns and a table. Run the migration on Neon **before** deploying the new gateway:

```bash
psql "$DATABASE_URL" -f packages/gateway/drizzle/0001_key_pool_and_hackathon_kits.sql
# or: cd packages/gateway && npm run db:push
```

The SQL is idempotent (`IF NOT EXISTS`), so it is safe to run twice. No new environment variables are needed. The gateway uses the existing `CLERK_SECRET_KEY` (to read the user's plan) and `MASTER_ENCRYPTION_KEY`.

### Database migration (BYOK)

BYOK needs no new tables or columns. `packages/gateway/drizzle/0002_byok.sql` only adds one index for the per-request "this user's active providers" lookup. It is optional, idempotent (`IF NOT EXISTS`), changes no data and is safe on Neon:

```bash
psql "$DATABASE_URL" -f packages/gateway/drizzle/0002_byok.sql
```

Existing shared (admin) providers and keys (`owner_user_id IS NULL`) keep working for the admin's own projects and are not changed.

### Database migration (promo codes)

Promo codes need two new tables (`coupons`, `coupon_redemptions`). Run this on Neon **before** deploying the gateway that serves `/admin/coupons` and `/user/coupons`. It is idempotent (`IF NOT EXISTS`), adds no rows and changes no existing data:

```bash
psql "$DATABASE_URL" -f packages/gateway/drizzle/0003_coupons.sql
# or: cd packages/gateway && npm run db:push
```

## API Endpoints

Full reference with curl, JavaScript and Python examples: **[devai-dashboard-six.vercel.app/docs](https://devai-dashboard-six.vercel.app/docs)** (Markdown copy in the repo: [docs/API.md](docs/API.md)).

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/health` | Gateway, database and Redis health (no provider needed) |
| `GET` | `/public/kits/:shareToken` | Hackathon kit status: quota left and expiry |

### Authenticated (DevAI `dvai_` key)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | Chat completion (OpenAI-compatible) on the key owner's provider keys |
| `GET` | `/v1/models` | Models of the key owner's providers |
| `GET` | `/v1/usage` | Project usage statistics |

### Admin (Admin API Key or allowlisted Clerk session)

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PATCH/DELETE` | `/admin/providers` | Provider management |
| `POST` | `/admin/providers/:id/test` | Test provider health |
| `GET/POST/DELETE` | `/admin/providers/:id/models` | Model management |
| `POST` | `/admin/providers/:id/sync-models` | Import models from the provider |
| `GET/POST` | `/admin/credentials/provider/:providerId` | Credential management |
| `PATCH/DELETE` | `/admin/credentials/:id` | Update / delete credential |
| `GET/POST/PATCH/DELETE` | `/admin/projects` | Project management (PATCH accepts `routing`) |
| `GET/POST` | `/admin/api-keys/project/:projectId` | List / generate project API keys |
| `DELETE` | `/admin/api-keys/:id` | Revoke API key |
| `GET` | `/admin/analytics/*` | Usage analytics |
| `GET` | `/admin/audit-logs` | Audit log viewer |
| `GET` | `/admin/me` | Who is calling (Clerk user or admin key) |

### Signed-in user (any Clerk session)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/user/pool` | Your provider keys, health, onboarding step and stretch stats |
| `POST` | `/user/pool/keys` | Add a provider key (`{ provider: openai\|anthropic\|gemini\|groq\|openrouter\|mistral, apiKey, name?, defaultModel? }`) |
| `PATCH/DELETE` | `/user/pool/keys/:id` | Enable/disable/rename or remove a key |
| `POST` | `/user/pool/health` | Test all your keys (no tokens) |
| `POST` | `/user/pool/keys/:id/test` | Test one key |
| `PUT` | `/user/pool/strategy` | Set your key rotation strategy |
| `POST/DELETE` | `/user/pool/api-keys[/:id]` | Create / revoke your `dvai_` API keys |
| `GET/POST` | `/user/kits` | List / create hackathon kits (create needs Team) |
| `POST` | `/user/kits/:id/revoke` | Revoke a kit |
| `GET` | `/public/kits/:shareToken` | Public kit status (no auth, no keys) |

## Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| OpenAI | `openai` | GPT-4o, GPT-4, GPT-3.5 |
| Anthropic | `anthropic` | Claude 4, Claude 3.5 |
| Google | `google` | Gemini 2.5 Flash/Pro, Gemma (free tier key from Google AI Studio) |
| Groq | `groq` | LLaMA, Mixtral (fast inference) |
| OpenRouter | `openai` + base URL | Any OpenRouter model id (user keys: provider `openrouter`) |
| Mistral | `openai` + base URL | Mistral models (user keys: provider `mistral`) |
| Ollama Cloud | `ollama` | Remote/Cloud Ollama API (Llama 3, DeepSeek, Mistral) |

## Features

- **Bring your own key** — every user's requests run only on their own provider keys; nothing is hard-coded
- **Unified API** — OpenAI-compatible endpoint for all providers
- **Smart Routing** — Automatically selects the best provider based on health, quota, and latency
- **Automatic Failover** — Retries on the next provider in priority order, with a circuit breaker for providers that are down
- **Parallel Modes** — `fastest` (first answer wins) or `best` (an LLM judge picks the best answer), selectable per app or per request
- **Streaming** — OpenAI-compatible SSE with failover before the first byte
- **Multiple Keys per Provider** — Per-key cooldowns and failover, with `failover`, `round_robin`, `random` or `least_used` strategies
- **Response Caching** — Redis-based caching with SHA-256 keys
- **Request Deduplication** — Coalesces identical in-flight requests (per gateway instance)
- **Retry & Backoff** — Exponential backoff with jitter, automatic failover on 429
- **Usage Tracking** — Per-project, per-provider, per-model analytics
- **Quota Management** — Track and enforce per-credential quotas
- **Health Monitoring** — Background health checks with status dashboard
- **Audit Logging** — Full audit trail for admin actions
- **Encryption** — AES-256-GCM encryption for stored API keys
- **Admin Dashboard** — Premium Next.js dashboard with dark mode

## Tech Stack

| Layer | Technology |
|-------|------------|
| API Framework | Hono |
| Frontend | Next.js 15, Tailwind CSS, shadcn/ui |
| Database | Neon PostgreSQL, Drizzle ORM |
| Cache | Upstash Redis (ioredis) |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |

## Project Structure

```
devai-gateway/
├── packages/
│   ├── gateway/          # Hono API server
│   │   ├── src/
│   │   │   ├── cache/        # Redis client
│   │   │   ├── crypto/       # AES-256-GCM encryption
│   │   │   ├── db/           # Drizzle ORM + schema
│   │   │   ├── engine/       # Routing, scoring, retry
│   │   │   ├── middleware/   # Auth, CORS, logging
│   │   │   ├── providers/    # Provider adapters
│   │   │   ├── routes/       # API routes
│   │   │   ├── services/     # Business logic
│   │   │   └── types/        # Shared types
│   │
│   └── dashboard/        # Next.js admin UI
│       └── src/
│           ├── app/          # Pages
│           ├── components/   # UI components
│           └── lib/          # Utilities
│
├── scripts/e2e.sh       # End-to-end smoke test
├── docker-compose.yml
├── .env.example
└── package.json
```

## Security

- Provider API keys encrypted at rest (AES-256-GCM)
- API keys hashed with SHA-256, prefix-based lookup
- No API keys in logs, errors, or responses
- Zod validation on all inputs
- CORS restricted to `ALLOWED_ORIGINS` (plus localhost outside production)
- Keys shown only as prefix + last 4 (`AIza…DyMg`) in the dashboard, headers and API
- Admin/project auth separation
- Optional Clerk sign-in for the dashboard; admin access limited to `ADMIN_EMAILS` / `ADMIN_USER_IDS`
- Audit trail for all admin actions

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Upstash Redis TCP URL (rediss://) |
| `MASTER_ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM |
| `ADMIN_API_KEY` | Admin dashboard authentication |
| `GATEWAY_PORT` | Gateway server port (default: 3001) |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed by CORS (e.g. your dashboard URL), or `*` |
| `NODE_ENV` | `production` turns off the automatic localhost CORS allowance |
| `CLERK_SECRET_KEY` | Gateway and dashboard: Clerk secret key (optional, enables Clerk sign-in) |
| `CLERK_JWT_KEY` | Gateway: Clerk PEM public key for networkless token checks (optional) |
| `ADMIN_EMAILS` / `ADMIN_USER_IDS` | Gateway: comma-separated Clerk users allowed to use the admin API |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Dashboard: Clerk publishable key (turns on sign-in) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Dashboard: `/sign-in`, `/sign-up` |
| `NEXT_PUBLIC_API_URL` | Gateway URL for dashboard |

## License

Private — Internal use only.

## Deployment (free tiers)

- **Database:** [Neon](https://neon.tech) free plan. **Redis:** [Upstash](https://upstash.com) free plan (use the `rediss://` TCP URL).
- **Gateway:** deploy `packages/gateway` to Vercel (root directory `packages/gateway`; `api/index.ts` + `vercel.json` are included).
  Env vars: `DATABASE_URL`, `REDIS_URL`, `MASTER_ENCRYPTION_KEY`, `ADMIN_API_KEY`, `NODE_ENV=production`, `ALLOWED_ORIGINS` (your dashboard URL; required for the dashboard to work in production).
- **Dashboard:** deploy `packages/dashboard` to Vercel (root directory `packages/dashboard`). Env var: `NEXT_PUBLIC_API_URL` = your gateway URL, plus the Clerk variables if you use [Clerk sign-in](#clerk-sign-in-dashboard-login).
- Run `npm run db:push` once against the production `DATABASE_URL`.
