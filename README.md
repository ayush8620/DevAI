# DevAI Gateway

A production-ready internal API gateway that provides your applications with **one unified AI API endpoint** while managing multiple authorized API credentials/providers, quotas, caching, retries, health checks, and usage tracking.

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
   OpenAI  Anthropic  Google
             Groq
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

The gateway runs on `http://localhost:3001` and the dashboard on `http://localhost:3000`.
Open **Settings** in the dashboard and paste your `ADMIN_API_KEY` (it is stored only in your browser).

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
npm test               # unit + integration tests (integration needs DB/Redis from .env)
npm run lint           # type-check both packages

# End-to-end smoke test against a running gateway (creates and cleans up test data)
ADMIN_API_KEY=... PROVIDER_API_KEY=your_gemini_key npm run test:e2e
# Optional: PROVIDER_TYPE=groq MODEL=llama-3.1-8b-instant GATEWAY_URL=http://localhost:3001
```

## Usage

### 1. Create a Project

Open the dashboard at `http://localhost:3000`, go to **Projects**, and create a new project.

### 2. Generate an API Key

In the project details, click **Generate API Key**. Copy the key — it's only shown once.

### 3. Add a Provider

Go to **Providers**, add a provider (OpenAI, Anthropic, Google, or Groq), then add your API credentials.

### 4. Make Requests

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
        "providers": ["my-groq:llama-3.1-8b-instant", {"provider": "my-gemini", "model": "gemini-2.5-flash"}],
        "judge": "my-gemini:gemini-2.5-flash-lite",
        "timeoutMs": 30000
      }}'
```

`providers` is the priority order (for `single`) or the participants (for `fastest`/`best`). Each entry is a provider id, name or type, optionally followed by `:model`. If you leave it out, every active provider that supports the requested model is used, ordered by the provider's `config.priority` (higher first) and then by recent latency. The `judge` defaults to the first provider in the list.

### Per-request override

Use the `x-devai-mode: fastest` header, or add a `devai` field to the body. The body wins over the header, and the header wins over the app default:

```json
{
  "model": "auto",
  "messages": [{"role": "user", "content": "Explain binary search"}],
  "devai": { "mode": "best", "providers": ["gem-flash:gemini-2.5-flash", "gem-lite:gemini-2.5-flash-lite"], "timeoutMs": 20000 }
}
```

### Response

Response headers: `x-devai-mode`, `x-devai-provider` (`<provider name>/<model>`), `x-devai-fallbacks` (failed attempts before the answer). The body is the usual OpenAI-style response plus a `devai` object:

```json
"devai": {
  "mode": "best", "provider": "gem-flash", "model": "gemini-2.5-flash", "fallbacks": 0, "latency_ms": 3900,
  "candidates": [
    {"provider": "gem-lite", "model": "gemini-2.5-flash-lite", "status": "success", "latency_ms": 397, "usage": {"total_tokens": 63}},
    {"provider": "gem-flash", "model": "gemini-2.5-flash", "status": "success", "latency_ms": 3374, "selected": true, "usage": {"total_tokens": 631}}
  ],
  "judge": {"method": "judge", "provider": "gem-flash", "model": "gemini-2.5-flash", "reason": "Candidate 2 is more complete."}
}
```

Every provider call (including cancelled ones and the judge call) is saved as its own usage record, with its tokens, latency and status (200 ok, 499 cancelled, 502 error, 504 timeout).

> Adding routing creates a new `routing` column on `projects`, so run `npm run db:push` after upgrading.

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/health` | Gateway health status |

### Authenticated (Project API Key)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | Chat completion (OpenAI-compatible) |
| `GET` | `/v1/models` | List available models |
| `GET` | `/v1/usage` | Project usage statistics |

### Admin (Admin API Key)

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

## Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| OpenAI | `openai` | GPT-4o, GPT-4, GPT-3.5 |
| Anthropic | `anthropic` | Claude 4, Claude 3.5 |
| Google | `google` | Gemini 2.5 Flash/Pro, Gemma (free tier key from Google AI Studio) |
| Groq | `groq` | LLaMA, Mixtral (fast inference) |
| Ollama Cloud | `ollama` | Remote/Cloud Ollama API (Llama 3, DeepSeek, Mistral) |

## Features

- **Unified API** — OpenAI-compatible endpoint for all providers
- **Smart Routing** — Automatically selects the best provider based on health, quota, and latency
- **Automatic Failover** — Retries on the next provider in priority order, with a circuit breaker for providers that are down
- **Parallel Modes** — `fastest` (first answer wins) or `best` (an LLM judge picks the best answer), selectable per app or per request
- **Credential Rotation** — Rotates between multiple credentials per provider
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
- CORS configuration
- Admin/project auth separation
- Audit trail for all admin actions

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Upstash Redis TCP URL (rediss://) |
| `MASTER_ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM |
| `ADMIN_API_KEY` | Admin dashboard authentication |
| `GATEWAY_PORT` | Gateway server port (default: 3001) |
| `NEXT_PUBLIC_API_URL` | Gateway URL for dashboard |

## License

Private — Internal use only.

## Deployment (free tiers)

- **Database:** [Neon](https://neon.tech) free plan. **Redis:** [Upstash](https://upstash.com) free plan (use the `rediss://` TCP URL).
- **Gateway:** deploy `packages/gateway` to Vercel (root directory `packages/gateway`; `api/index.ts` + `vercel.json` are included).
  Env vars: `DATABASE_URL`, `REDIS_URL`, `MASTER_ENCRYPTION_KEY`, `ADMIN_API_KEY`, `NODE_ENV=production`, optional `ALLOWED_ORIGINS`.
- **Dashboard:** deploy `packages/dashboard` to Vercel (root directory `packages/dashboard`). Env var: `NEXT_PUBLIC_API_URL` = your gateway URL.
- Run `npm run db:push` once against the production `DATABASE_URL`.
