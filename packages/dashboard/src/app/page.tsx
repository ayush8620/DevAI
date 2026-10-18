import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Github, ShieldCheck, Zap, GitBranch, Gauge, Database, KeyRound, BarChart3, FolderKey, Radio, BookOpen, Layers, Trophy, Sparkles,
} from 'lucide-react';
import { CodeTabs } from '@/components/landing/code-tabs';
import { SIGN_IN_URL } from '@/lib/clerk';
import { SiteHeader, SiteFooter, GITHUB } from '@/components/landing/site-chrome';
import { PlanCards } from '@/components/billing/plan-cards';
import { paymentsEnabled } from '@/lib/billing/razorpay';
import { pageMetadata, jsonLd, SITE_URL, SITE_NAME, GITHUB_URL } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'DevAI: OpenAI-compatible AI API gateway and LLM router with your own keys',
  absoluteTitle: true,
  description: 'One OpenAI-compatible endpoint for OpenAI, Anthropic, Gemini, Groq, OpenRouter and Mistral. Bring your own key, get failover, key rotation and usage analytics. Rupee pricing, a student plan and hackathon API keys.',
  path: '/',
});

/** Short, factual FAQ. Rendered on the page and as FAQPage structured data. */
const FAQ: { q: string; a: string }[] = [
  { q: 'What is DevAI?', a: 'DevAI is an AI API gateway: one OpenAI-compatible endpoint that forwards your requests to OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral, with automatic failover, key rotation, streaming, caching and usage analytics.' },
  { q: 'Do I need my own provider API keys?', a: 'Yes. DevAI is bring-your-own-key: you add your own provider keys, they are encrypted, and your requests run only on them. Provider usage is billed by each provider to your own account; DevAI never uses anyone else’s quota for you.' },
  { q: 'Does it work with the OpenAI SDK?', a: 'Yes. Point any OpenAI client at the DevAI base URL, use a dvai_ key, and set the model to "auto" or any model your keys support. Chat completions and streaming work the same way.' },
  { q: 'How much does DevAI cost?', a: 'There is a Free plan. Paid plans are billed monthly in Indian rupees through Razorpay: Student ₹99, Pro ₹499 and Team ₹1,999. See the pricing page for limits.' },
  { q: 'Who can use the Student plan?', a: 'Students with a verified college email address (for example .edu or .ac.in). It adds more of your own keys, all key strategies, parallel routing and caching.' },
  { q: 'What are hackathon kits?', a: 'On the Team plan, an organiser can create temporary API keys for hackathon teams, with request and token caps, an expiry time and a share page. Kits run on the organiser’s own provider keys.' },
];

const ENDPOINT = 'https://devai-gateway.onrender.com/v1/chat/completions';

// Bring your own key: DevAI ships with no provider key of its own; users add theirs.
const providers = ['OpenAI', 'Anthropic', 'Google Gemini', 'Groq', 'OpenRouter', 'Mistral', 'Ollama Cloud'];

const features = [
  {
    icon: KeyRound,
    title: 'Bring your own key',
    body: 'DevAI has no provider keys of its own. You add your OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral keys, and your requests run only on them, billed by each provider to you.',
  },
  {
    icon: ShieldCheck,
    title: 'Failover + circuit breaker',
    body: 'If a provider errors, times out or rate-limits, DevAI retries the same request on the next one. Failing targets are skipped for a cooldown so users never wait on a dead endpoint.',
  },
  {
    icon: Layers,
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

const curl = `curl ${ENDPOINT} \\
  -H "Authorization: Bearer dvai_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{ "role": "user", "content": "Explain binary search in one line" }],
    "max_tokens": 200
  }'`;

const sdk = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://devai-gateway.onrender.com/v1",
  apiKey: process.env.DEVAI_KEY, // your dvai_ key (runs on your own provider keys)
});

const res = await client.chat.completions.create({
  model: "auto", // or any model your keys support, e.g. "gpt-4o-mini"
  messages: [{ role: "user", content: "Explain binary search in one line" }],
});

console.log(res.choices[0].message.content);`;

const stream = `curl -N ${ENDPOINT} \\
  -H "Authorization: Bearer dvai_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "llama-3.1-8b-instant", "stream": true,
        "messages": [{ "role": "user", "content": "Write a haiku about failover" }] }'

# data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
# data: [DONE]`;

const parallel = `curl ${ENDPOINT} \\
  -H "Authorization: Bearer dvai_your_key" \\
  -H "Content-Type: application/json" \\
  -H "x-devai-mode: fastest" \\
  -d '{ "model": "auto",
        "messages": [{ "role": "user", "content": "Summarise RAFT in 2 lines" }],
        "devai": { "keyStrategy": "round_robin" } }'

# Response headers tell you what happened:
# x-devai-provider: Groq/llama-3.1-8b-instant
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
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/brand/devai-mark-512.png`,
      sameAs: [GITHUB_URL],
      founder: { '@type': 'Person', name: 'Ayush Yadav', url: 'https://ayushyadav.dev' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: 'OpenAI-compatible AI API gateway and LLM router that runs on your own provider keys.',
      inLanguage: 'en-IN',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      <SiteHeader />

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
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Open source · Bring your own key · Free plan available
              </span>
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                One OpenAI-compatible endpoint for <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">many AI providers</span>
              </h1>
              <p className="mt-6 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
                Bring your own keys from OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral. DevAI routes each request over your keys only, fails over automatically, can race providers in parallel, and shows you every token in one dashboard.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
                  Open dashboard <ArrowRight className="h-4 w-4" />
                </Link>
                <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-5 py-3 text-sm font-semibold hover:bg-muted">
                  <Github className="h-4 w-4" /> View on GitHub
                </a>
                <Link href="/docs" className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-5 py-3 text-sm font-semibold hover:bg-muted">
                  <BookOpen className="h-4 w-4" /> API docs
                </Link>
              </div>
              <div className="mt-10">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Works with your keys from</p>
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

        {/* Unique features */}
        <Section id="unique" eyebrow="Only on DevAI" title="Built for students, hackers and free tiers" className="border-t">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: Layers, title: 'Bring your own keys, pooled', tag: 'Free: 2 keys · Student: 10 · Pro & Team: unlimited', href: '/dashboard/pool',
                body: 'Add your own keys from any provider, including free tiers like Gemini, Groq and OpenRouter. DevAI rotates across them, parks a key for a cooldown the moment it hits a 429 and carries on with the next, and shows how far your free quota was stretched. Your requests never touch anyone else’s keys.',
              },
              {
                icon: Trophy, title: 'Hackathon kits', tag: 'Included in Team', href: '/dashboard/kits',
                body: 'Give every team a temporary API key with a hard request or token cap, an end time and an allowed-model list. Share one link that shows the quota left and the deadline. The gateway cuts off at the cap, and you can revoke a kit at any time.',
              },
            ].map(f => (
              <Link key={f.title} href={f.href} className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 shadow-sm transition-colors hover:border-primary/60">
                <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background/60 px-2.5 py-0.5 text-[11px] font-semibold text-primary"><Sparkles className="h-3 w-3" />Unique</span>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary"><f.icon className="h-5 w-5" /></div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                <p className="mt-4 flex items-center justify-between gap-2 text-xs"><span className="font-medium text-foreground">{f.tag}</span><ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" /></p>
              </Link>
            ))}
          </div>
        </Section>

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
                ['Add your provider keys', 'Sign in, open Your keys and paste one or more keys from OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral. They are encrypted and used only for you.'],
                ['Create your DevAI key', 'Generate a dvai_ key. Requests with it run only on your keys; with no key added you get a clear no_provider_keys error, never someone else’s quota.'],
                ['Call the endpoint', 'Use any OpenAI client or plain HTTP with the DevAI base URL and model "auto" or any model your keys support. Streaming works the same way.'],
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
        <Section id="pricing" eyebrow="Pricing" title="Simple monthly plans in rupees">
          <PlanCards paymentsEnabled={paymentsEnabled()} signInUrl={SIGN_IN_URL} compact />
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
            <p>You bring your own provider API keys; provider usage is billed by each provider under your own account.</p>
            <Link href="/pricing" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Compare all features <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" eyebrow="FAQ" title="Frequently asked questions" className="border-t">
          <div className="mx-auto max-w-3xl divide-y rounded-2xl border bg-card">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group p-5 sm:p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base">{q}</h3>
                  <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
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

      <SiteFooter />
    </div>
  );
}
