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
# Clone and install
git clone <repo>
cd devai-gateway
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL, Redis URL, and generate encryption keys

# Push database schema
npm run db:push

# Start development servers
npm run dev
```

The gateway runs on `http://localhost:3001` and the dashboard on `http://localhost:3000`.

### Optional: Local PostgreSQL & Redis (Docker)

```bash
docker compose up -d
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
| `GET/POST` | `/admin/providers` | Provider management |
| `GET/POST` | `/admin/providers/:id/credentials` | Credential management |
| `GET/POST` | `/admin/projects` | Project management |
| `POST` | `/admin/projects/:id/api-keys` | API key generation |
| `GET` | `/admin/analytics/*` | Usage analytics |
| `GET` | `/admin/audit-logs` | Audit log viewer |

## Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| OpenAI | `openai` | GPT-4o, GPT-4, GPT-3.5 |
| Anthropic | `anthropic` | Claude 4, Claude 3.5 |
| Google | `google` | Gemini Pro, Gemini Flash |
| Groq | `groq` | LLaMA, Mixtral (fast inference) |
| Ollama Cloud | `ollama` | Remote/Cloud Ollama API (Llama 3, DeepSeek, Mistral) |

## Features

- **Unified API** — OpenAI-compatible endpoint for all providers
- **Smart Routing** — Automatically selects the best provider based on health, quota, and latency
- **Credential Rotation** — Rotates between multiple credentials per provider
- **Response Caching** — Redis-based caching with SHA-256 keys
- **Request Deduplication** — Coalesces identical in-flight requests
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
│   │   └── drizzle/          # Migration files
│   │
│   └── dashboard/        # Next.js admin UI
│       └── src/
│           ├── app/          # Pages
│           ├── components/   # UI components
│           └── lib/          # Utilities
│
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
