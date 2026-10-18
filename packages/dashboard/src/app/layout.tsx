import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { KEYWORDS, SITE_NAME, SITE_URL, THEME_COLOR } from '@/lib/seo';
import { clerkAppearance, clerkEnabled, SIGN_IN_URL, SIGN_UP_URL } from '@/lib/clerk';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

const TITLE = 'DevAI: OpenAI-compatible AI API gateway with your own keys';
const DESCRIPTION = 'DevAI is an OpenAI-compatible AI API gateway and LLM router that runs on your own provider keys (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Mistral), with failover, key rotation, caching and usage analytics.';

// Icons and social images come from the file conventions in this folder: icon.svg + icon1.png
// (favicons), apple-icon.png (180 px), opengraph-image.png / twitter-image.png (1200 x 630),
// manifest.ts, robots.ts and sitemap.ts. Sources: public/brand/*.svg, regenerated with
// `node scripts/brand-assets.mjs`. Pages set their own title, description and canonical
// URL with pageMetadata() from lib/seo.ts.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s | DevAI' },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  authors: [{ name: 'Ayush Yadav', url: 'https://ayushyadav.dev' }],
  creator: 'Ayush Yadav',
  category: 'technology',
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_IN',
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR },
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const page = (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Light / dark: system preference by default, saved in localStorage, class set before paint (no flash). */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme" disableTransitionOnChange>
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
