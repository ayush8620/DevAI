import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { clerkAppearance, clerkEnabled, SIGN_IN_URL, SIGN_UP_URL } from '@/lib/clerk';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DevAI — one OpenAI-compatible endpoint for many AI providers',
  description: 'DevAI Gateway: one OpenAI-compatible API in front of Gemini, OpenAI, Anthropic, Groq and Ollama, with failover, parallel routing, caching, rate limits and usage analytics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const page = (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );

  // Clerk is optional (see lib/clerk.ts): without a publishable key the app renders as before.
  if (!clerkEnabled) return page;
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl={SIGN_IN_URL}
      signUpUrl={SIGN_UP_URL}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      {page}
    </ClerkProvider>
  );
}
