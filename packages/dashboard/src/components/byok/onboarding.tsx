"use client";
import Link from 'next/link';
import { Check, KeyRound, Terminal, Plus, ArrowRight } from 'lucide-react';

export type OnboardingStep = 'add_provider_key' | 'create_api_key' | 'done';

const STEPS = [
  { id: 'add_provider_key', title: 'Add your first provider key', body: 'OpenAI, Anthropic, Gemini, Groq, OpenRouter or Mistral. It is encrypted and used only for your own requests.', icon: Plus },
  { id: 'create_api_key', title: 'Create your DevAI API key', body: 'One dvai_ key for your apps. It routes only over the provider keys you added.', icon: KeyRound },
  { id: 'call', title: 'Call the gateway', body: 'Use any OpenAI SDK with base URL /v1 and model "auto" (or any model your keys support).', icon: Terminal },
] as const;

/**
 * Bring-your-own-key onboarding. DevAI never uses shared keys for a user's requests, so until
 * a user adds a key the gateway answers 400 no_provider_keys.
 */
export function ByokOnboarding({ nextStep, onAddKey, compact }: { nextStep: OnboardingStep; onAddKey?: () => void; compact?: boolean }) {
  if (nextStep === 'done') return null;
  const current = nextStep === 'add_provider_key' ? 0 : 1;
  return (
    <section aria-label="Get started" className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-7 shadow-sm">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Bring your own key</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">{current === 0 ? 'Add your first provider key' : 'Create your DevAI API key'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {current === 0
              ? 'DevAI routes your requests only over keys you add. Until you add one, API calls return '
              : 'Your provider key is in. Now create a DevAI API key to call the gateway from your apps.'}
            {current === 0 && <code className="rounded bg-muted px-1 py-0.5 text-[12px]">no_provider_keys</code>}
            {current === 0 && '.'}
          </p>
        </div>
        {onAddKey ? (
          <button onClick={onAddKey} className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 lg:self-auto">
            {current === 0 ? 'Add a provider key' : 'Create API key'} <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <Link href={current === 0 ? '/dashboard/pool#add-key' : '/dashboard/pool#api-key'} className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 lg:self-auto">
            {current === 0 ? 'Add your first provider key' : 'Create API key'} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {!compact && (
        <ol className="relative mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s.id} className={`rounded-xl border p-4 ${active ? 'border-primary/50 bg-background/70' : 'bg-background/40'}`}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${done ? 'bg-green-500/15 text-green-500' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="text-sm font-semibold">{s.title}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{s.body}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
