import Link from 'next/link';
import {
  ArrowRight, Github, ShieldCheck, Zap, GitBranch, Gauge, Database, KeyRound, BarChart3, FolderKey, Radio, Check,
} from 'lucide-react';
import { CodeTabs } from '@/components/landing/code-tabs';
import { clerkEnabled, SIGN_IN_URL } from '@/lib/clerk';

const ENDPOINT = 'https://devai-gateway.onrender.com/v1/chat/completions';
const GITHUB = 'https://github.com/ayush8620/DevAI';

const providers = ['Google Gemini', 'OpenAI', 'Anthropic', 'Groq', 'Ollama Cloud'];

const features = [
  {
    icon: ShieldCheck,
    title: 'Failover + circuit breaker',
    body: 'If a provider errors, times out or rate-limits, DevAI retries the same request on the next one. Failing targets are skipped for a cooldown so users never wait on a dead endpoint.',
  },
  {
    icon: KeyRound,
    title: 'Many keys per provider',
    body: 'Add several API keys to one provider. A rate-limited or invalid key is cooled down on its own and the request moves to the next key. Choose failover, round robin, random or least used.',
  },
  {
    icon: Zap,
    title: 'Fastest & best parallel modes',
    body: 'fastest sends the prompt to several providers at once and returns the first good answer. best waits for all of them and lets a judge model pick the strongest one.',
  },
  {
    icon: Database,
    title: 'Response caching',
    body: 'Identical requests are answered from a Redis cache, and identical in-flight requests share one upstream call, saving tokens and latency.',
  },
  {
    icon: Gauge,
    title: 'Rate limits & quotas',
    body: 'Per-key token quotas and rate-limit cooldowns keep you inside each provider’s limits and route around keys that are out of budget.',
  },
  {
    icon: FolderKey,
    title: 'Encrypted provider keys',
    body: 'Provider API keys are stored with AES-256-GCM and never returned in full; the dashboard only shows the prefix and last four characters.',
  },
  {
    icon: BarChart3,
    title: 'Usage analytics',
    body: 'Every call is recorded with provider, model, tokens, latency, status and cache hits, broken down by provider, model and app.',
  },
  {
    icon: GitBranch,
    title: 'Per-app keys & routing',
    body: 'Each app gets its own dvai_ key and can have its own routing defaults: mode, provider priority, judge model and timeout.',
  },
  {
    icon: Radio,
    title: 'Streaming',
    body: 'Set stream: true for OpenAI-compatible Server-Sent Events. Failover happens before the first byte, and usage is logged when the stream ends.',
  },
];

const plans = [
  { name: 'Free', who: 'For trying DevAI and side projects.' },
  { name: 'Student', who: 'For students learning to build with AI.' },
  { name: 'Pro', who: 'For individual developers shipping apps.', highlight: true },
  { name: 'Team', who: 'For teams sharing providers, keys and analytics.' },
];

const included = ['All providers and routing modes', 'Multi-key failover', 'Streaming and caching', 'Usage analytics dashboard'];

const curl = `curl ${ENDPOINT} \\
  -H "Authorization: Bearer dvai_your_app_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{ "role": "user", "content": "Explain binary search in one line" }],
    "max_tokens": 200
  }'`;

const sdk = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://devai-gateway.onrender.com/v1",
  apiKey: process.env.DEVAI_KEY, // your dvai_ app key
});

const res = await client.chat.completions.create({
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "Explain binary search in one line" }],
});

console.log(res.choices[0].message.content);`;

const stream = `curl -N ${ENDPOINT} \\
  -H "Authorization: Bearer dvai_your_app_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "gemini-2.5-flash", "stream": true,
        "messages": [{ "role": "user", "content": "Write a haiku about failover" }] }'

# data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
# data: [DONE]`;

const parallel = `curl ${ENDPOINT} \\
  -H "Authorization: Bearer dvai_your_app_key" \\
  -H "Content-Type: application/json" \\
  -H "x-devai-mode: fastest" \\
  -d '{ "model": "auto",
        "messages": [{ "role": "user", "content": "Summarise RAFT in 2 lines" }],
        "devai": { "keyStrategy": "round_robin" } }'

# Response headers tell you what happened:
# x-devai-provider: Gemini/gemini-2.5-flash
# x-devai-fallbacks: 0   x-devai-key-fallbacks: 1`;

function Section({ id, eyebrow, title, children, className = '' }: { id?: string; eyebrow: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 px-5 sm:px-8 py-16 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground text-sm">D</span>
            <span className="text-lg">DevAI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#code" className="hover:text-foreground transition-colors">Code</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          </nav>
          <div className="flex items-center gap-2">
            {clerkEnabled && (
              <Link href={SIGN_IN_URL} className="hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Sign in
              </Link>
            )}
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
              Open dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-5 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-[-10rem] h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] opacity-40" />
          </div>
          <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Open source · Free during beta
              </span>
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                One OpenAI-compatible endpoint for <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">many AI providers</span>
              </h1>
              <p className="mt-6 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
                Point your app at DevAI instead of a single provider. It routes each request across Gemini, OpenAI, Anthropic, Groq and Ollama, fails over automatically, can race providers in parallel, and shows you every token in one dashboard.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
                  Open dashboard <ArrowRight className="h-4 w-4" />
                </Link>
                <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-5 py-3 text-sm font-semibold hover:bg-muted">
                  <Github className="h-4 w-4" /> View on GitHub
                </a>
              </div>
              <div className="mt-10">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Works with</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {providers.map(p => (
                    <li key={p} className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">{p}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="min-w-0">
              <CodeTabs tabs={[{ id: 'hero-curl', label: 'curl', code: curl }, { id: 'hero-sdk', label: 'OpenAI SDK', code: sdk }]} />
              <p className="mt-3 text-xs text-muted-foreground font-mono break-all">POST {ENDPOINT}</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <Section id="features" eyebrow="Features" title="Everything between your app and the model" className="border-t bg-muted/20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary/50">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* How routing works */}
        <Section eyebrow="Routing" title="Pick how each request is routed">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { mode: 'single', label: 'Default', text: 'One provider at a time in priority order. On failure, the next key, then the next provider.' },
              { mode: 'fastest', label: 'Parallel', text: 'Ask several providers at once; the first valid answer wins and the rest are cancelled.' },
              { mode: 'best', label: 'Parallel + judge', text: 'Collect every answer, then a judge model picks the most accurate and complete one.' },
            ].map(m => (
              <div key={m.mode} className="rounded-xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">{m.mode}</code>
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                </div>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Set a default per app in the dashboard, or override per request with the <code className="font-mono text-foreground">x-devai-mode</code> header or a <code className="font-mono text-foreground">devai</code> field in the body.
          </p>
        </Section>

        {/* Code */}
        <Section id="code" eyebrow="Quick start" title="Change one URL. Keep your code." className="border-t bg-muted/20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <ol className="space-y-6">
              {[
                ['Add a provider', 'Open the dashboard, add Gemini, OpenAI, Anthropic, Groq or Ollama and paste one or more API keys.'],
                ['Create an app key', 'Create a project and generate its dvai_ key. Each app gets its own key and usage stats.'],
                ['Call the endpoint', 'Use any OpenAI client or plain HTTP with the DevAI base URL. Streaming works the same way.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-card text-sm font-semibold">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold">{t}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="min-w-0">
              <CodeTabs tabs={[
                { id: 'curl', label: 'curl', code: curl },
                { id: 'sdk', label: 'Node (OpenAI SDK)', code: sdk },
                { id: 'stream', label: 'Streaming', code: stream },
                { id: 'parallel', label: 'Parallel + keys', code: parallel },
              ]} />
            </div>
          </div>
        </Section>

        {/* Pricing */}
        <Section id="pricing" eyebrow="Pricing" title="Simple plans. Free while in beta.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map(p => (
              <div key={p.name} className={`relative flex flex-col rounded-xl border bg-card p-6 shadow-sm ${p.highlight ? 'ring-2 ring-primary border-primary' : ''}`}>
                {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">Popular</span>}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.who}</p>
                <p className="mt-6 text-2xl font-bold">Free during beta</p>
                <ul className="mt-6 space-y-2 text-sm flex-1">
                  {included.map(i => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{i}</li>
                  ))}
                </ul>
                <Link href="/dashboard" className={`mt-8 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium ${p.highlight ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border hover:bg-muted'}`}>
                  Get started
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">You bring your own provider API keys; provider usage is billed by each provider under your own account.</p>
        </Section>

        {/* CTA */}
        <section className="px-5 sm:px-8 pb-20 sm:pb-28">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/20 via-card to-card p-8 sm:p-12 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Stop wiring every provider by hand</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Add your keys once, give each app a dvai_ key, and let DevAI handle failover, parallel routing and usage tracking.</p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Open dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-5 py-3 text-sm font-semibold hover:bg-muted">
                <Github className="h-4 w-4" /> Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-5 sm:px-8 py-8">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>DevAI Gateway · Built by <a href="https://ayushyadav.dev" target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-primary">Ayush Yadav</a></p>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <Link href="/dashboard/api-docs" className="hover:text-foreground">API docs</Link>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground"><Github className="h-4 w-4" /> GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
