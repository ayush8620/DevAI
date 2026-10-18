import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Github, BookOpen, Info } from 'lucide-react';
import { CodeBlock, CodeGroup } from '@/components/docs/code-block';
import { SiteHeader, SiteFooter, GITHUB } from '@/components/landing/site-chrome';
import { DocsToc, type TocItem } from '@/components/docs/toc';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'API docs: OpenAI-compatible LLM gateway reference',
  description: 'DevAI Gateway API reference: OpenAI-compatible chat completions on your own keys (bring your own key) for OpenAI, Gemini, Groq, OpenRouter, Anthropic and Mistral. Streaming, failover, LLM routing modes, key rotation, caching and usage endpoints.',
  path: '/docs',
});

const BASE = 'https://devai-gateway.onrender.com';

const toc: TocItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'byok', label: 'Bring your own key' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'chat-completions', label: 'Chat completions' },
  { id: 'request-body', label: 'Request body', sub: true },
  { id: 'response', label: 'Response', sub: true },
  { id: 'streaming', label: 'Streaming (SSE)' },
  { id: 'routing', label: 'Routing modes' },
  { id: 'key-strategies', label: 'Multi-key strategies' },
  { id: 'headers', label: 'Headers' },
  { id: 'caching', label: 'Caching' },
  { id: 'models', label: 'Models' },
  { id: 'usage', label: 'Usage' },
  { id: 'health', label: 'Health' },
  { id: 'key-pool', label: 'Your provider keys' },
  { id: 'kits', label: 'Hackathon kits' },
  { id: 'errors', label: 'Errors' },
  { id: 'rate-limits', label: 'Rate limits & quotas' },
  { id: 'admin', label: 'Admin API' },
];

// ---------- examples ----------
const chatCurl = `curl ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $DEVAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [
      { "role": "system", "content": "You are a concise assistant." },
      { "role": "user", "content": "Explain binary search in one line." }
    ],
    "temperature": 0.3,
    "max_tokens": 200
  }'`;

const chatJs = `// Plain fetch (Node 18+, Deno, Bun, server-side code)
const res = await fetch("${BASE}/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.DEVAI_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "auto", // or any model your keys support
    messages: [{ role: "user", content: "Explain binary search in one line." }],
    max_tokens: 200,
  }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error?.message);
console.log(data.choices[0].message.content);
console.log(res.headers.get("x-devai-provider")); // e.g. "OpenAI/gpt-4o-mini"`;

const chatSdk = `// npm install openai
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${BASE}/v1",
  apiKey: process.env.DEVAI_KEY, // your dvai_ key (runs on your own provider keys)
});

const completion = await client.chat.completions.create({
  model: "auto", // or e.g. "gpt-4o-mini", "claude-3-5-haiku-20241022", "llama-3.1-8b-instant"
  messages: [{ role: "user", content: "Explain binary search in one line." }],
});
console.log(completion.choices[0].message.content);`;

const chatPy = `# pip install openai
import os
from openai import OpenAI

client = OpenAI(
    base_url="${BASE}/v1",
    api_key=os.environ["DEVAI_KEY"],  # your dvai_ key (runs on your own provider keys)
)

completion = client.chat.completions.create(
    model="auto",  # or any model your keys support, e.g. "gpt-4o-mini"
    messages=[{"role": "user", "content": "Explain binary search in one line."}],
)
print(completion.choices[0].message.content)`;

const chatPyRequests = `# pip install requests
import os, requests

r = requests.post(
    "${BASE}/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['DEVAI_KEY']}"},
    json={
        "model": "auto",
        "messages": [{"role": "user", "content": "Explain binary search in one line."}],
    },
    timeout=60,
)
r.raise_for_status()
print(r.json()["choices"][0]["message"]["content"])
print(r.headers.get("x-devai-provider"), r.headers.get("x-devai-fallbacks"))`;

const responseExample = `{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1792310400,
  "model": "llama-3.1-8b-instant",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Binary search halves a sorted range each step..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 14, "completion_tokens": 22, "total_tokens": 36 },
  "devai": {
    "mode": "single",
    "provider": "Groq",
    "model": "llama-3.1-8b-instant",
    "fallbacks": 0,
    "key": "gsk_…DyMg",
    "key_fallbacks": 1,
    "latency_ms": 912,
    "candidates": [
      { "provider": "Groq", "provider_type": "groq", "model": "llama-3.1-8b-instant",
        "status": "error", "latency_ms": 120, "key": "gsk_…k3Qa", "error": "429 rate limited" },
      { "provider": "Groq", "provider_type": "groq", "model": "llama-3.1-8b-instant",
        "status": "success", "latency_ms": 780, "key": "gsk_…DyMg", "selected": true,
        "usage": { "prompt_tokens": 14, "completion_tokens": 22, "total_tokens": 36 } }
    ]
  }
}`;

const streamCurl = `curl -N ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $DEVAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "stream": true,
    "stream_options": { "include_usage": true },
    "messages": [{ "role": "user", "content": "Write a haiku about failover" }]
  }'`;

const streamJs = `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${BASE}/v1", apiKey: process.env.DEVAI_KEY });

const stream = await client.chat.completions.create({
  model: "auto",
  stream: true,
  messages: [{ role: "user", content: "Write a haiku about failover" }],
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;

const streamPy = `import os
from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key=os.environ["DEVAI_KEY"])

stream = client.chat.completions.create(
    model="auto",
    stream=True,
    messages=[{"role": "user", "content": "Write a haiku about failover"}],
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`;

const streamWire = `data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1792310400,"model":"llama-3.1-8b-instant","choices":[{"index":0,"delta":{"role":"assistant","content":"Keys"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1792310400,"model":"llama-3.1-8b-instant","choices":[{"index":0,"delta":{"content":" rotate quietly"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1792310400,"model":"llama-3.1-8b-instant","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1792310400,"model":"llama-3.1-8b-instant","choices":[],"usage":{"prompt_tokens":9,"completion_tokens":17,"total_tokens":26}}

data: [DONE]`;

const routingCurl = `# Race every provider; first valid answer wins
curl ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $DEVAI_KEY" \\
  -H "Content-Type: application/json" \\
  -H "x-devai-mode: fastest" \\
  -d '{ "model": "auto",
        "messages": [{ "role": "user", "content": "Summarise RAFT in 2 lines" }] }'

# Ask two providers, let a judge pick the best answer
curl ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $DEVAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{ "role": "user", "content": "Is 2^61-1 prime? Explain briefly." }],
    "devai": {
      "mode": "best",
      "providers": ["openai:gpt-4o-mini", "groq:llama-3.1-8b-instant"],
      "judge": "openai:gpt-4o-mini",
      "timeoutMs": 20000
    }
  }'`;

const routingJs = `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${BASE}/v1", apiKey: process.env.DEVAI_KEY });

const res = await client.chat.completions.create(
  {
    model: "auto",
    messages: [{ role: "user", content: "Summarise RAFT in 2 lines" }],
    // DevAI-only field; the OpenAI SDK passes unknown body fields through
    // @ts-expect-error not part of the OpenAI types
    devai: { mode: "best", providers: ["openai", "groq"] }, // providers you have keys for
  },
  { headers: { "x-devai-key-strategy": "round_robin" } },
);
console.log((res as any).devai.judge); // { method, reason, provider, model, ... }`;

const routingPy = `import os
from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key=os.environ["DEVAI_KEY"])

res = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Summarise RAFT in 2 lines"}],
    extra_headers={"x-devai-mode": "fastest"},
    extra_body={"devai": {"keyStrategy": "least_used"}},
)
print(res.choices[0].message.content)`;

const keysExample = `{
  "model": "auto",
  "messages": [{ "role": "user", "content": "hi" }],
  "devai": { "keyStrategy": "round_robin" }
}

# or as a header (body wins if both are set):
x-devai-key-strategy: least_used`;

const modelsCurl = `curl ${BASE}/v1/models -H "Authorization: Bearer $DEVAI_KEY"

# {
#   "object": "list",
#   "data": [
#     { "id": "gpt-4o-mini", "object": "model", "created": 1792310400, "owned_by": "OpenAI" },
#     { "id": "llama-3.1-8b-instant", "object": "model", "created": 1792310400, "owned_by": "Groq" }
#   ]
# }
# Only models of the providers YOUR key routes over; empty until you add a provider key.`;

const usageCurl = `curl "${BASE}/v1/usage?period=week" -H "Authorization: Bearer $DEVAI_KEY"

# {
#   "requestCount": 42, "inputTokens": 5120, "outputTokens": 8730, "totalTokens": 13850,
#   "avgLatencyMs": 840, "cacheHitRate": 12, "period": "week"
# }`;

const healthCurl = `curl ${BASE}/v1/health

# {
#   "status": "healthy",            // healthy | degraded | unhealthy (gateway, database, Redis)
#   "gateway": "healthy",
#   "database": "healthy",
#   "redis": "healthy",
#   "byok": true,
#   "providers": [],                // shared providers only, if any; never affects status
#   "providers_checked_at": null,
#   "uptime": 5321.4,
#   "timestamp": "2026-10-18T08:00:00.000Z"
# }`;

const errorExample = `{
  "error": {
    "type": "all_providers_failed",
    "message": "All 1 provider attempt(s) failed",
    "request_id": "req_3f9c2a1b7d4e8f60",
    "retry_after": 30,
    "attempts": [
      { "provider": "Groq", "provider_type": "groq", "model": "llama-3.1-8b-instant",
        "status": "skipped", "latency_ms": 0, "key": "gsk_…DyMg", "error": "rate limited (cooling down)" }
    ]
  }
}`;

const noKeysExample = `{
  "error": {
    "type": "no_provider_keys",
    "message": "no_provider_keys: add your own provider key in the dashboard (Your keys → Add a key), then retry. DevAI never uses shared keys for your requests.",
    "request_id": "req_3f9c2a1b7d4e8f60"
  }
}`;

const byokFlow = `# 1. Sign in → Dashboard → Your keys → "Add your first provider key"
#    (OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral; stored encrypted)
# 2. Same page → "New key" → copy your dvai_ key (shown once)
# 3. Call the gateway; it routes only over the keys you added:
curl ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $DEVAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "auto", "messages": [{ "role": "user", "content": "hi" }] }'

# Check your keys without spending tokens (Clerk session token, as the dashboard does):
#   POST /user/pool/health           → every key
#   POST /user/pool/keys/:id/test    → one key`;

const adminCurl = `# With the gateway's ADMIN_API_KEY (server-side only, never in a browser)
curl ${BASE}/admin/me -H "Authorization: Bearer $DEVAI_ADMIN_KEY"
# { "data": { "method": "admin_key" } }

# With a Clerk session token of an allowlisted user (what the dashboard sends)
# { "data": { "method": "clerk", "userId": "user_…", "email": "you@example.com" } }

# Create a project, then an app key for it
curl -X POST ${BASE}/admin/projects \\
  -H "Authorization: Bearer $DEVAI_ADMIN_KEY" -H "Content-Type: application/json" \\
  -d '{ "name": "My app", "description": "Chat feature" }'

curl -X POST ${BASE}/admin/api-keys/project/PROJECT_ID \\
  -H "Authorization: Bearer $DEVAI_ADMIN_KEY" -H "Content-Type: application/json" \\
  -d '{ "name": "production" }'
# → data.key is the full dvai_ key. It is returned only once.`;

// ---------- small building blocks ----------
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 mt-16 first:mt-0 border-t pt-10 text-2xl sm:text-3xl font-bold tracking-tight">
      <a href={`#${id}`} className="hover:text-primary transition-colors">{children}</a>
    </h2>
  );
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="scroll-mt-24 mt-10 text-lg font-semibold">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground">{children}</code>;
}

function Endpoint({ method, path, auth }: { method: string; path: string; auth?: string }) {
  // Monochrome + orange: POST (the main call) in the accent, the rest neutral; DELETE in red.
  const color = method === 'POST' ? 'bg-primary/10 text-primary border-primary/30'
    : method === 'DELETE' ? 'bg-red-500/10 text-bad border-red-500/30'
    : 'bg-muted text-foreground border-border';
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <span className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${color}`}>{method}</span>
      <code className="font-mono text-sm break-all">{path}</code>
      {auth && <span className="ml-auto text-xs text-muted-foreground">{auth}</span>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((cell, j) => <td key={j} className={`px-4 py-3 ${j === 0 ? 'whitespace-nowrap font-mono text-[13px] text-foreground' : 'text-muted-foreground'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader wide active="/docs" badge={
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-0.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> API reference
        </span>
      } />

      {/* Hero */}
      <section className="relative overflow-hidden border-b px-5 sm:px-8 py-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-12rem] h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-primary/10 dark:bg-primary/20 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Documentation</p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight">DevAI Gateway API</h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            One OpenAI-compatible endpoint that runs on your own provider keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral), with automatic failover, parallel routing, key rotation and usage tracking.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs sm:text-sm">
            <span className="rounded-md border bg-card px-2.5 py-1 text-muted-foreground">Base URL</span>
            <code className="rounded-md border bg-code px-2.5 py-1 text-code-foreground break-all">{BASE}/v1</code>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          {/* Sidebar TOC (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto py-10 pr-2">
              <DocsToc items={toc} />
            </div>
          </aside>

          <main className="min-w-0 py-10 pb-24">
            {/* TOC (mobile) */}
            <details className="lg:hidden mb-8 rounded-xl border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">On this page</summary>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {toc.map(i => (
                  <li key={i.id}><a href={`#${i.id}`} className={`text-muted-foreground hover:text-foreground ${i.sub ? 'pl-3' : ''}`}>{i.label}</a></li>
                ))}
              </ul>
            </details>

            <div className="max-w-3xl">
              <H2 id="overview">Overview</H2>
              <P>
                DevAI speaks the OpenAI Chat Completions format, so any OpenAI client works by changing the base URL and the API key. It is <strong className="text-foreground">bring-your-own-key</strong>: requests run only on provider keys you add yourself. Behind that one endpoint the gateway picks one of your providers and keys, retries on the next key or provider when one fails, and records tokens and latency for the dashboard.
              </P>
              <Table
                head={['Endpoint', 'Auth', 'Purpose']}
                rows={[
                  ['POST /v1/chat/completions', 'dvai_ key', 'Chat completion on your own provider keys, JSON or streaming (SSE)'],
                  ['GET /v1/models', 'dvai_ key', 'Models of the providers your key routes over'],
                  ['GET /v1/usage', 'dvai_ key', 'Usage summary for the calling key’s project'],
                  ['GET /v1/health', 'none', 'Gateway, database and Redis health (no provider needed)'],
                  ['/user/*', 'Clerk session', 'Your provider keys, key health, dvai_ keys and hackathon kits'],
                  ['/admin/*', 'admin', 'Providers, keys, projects, analytics (used by the dashboard)'],
                ]}
              />
              <Note>
                All requests and responses are JSON. Every response carries an <C>X-Request-ID</C> header (e.g. <C>req_3f9c2a1b7d4e8f60</C>); include it when reporting a problem. The gateway runs on a free hosting tier, so the first request after a quiet period can take longer while it wakes up.
              </Note>

              <H2 id="byok">Bring your own key</H2>
              <P>
                DevAI has no provider keys of its own to lend. Every signed-in user adds their own provider keys under <a href="/dashboard/pool" className="text-primary hover:underline">Dashboard → Your keys</a>, creates a DevAI API key there, and calls the gateway with it. The gateway routes that key&apos;s requests <strong className="text-foreground">only</strong> over the keys its owner added. Provider usage is billed by each provider to you, and free tiers (Gemini, Groq, OpenRouter <C>:free</C> models) work too.
              </P>
              <CodeBlock title="Getting started" code={byokFlow} />
              <P>
                With no provider key (or every key disabled), chat requests fail fast with <C>400 no_provider_keys</C>: the gateway never falls back to anyone else&apos;s keys. If you ask for a model none of your keys serves, you get <C>400 no_provider_for_model</C>; use <C>{'"model": "auto"'}</C>, pick a provider with <C>devai.providers</C>, or add a key for that provider.
              </P>
              <CodeBlock title="400 Bad Request" lang="json" code={noKeysExample} />
              <Table
                head={['Provider', 'id when adding a key', 'Default model for "auto"']}
                rows={[
                  ['OpenAI', 'openai', 'gpt-4o-mini'],
                  ['Anthropic', 'anthropic', 'claude-3-5-haiku-20241022'],
                  ['Google Gemini', 'gemini', 'gemini-2.5-flash'],
                  ['Groq', 'groq', 'llama-3.1-8b-instant'],
                  ['OpenRouter', 'openrouter', 'openrouter/auto (any model id)'],
                  ['Mistral', 'mistral', 'mistral-small-latest (any model id)'],
                ]}
              />
              <Note>
                You can set your own default model per provider when you add a key. The gateway admin can still run shared providers (Dashboard → Shared providers) for the admin&apos;s own projects; those keys never serve other users&apos; requests.
              </Note>

              <H2 id="authentication">Authentication</H2>
              <P>
                Every <C>/v1</C> endpoint except <C>/v1/health</C> needs a DevAI API key in the <C>Authorization</C> header. Create one under Dashboard → Your keys; keys start with <C>dvai_</C> and are shown in full only once.
              </P>
              <CodeBlock title="Header" code={'Authorization: Bearer dvai_your_key'} />
              <P>
                A missing header, an unknown or revoked key, or an inactive project returns <C>401</C> with <C>error.type</C> = <C>authentication_error</C>. Keep the key on your server: browser requests are only accepted from origins on the gateway&apos;s CORS allowlist.
              </P>

              <H2 id="chat-completions">Chat completions</H2>
              <Endpoint method="POST" path="/v1/chat/completions" auth="Bearer dvai_…" />
              <P>Creates a model response for a conversation. With <C>{'"stream": true'}</C> the answer is sent as Server-Sent Events (see <a href="#streaming" className="text-primary hover:underline">Streaming</a>).</P>
              <CodeGroup items={[
                { label: 'curl', code: chatCurl },
                { label: 'JavaScript (OpenAI SDK)', code: chatSdk },
                { label: 'JavaScript (fetch)', code: chatJs },
                { label: 'Python (OpenAI SDK)', code: chatPy },
                { label: 'Python (requests)', code: chatPyRequests },
              ]} />

              <H3 id="request-body">Request body</H3>
              <Table
                head={['Field', 'Type', 'Description']}
                rows={[
                  ['messages', 'array, required', <>List of <C>{'{ role, content }'}</C>. <C>role</C> is <C>system</C>, <C>user</C> or <C>assistant</C>; <C>content</C> is a string.</>],
                  ['model', 'string', <>Model id, e.g. <C>gpt-4o-mini</C> or <C>llama-3.1-8b-instant</C>. Defaults to <C>auto</C>: any of your providers, each using its default model.</>],
                  ['temperature', 'number', 'Sampling temperature, passed to the provider.'],
                  ['max_tokens', 'number', 'Maximum tokens to generate.'],
                  ['top_p', 'number', 'Nucleus sampling, passed to the provider.'],
                  ['stop', 'string | string[]', 'Stop sequence(s).'],
                  ['stream', 'boolean', 'Stream the answer as SSE.'],
                  ['stream_options.include_usage', 'boolean', 'With streaming: send a final chunk with token usage.'],
                  ['user', 'string', 'Your end-user id (optional).'],
                  ['devai', 'object', <>DevAI routing overrides for this request; never forwarded to providers. See <a href="#routing" className="text-primary hover:underline">Routing</a>.</>],
                ]}
              />
              <H3>The <C>devai</C> object</H3>
              <Table
                head={['Field', 'Type', 'Description']}
                rows={[
                  ['mode', <>single | fastest | best</>, 'Routing mode (default single).'],
                  ['providers', 'array (max 10)', <>Providers to use, in priority order. Each entry is a provider id, name or type (<C>google</C>, <C>openai</C>, <C>anthropic</C>, <C>groq</C>, <C>ollama</C>), optionally with a model: <C>{'"openai:gpt-4o-mini"'}</C> or <C>{'{ "provider": "groq", "model": "llama-3.1-8b-instant" }'}</C>.</>],
                  ['judge', 'string | object', <>Model that picks the winner in <C>best</C> mode, same format as a provider entry.</>],
                  ['timeoutMs', 'integer 1000–120000', 'Per-provider call timeout. Default 30000.'],
                  ['keyStrategy', <>failover | round_robin | random | least_used</>, <>How a provider&apos;s keys are used. See <a href="#key-strategies" className="text-primary hover:underline">Multi-key strategies</a>.</>],
                ]}
              />
              <P>An invalid body returns <C>400</C> <C>invalid_request</C> with per-field <C>details</C>.</P>

              <H3 id="response">Response</H3>
              <P>
                The standard OpenAI <C>chat.completion</C> object, plus a <C>devai</C> object describing how the request was routed: the mode, the provider, model and masked key that answered, how many providers (<C>fallbacks</C>) and keys (<C>key_fallbacks</C>) were tried first, and one entry per provider call in <C>candidates</C>. In <C>best</C> mode it also has a <C>judge</C> object (<C>method</C>, <C>reason</C>, <C>provider</C>, <C>model</C>, <C>latency_ms</C>). Keys are always masked to a prefix and the last four characters.
              </P>
              <CodeBlock title="200 OK" lang="json" code={responseExample} />

              <H2 id="streaming">Streaming (SSE)</H2>
              <P>
                Set <C>{'"stream": true'}</C> to receive OpenAI-compatible Server-Sent Events: a series of <C>chat.completion.chunk</C> objects, a final chunk with <C>finish_reason</C>, and <C>data: [DONE]</C>. With <C>{'"stream_options": { "include_usage": true }'}</C> a usage chunk (empty <C>choices</C>) is sent before <C>[DONE]</C>.
              </P>
              <CodeGroup items={[
                { label: 'curl', code: streamCurl },
                { label: 'JavaScript (OpenAI SDK)', code: streamJs },
                { label: 'Python (OpenAI SDK)', code: streamPy },
              ]} />
              <CodeBlock title="What arrives on the wire" lang="text" code={streamWire} />
              <Note>
                Failover finishes before the first byte is sent, so a request where every provider fails still gets a normal JSON error with an HTTP status. If a provider breaks after streaming has started, the gateway sends an event <C>{'{"error":{"type":"stream_error",…}}'}</C> followed by a final chunk with <C>{'finish_reason: "error"'}</C> and <C>[DONE]</C>. In <C>fastest</C> mode the first provider to produce text streams and the others are cancelled.
              </Note>

              <H2 id="routing">Routing modes</H2>
              <Table
                head={['Mode', 'Behaviour']}
                rows={[
                  ['single', 'Default. One provider at a time in priority order. On failure the next key of the same provider is tried, then the next provider.'],
                  ['fastest', 'Sends the request to several providers in parallel (up to 5). The first valid answer wins; slower calls are aborted.'],
                  ['best', 'Collects every answer, then a judge model picks the most accurate and complete one. The decision is returned in devai.judge.'],
                ]}
              />
              <P>
                Precedence: the request body <C>devai</C> field, then the <C>x-devai-mode</C> header, then the project&apos;s routing defaults (set in the dashboard), then <C>single</C>. With <C>{'model: "auto"'}</C> and no provider list, every provider you have a key for takes part, ordered by its configured priority and then recent latency.
              </P>
              <CodeGroup items={[
                { label: 'curl', code: routingCurl },
                { label: 'JavaScript (OpenAI SDK)', code: routingJs },
                { label: 'Python (OpenAI SDK)', code: routingPy },
              ]} />

              <H2 id="key-strategies">Multi-key strategies</H2>
              <P>
                A provider can hold several API keys. The key strategy only changes the order keys are tried in: a failing key always falls through to the next key of the same provider before DevAI moves to another provider, and keys that are cooling down are skipped.
              </P>
              <Table
                head={['Strategy', 'Order']}
                rows={[
                  ['failover', 'Keys in priority order (oldest first); the first healthy key is used.'],
                  ['round_robin', 'Default for your keys. Rotates the starting key on every request to spread load evenly.'],
                  ['random', 'Shuffles the healthy keys for each request.'],
                  ['least_used', 'Key with the fewest recent requests first.'],
                ]}
              />
              <P>
                Set it in the dashboard (Your keys → Rotation), or override per request with <C>devai.keyStrategy</C> in the body or the <C>x-devai-key-strategy</C> header. The body takes precedence over the header, the header over the project default, and that over the provider setting.
              </P>
              <CodeBlock title="Per-request override" lang="json" code={keysExample} />

              <H2 id="headers">Headers</H2>
              <H3>Request headers</H3>
              <Table
                head={['Header', 'Description']}
                rows={[
                  ['Authorization', <>Required: <C>Bearer dvai_…</C> (or the admin credential on <C>/admin</C>).</>],
                  ['Content-Type', <><C>application/json</C> for POST requests.</>],
                  ['x-devai-mode', <><C>single</C>, <C>fastest</C> or <C>best</C>. Unknown values are ignored.</>],
                  ['x-devai-key-strategy', <><C>failover</C>, <C>round_robin</C>, <C>random</C> or <C>least_used</C>. Unknown values are ignored.</>],
                ]}
              />
              <H3>Response headers (chat completions)</H3>
              <Table
                head={['Header', 'Description']}
                rows={[
                  ['X-Request-ID', 'Unique id of this request (on every response).'],
                  ['x-devai-mode', 'Routing mode that was used.'],
                  ['x-devai-provider', <>Provider and model that answered, e.g. <C>OpenAI/gpt-4o-mini</C>.</>],
                  ['x-devai-fallbacks', 'How many providers failed before this one answered.'],
                  ['x-devai-key', <>Name and masked hint of the key that answered, e.g. <C>{'Key 2 (sk-p...DyMg)'}</C>.</>],
                  ['x-devai-key-fallbacks', 'How many keys of the provider failed before this one.'],
                  ['X-Cache', <><C>HIT</C> or <C>MISS</C> for cacheable requests (see Caching).</>],
                ]}
              />
              <P>Browsers on allowlisted origins can read all of these headers (they are exposed via CORS).</P>

              <H2 id="caching">Caching</H2>
              <P>
                Plain requests on the admin&apos;s own projects (mode <C>single</C> and no <C>devai</C> field) are cached in Redis for one hour. Requests on your own keys are never served from, or written to, the shared cache; an identical request is answered from the cache with <C>X-Cache: HIT</C>. Identical requests that arrive at the same time share a single upstream call. To skip the cache, send any <C>devai</C> field or use a parallel mode. Streaming requests are cached when they finish normally.
              </P>

              <H2 id="models">Models</H2>
              <Endpoint method="GET" path="/v1/models" auth="Bearer dvai_…" />
              <P>Lists the models your key can use, in the OpenAI list format: each of your providers&apos; default model plus any models registered for them. The list is empty until you add a provider key.</P>
              <CodeBlock title="curl" code={modelsCurl} />

              <H2 id="usage">Usage</H2>
              <Endpoint method="GET" path="/v1/usage?period=today|week|month" auth="Bearer dvai_…" />
              <P>Token and request totals for the project that owns the key. <C>period</C> defaults to <C>today</C>; <C>cacheHitRate</C> is a percentage.</P>
              <CodeBlock title="curl" code={usageCurl} />

              <H2 id="health">Health</H2>
              <Endpoint method="GET" path="/v1/health" auth="public" />
              <P>
                No authentication, and no provider is needed: it reports the gateway, database and Redis. <C>status</C> is <C>unhealthy</C> when the database is down and <C>degraded</C> when Redis is down. Provider keys belong to users, so they never change this status; <C>providers</C> lists only the admin&apos;s shared providers from the last background check (key counts only) and is usually empty. Check your own keys in the dashboard or with <C>POST /user/pool/health</C>.
              </P>
              <CodeBlock title="curl" code={healthCurl} />

              <H2 id="key-pool">Your provider keys</H2>
              <P>
                Signed-in users add their own provider keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral) under <a href="/dashboard/pool" className="text-primary hover:underline">Dashboard → Your keys</a>. A DevAI API key (<C>dvai_…</C>, created on that page) is routed <strong className="text-foreground">only</strong> over that user&apos;s keys, with their rotation strategy. A key that is rate-limited cools down and the next key answers. This traffic is never cached and never uses shared keys.
              </P>
              <Table
                head={['Plan', 'Provider keys']}
                rows={[['Free', '2'], ['Student', '10'], ['Pro', 'Unlimited'], ['Team', 'Unlimited']]}
              />
              <P>
                The pool is managed with the user&apos;s Clerk session token (<C>Authorization: Bearer &lt;session JWT&gt;</C>); admin keys and project keys are not accepted. Adding a key beyond the plan limit returns <C>403 plan_limit_reached</C>. With no enabled key, chat requests return <C>400 no_provider_keys</C>.
              </P>
              <Table
                head={['Endpoint', 'Description']}
                rows={[
                  ['GET /user/pool', <>Plan, limit, key strategy, keys (masked, with <C>health</C>: healthy, unused, cooling_down, quota_exhausted, error, disabled, and <C>lastCheck</C>), <C>onboarding</C> (<C>nextStep</C>: add_provider_key, create_api_key or done) and 30-day stats: <C>served</C>, <C>tokens</C>, <C>rateLimitsAbsorbed</C>, <C>stretchFactor</C>.</>],
                  ['POST /user/pool/keys', <>Add a key: <C>provider</C> (openai, anthropic, gemini, groq, openrouter, mistral), <C>apiKey</C>, optional <C>name</C>, <C>defaultModel</C>, <C>quotaLimit</C>. Stored encrypted.</>],
                  ['POST /user/pool/health', <>Test every enabled key with a cheap authenticated call (no tokens). Returns <C>status</C> (healthy, degraded, unhealthy, no_keys), <C>healthy</C>, <C>total</C> and one entry per key. A key that fails is skipped by routing for 5 minutes.</>],
                  ['POST /user/pool/keys/:id/test', 'Test one of your keys the same way.'],
                  ['PATCH /user/pool/keys/:id', <>Update <C>enabled</C> or <C>name</C>.</>],
                  ['DELETE /user/pool/keys/:id', 'Remove a key from the pool.'],
                  ['PUT /user/pool/strategy', <><C>{'{ "keyStrategy": "round_robin" | "least_used" | "failover" | "random" }'}</C></>],
                  ['POST /user/pool/api-keys', <>Create your <C>dvai_</C> key (shown once). <C>DELETE /user/pool/api-keys/:id</C> revokes it.</>],
                ]}
              />
              <Note>
                <C>stretchFactor</C> = answers served by all your keys ÷ answers served by your busiest single key. 3× means your keys served three times what one free key managed on its own.
              </Note>

              <H2 id="kits">Hackathon kits</H2>
              <P>
                Team plan users can create kits under <a href="/dashboard/kits" className="text-primary hover:underline">Dashboard → Hackathon kits</a>. A kit is a set of temporary <C>dvai_</C> keys for a team, with a request cap and/or token cap, an end time (up to 30 days), an optional max team size and an optional allowed-model list. Kit traffic runs on the owner&apos;s own provider keys, and the keys are used like any other API key. With an allowed-model list, <C>&quot;model&quot;: &quot;auto&quot;</C> uses the first allowed model.
              </P>
              <P>
                Every kit has a public page at <C>/kit/&lt;shareToken&gt;</C> that shows the quota left and the end time. Its data comes from <C>GET /public/kits/:shareToken</C> (no auth, never includes keys). Caps are counted in Redis across all of the kit&apos;s keys. Tokens are added when a response finishes, so the last request before a token cap can go slightly over it.
              </P>
              <Table
                head={['Status', 'error.type', 'When']}
                rows={[
                  ['400', 'kit_model_not_allowed', 'The requested model is not on the kit’s allowed list (the message lists the allowed models).'],
                  ['403', 'kit_revoked', 'The owner revoked the kit.'],
                  ['403', 'kit_expired', 'The kit’s end time has passed.'],
                  ['429', 'kit_request_cap_reached', 'The kit has used all of its requests.'],
                  ['429', 'kit_token_cap_reached', 'The kit has used its token cap.'],
                ]}
              />
              <Table
                head={['Endpoint (Clerk session)', 'Description']}
                rows={[
                  ['GET /user/kits', <>Your kits with <C>status</C> (active, expired, revoked) and <C>usage</C> (<C>requests</C>, <C>tokens</C>, <C>requestsRemaining</C>, <C>tokensRemaining</C>).</>],
                  ['POST /user/kits', <><C>name</C>, <C>expiresAt</C> (ISO 8601), <C>requestCap</C> and/or <C>tokenCap</C>, optional <C>maxTeamSize</C>, <C>keyCount</C> (1–50, ≤ team size), <C>allowedModels</C>. Returns the keys once. Requires Team (<C>403 plan_required</C> otherwise).</>],
                  ['POST /user/kits/:id/revoke', 'Revoke a kit; its keys stop working immediately.'],
                ]}
              />

              <H2 id="errors">Errors</H2>
              <P>Errors use one shape: an <C>error</C> object with <C>type</C>, <C>message</C> and, on <C>/v1</C> routes, <C>request_id</C>.</P>
              <Table
                head={['Status', 'error.type', 'When']}
                rows={[
                  ['400', 'invalid_request', <>Body is not JSON or fails validation (<C>details</C> lists the fields).</>],
                  ['400', 'no_provider_keys', <>You have not added a provider key yet (or all are disabled). Add one under Your keys. Shared keys are never used instead.</>],
                  ['400', 'no_provider_for_model', <>None of your provider keys serves the requested model. Use <C>auto</C>, <C>devai.providers</C>, or add a key for that provider.</>],
                  ['400', 'no_eligible_providers', <>None of the providers in <C>devai.providers</C> are among yours.</>],
                  ['400', 'validation_error', 'Admin API: a required field is missing or invalid.'],
                  ['401', 'authentication_error', 'Missing/invalid Authorization header, unknown or revoked key, inactive project, invalid admin key or expired session.'],
                  ['403', 'permission_error', 'Admin API: valid Clerk session, but the user is not on the admin allowlist.'],
                  ['404', 'not_found', 'Unknown route, or an admin resource that does not exist.'],
                  ['409', 'conflict', 'Admin API: the model already exists for this provider.'],
                  ['500', 'server_error', 'Unexpected gateway error.'],
                  ['502', 'all_providers_failed', <>Every provider and key failed or was skipped. Includes <C>retry_after</C> (seconds) and one <C>attempts</C> entry per call.</>],
                  ['400', 'kit_model_not_allowed', <>Hackathon kit: model not allowed (see <a href="#kits" className="text-primary hover:underline">kits</a>).</>],
                  ['403', 'kit_revoked / kit_expired', 'Hackathon kit was revoked or has ended.'],
                  ['403', 'plan_limit_reached / plan_required', 'Key pool: plan key limit reached. Kits: Team plan required.'],
                  ['429', 'kit_request_cap_reached / kit_token_cap_reached', 'Hackathon kit used its cap.'],
                ]}
              />
              <CodeBlock title="502 Bad Gateway" lang="json" code={errorExample} />

              <H2 id="rate-limits">Rate limits &amp; quotas</H2>
              <P>
                The gateway does not add its own per-project request limit; the limits that apply are your providers&apos; limits. DevAI tracks them per key and routes around keys that hit them:
              </P>
              <Table
                head={['Provider response', 'What DevAI does']}
                rows={[
                  ['429 rate limit', <>Key cools down for 30 s (or the provider&apos;s <C>Retry-After</C>, 5 s – 1 h); next key is tried.</>],
                  ['429 / 402 quota or billing', 'Key cools down for 10 minutes (or the provider hint); next key is tried.'],
                  ['401 / 403 invalid key', 'Key cools down for 5 minutes; next key is tried.'],
                  ['5xx, timeout, network', 'That key + model cools down for 60 s; next key is tried.'],
                  ['Other 4xx', 'Returned as a failure without trying other keys (they would fail the same way).'],
                ]}
              />
              <P>
                Each provider key can also have a token quota (set when the key is added). A key over its quota is skipped until the quota resets (every 30 days). Google per-model quotas only cool down that key + model, so other models on the same key keep working. When nothing is left to try you get <C>502 all_providers_failed</C> with <C>retry_after</C>.
              </P>

              <H2 id="admin">Admin API</H2>
              <P>
                The admin part of the dashboard (shared providers, projects, analytics) uses <C>/admin/*</C>. Regular users never need it: their keys live under <C>/user/*</C>. These endpoints accept <strong className="text-foreground">either</strong> the gateway&apos;s <C>ADMIN_API_KEY</C> <strong className="text-foreground">or</strong> a Clerk session token of a user on the gateway&apos;s admin allowlist (<C>ADMIN_EMAILS</C> / <C>ADMIN_USER_IDS</C>), as <C>Authorization: Bearer …</C>. A Clerk user who is not on the list gets <C>403</C>. Project keys (<C>dvai_…</C>) do not work here. Responses wrap results in <C>data</C>.
              </P>
              <CodeBlock title="curl" code={adminCurl} />
              <Table
                head={['Endpoint', 'Description']}
                rows={[
                  ['GET /admin/me', <>Who is calling: <C>{'{ method: "admin_key" }'}</C> or <C>{'{ method: "clerk", userId, email }'}</C>.</>],
                  ['GET /admin/providers', 'List providers with key strategy, key count and model count.'],
                  ['POST /admin/providers', <>Add a provider: <C>type</C> (openai, anthropic, google, groq, ollama), <C>name</C>, optional <C>baseUrl</C>, <C>config</C>.</>],
                  ['PATCH /admin/providers/:id', <>Update <C>name</C>, <C>baseUrl</C>, <C>status</C> or <C>config</C> (<C>keyStrategy</C>, <C>keyOrder</C>, <C>priority</C>; merged with the existing config).</>],
                  ['DELETE /admin/providers/:id', 'Delete a provider.'],
                  ['POST /admin/providers/:id/test', 'Test the provider connection.'],
                  ['GET /admin/providers/:id/models', 'List the provider’s models.'],
                  ['POST /admin/providers/:id/models', <>Add a model (<C>modelId</C> required).</>],
                  ['DELETE /admin/providers/:id/models/:modelId', 'Remove a model.'],
                  ['POST /admin/providers/:id/sync-models', 'Fetch the model list from the provider.'],
                  ['GET /admin/credentials/provider/:providerId', 'List a provider’s keys (masked).'],
                  ['POST /admin/credentials/provider/:providerId', <>Add a key: <C>name</C>, <C>apiKey</C>, optional <C>quotaLimit</C>. Stored encrypted (AES-256-GCM).</>],
                  ['PATCH /admin/credentials/:id', <>Update <C>name</C>, <C>enabled</C> or <C>status</C>.</>],
                  ['DELETE /admin/credentials/:id', 'Delete a key.'],
                  ['POST /admin/credentials/:id/test', 'Test one key and update its status (clears its rate-limit cooldown).'],
                  ['GET /admin/projects', 'List projects.'],
                  ['POST /admin/projects', <>Create a project: <C>name</C>, optional <C>description</C>.</>],
                  ['PATCH /admin/projects/:id', <>Update <C>name</C>, <C>description</C>, <C>status</C> or <C>routing</C> (same fields as the <C>devai</C> object).</>],
                  ['DELETE /admin/projects/:id', 'Delete a project.'],
                  ['GET /admin/api-keys/project/:projectId', 'List a project’s keys (prefix only).'],
                  ['POST /admin/api-keys/project/:projectId', <>Create a <C>dvai_</C> key (<C>name</C> required). The full key is returned only in this response.</>],
                  ['DELETE /admin/api-keys/:id', 'Revoke a key.'],
                  ['GET /admin/analytics/overview', <>Totals for <C>?period=today|week|month</C>.</>],
                  ['GET /admin/analytics/by-provider', 'Usage per provider (same period parameter).'],
                  ['GET /admin/analytics/by-model', 'Usage per model.'],
                  ['GET /admin/analytics/by-project', 'Usage per project.'],
                  ['GET /admin/analytics/recent-requests', <>Latest requests (<C>?limit=</C>, default 50).</>],
                  ['GET /admin/audit-logs', 'Audit log of admin changes.'],
                ]}
              />
              <Note>
                Never put the admin key in browser code. In the hosted dashboard you sign in with Clerk and the dashboard sends your session token automatically.
              </Note>

              <div className="mt-16 rounded-2xl border bg-gradient-to-br from-primary/20 via-card to-card p-8 text-center">
                <h2 className="text-2xl font-bold tracking-tight">Ready to make a request?</h2>
                <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Sign in, add your first provider key, create your dvai_ key, and call the endpoint.</p>
                <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
                  <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
                    Open dashboard <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-5 py-3 text-sm font-semibold hover:bg-muted">
                    <Github className="h-4 w-4" /> Source on GitHub
                  </a>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <SiteFooter wide />
    </div>
  );
}
