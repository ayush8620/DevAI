import type { Metadata } from 'next';

/** Public base URL; set NEXT_PUBLIC_SITE_URL on a custom domain. No trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://devai-dashboard-six.vercel.app').replace(/\/+$/, '');
export const SITE_NAME = 'DevAI';
export const GITHUB_URL = 'https://github.com/ayush8620/DevAI';
export const THEME_COLOR = '#0A0A0A';
export const BRAND_ORANGE = '#F97316';

export const KEYWORDS = [
  'AI API gateway',
  'LLM gateway',
  'LLM router',
  'OpenAI-compatible API',
  'bring your own key',
  'BYOK',
  'Gemini API',
  'OpenAI API',
  'Groq API',
  'OpenRouter alternative',
  'Anthropic API',
  'Mistral API',
  'API key rotation',
  'LLM failover',
  'AI API pricing India',
  'INR pricing',
  'student plan',
  'hackathon API keys',
];

const OG_IMAGE = { url: '/opengraph-image.png', width: 1200, height: 630, alt: 'DevAI: one OpenAI-compatible endpoint that runs on your own provider keys' };

/**
 * Per-page metadata: unique title (the root layout adds " | DevAI"), description,
 * canonical URL, Open Graph and Twitter card. noindex for private or thin pages.
 */
export function pageMetadata({ title, description, path, noindex = false, absoluteTitle = false }: {
  title: string; description: string; path: string; noindex?: boolean; absoluteTitle?: boolean;
}): Metadata {
  const full = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: path, title: full, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: full, description, images: [OG_IMAGE.url] },
    robots: noindex ? { index: false, follow: false, googleBot: { index: false, follow: false } } : undefined,
  };
}

/** Serialises JSON-LD safely for a <script type="application/ld+json"> tag. */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
