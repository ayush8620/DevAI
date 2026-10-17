"use client";
import { useState } from 'react';
import { Copy, Check, Terminal, Shield, Cpu, RefreshCw, Radio, KeyRound } from 'lucide-react';
import { API_URL } from '@/lib/api';

export default function ApiDocsPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const curlExample = `curl -X POST ${API_URL}/v1/chat/completions \\
  -H "Authorization: Bearer dvai_your_project_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [
      { "role": "system", "content": "You are a senior developer." },
      { "role": "user", "content": "Explain binary search in TypeScript." }
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'`;

  const nodeExample = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${API_URL}/v1',
  apiKey: 'dvai_your_project_api_key',
});

const completion = await client.chat.completions.create({
  model: 'auto', // or 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.5-flash'
  messages: [{ role: 'user', content: 'Explain binary search' }],
});

console.log(completion.choices[0].message.content);`;

  const streamExample = `curl -N ${API_URL}/v1/chat/completions \\
  -H "Authorization: Bearer dvai_your_project_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gemini-2.5-flash","stream":true,
       "messages":[{"role":"user","content":"Write a haiku about failover"}]}'

# data: {"object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":"Keys"}}]}
# data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":" rotate..."}}]}
# data: [DONE]`;

  const keysExample = `// Per provider: Dashboard → Providers → Key strategy
// Per request (overrides the provider setting):
{
  "model": "gemini-2.5-flash",
  "messages": [{ "role": "user", "content": "hi" }],
  "devai": { "keyStrategy": "round_robin" }  // failover | round_robin | random | least_used
}
// or header:  x-devai-key-strategy: least_used
// Response headers: x-devai-key (key name + prefix/last 4), x-devai-key-fallbacks`;

  return (
    <div className="p-8 space-y-10 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">API Documentation</h1>
        <p className="text-muted-foreground mt-2">
          DevAI Gateway provides a unified, drop-in replacement for OpenAI-compatible client libraries.
        </p>
      </div>

      {/* Authentication */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Authentication</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          All client requests to <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">/v1/*</code> must include your project API key in the Authorization header.
        </p>
        <div className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-900 border border-border">
          <button
            onClick={() => copyToClipboard('Authorization: Bearer dvai_your_api_key', 'auth')}
            className="absolute right-3 top-3 p-1.5 text-zinc-400 hover:text-white rounded bg-zinc-800"
          >
            {copiedKey === 'auth' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <code>Authorization: Bearer dvai_your_api_key</code>
        </div>
      </section>

      {/* Drop-in OpenAI SDK */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">OpenAI SDK Compatibility</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          You only need to configure two environment variables in your applications. No code rewrites needed.
        </p>
        <div className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-900 border border-border">
          <button
            onClick={() => copyToClipboard(nodeExample, 'node')}
            className="absolute right-3 top-3 p-1.5 text-zinc-400 hover:text-white rounded bg-zinc-800"
          >
            {copiedKey === 'node' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <pre className="overflow-x-auto"><code>{nodeExample}</code></pre>
        </div>
      </section>

      {/* Chat Completions */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">POST /v1/chat/completions</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Route AI requests dynamically. When <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">model: &quot;auto&quot;</code> is used, the Gateway automatically picks the healthiest provider with remaining quota and lowest latency.
        </p>

        <div className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-900 border border-border">
          <button
            onClick={() => copyToClipboard(curlExample, 'curl')}
            className="absolute right-3 top-3 p-1.5 text-zinc-400 hover:text-white rounded bg-zinc-800"
          >
            {copiedKey === 'curl' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <pre className="overflow-x-auto"><code>{curlExample}</code></pre>
        </div>
      </section>

      {/* Streaming */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Streaming</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Send <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">&quot;stream&quot;: true</code> to get OpenAI-compatible Server-Sent Events. Failover happens before the first byte; usage is recorded when the stream ends.
        </p>
        <div className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-900 border border-border">
          <button
            onClick={() => copyToClipboard(streamExample, 'stream')}
            className="absolute right-3 top-3 p-1.5 text-zinc-400 hover:text-white rounded bg-zinc-800"
          >
            {copiedKey === 'stream' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <pre className="overflow-x-auto"><code>{streamExample}</code></pre>
        </div>
      </section>

      {/* Multiple keys */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Multiple API keys per provider</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          A key that is rate limited (30s), invalid (5 min), out of quota (10 min) or failing (60s) is cooled down on its own and the same request is retried with the provider&apos;s next key, before DevAI moves to another provider.
        </p>
        <div className="rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-900 border border-border">
          <pre className="overflow-x-auto"><code>{keysExample}</code></pre>
        </div>
      </section>

      {/* System Health */}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">GET /v1/health</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Public endpoint to verify Gateway uptime, Redis status, and provider health states.
        </p>
        <div className="rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 dark:bg-zinc-900 border border-border">
          <code>curl {API_URL}/v1/health</code>
        </div>
      </section>
    </div>
  );
}