import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { clerkAppearance, clerkEnabled, SIGN_IN_URL, SIGN_UP_URL } from '@/lib/clerk';

const inter = Inter({ subsets: ['latin'] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://devai-dashboard-six.vercel.app';
const TITLE = 'DevAI — one OpenAI-compatible endpoint, your own keys';
const DESCRIPTION = 'DevAI Gateway: one OpenAI-compatible API that runs on your own provider keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral), with failover, key rotation, parallel routing, caching and usage analytics.';

// Icons and social images come from the file conventions in this folder: icon.svg + icon1.png
// (favicons), apple-icon.png (180 px), opengraph-image.png / twitter-image.png (1200 x 630).
// Sources: public/brand/*.svg, regenerated with `node scripts/brand-assets.mjs`.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'DevAI',
  openGraph: {
    type: 'website',
    siteName: 'DevAI',
    url: '/',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
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
