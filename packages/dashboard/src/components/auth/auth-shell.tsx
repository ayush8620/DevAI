import Link from 'next/link';

/**
 * Centered page frame for the sign-in / sign-up screens, in the landing page style.
 * The Clerk card brings its own heading, which changes per step ("Check your email", ...).
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground text-sm">D</span>
          <span className="text-lg">DevAI</span>
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}

export function ClerkNotConfigured() {
  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
      Sign-in is not configured for this deployment (no <code className="font-mono text-xs">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>).
      Open the <Link href="/dashboard/settings" className="text-primary hover:underline">dashboard settings</Link> and use the gateway admin key instead.
    </div>
  );
}
