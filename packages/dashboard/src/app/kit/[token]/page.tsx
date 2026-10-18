import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, Users, Cpu } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/landing/site-chrome';
import { KitMeter, kitStatusBadge, timeLeft } from '@/components/kits/kit-meter';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hackathon kit', description: 'A DevAI hackathon kit: temporary, capped API keys for a hackathon team.', robots: { index: false, follow: false } };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function loadKit(token: string) {
  try {
    const res = await fetch(`${API_URL}/public/kits/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) return { error: res.status === 404 ? 'This kit does not exist.' : 'Could not load this kit right now.' };
    return { kit: (await res.json()).data };
  } catch {
    return { error: 'Could not reach the DevAI gateway.' };
  }
}

export default async function KitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { kit, error } = await loadKit(token);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Hackathon kit</p>
        {error || !kit ? (
          <div className="mt-4 rounded-2xl border bg-card p-8">
            <h1 className="text-2xl font-bold">Kit not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border bg-card p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{kit.name}</h1>
              {kitStatusBadge(kit.status)}
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border p-4"><Clock className="h-4 w-4 text-primary" /><p className="mt-2 font-semibold">{kit.status === 'active' ? timeLeft(kit.expiresAt) : kit.status === 'revoked' ? 'Revoked by the organiser' : 'Ended'}</p><p className="text-xs text-muted-foreground">Ends {new Date(kit.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</p></div>
              <div className="rounded-xl border p-4"><Users className="h-4 w-4 text-primary" /><p className="mt-2 font-semibold">{kit.keyCount} keys</p><p className="text-xs text-muted-foreground">{kit.maxTeamSize ? `Team of up to ${kit.maxTeamSize}` : 'No team size limit'}</p></div>
              <div className="rounded-xl border p-4"><Cpu className="h-4 w-4 text-primary" /><p className="mt-2 font-semibold">{kit.allowedModels.length || 'Any'} model{kit.allowedModels.length === 1 ? '' : 's'}</p><p className="truncate text-xs text-muted-foreground font-mono" title={kit.allowedModels.join(', ')}>{kit.allowedModels.join(', ') || 'from the organiser’s pool'}</p></div>
            </div>
            <div className="space-y-4 [&_.text-muted-foreground]:text-muted-foreground [&_.text-foreground]:text-zinc-100 [&_.bg-muted]:bg-white/10">
              <KitMeter label="Requests" used={kit.usage.requests} cap={kit.requestCap} />
              <KitMeter label="Tokens" used={kit.usage.tokens} cap={kit.tokenCap} />
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-xs text-foreground">
              <p className="mb-2 text-muted-foreground">Use your team key with any OpenAI-compatible client:</p>
              <pre className="overflow-x-auto font-mono">{`curl ${API_URL}/v1/chat/completions \\
  -H "Authorization: Bearer dvai_YOUR_TEAM_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${kit.allowedModels[0] ?? 'auto'}","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
            </div>
            <p className="text-xs text-muted-foreground">Keys are handed out by the organiser and are not shown here. See the <Link href="/docs#kits" className="text-primary hover:underline">kit docs</Link> for error codes.</p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
