import type { MetadataRoute } from 'next';
import { THEME_COLOR } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DevAI: OpenAI-compatible AI API gateway',
    short_name: 'DevAI',
    description: 'One OpenAI-compatible endpoint that runs on your own provider keys, with failover, key rotation and usage analytics.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    lang: 'en-IN',
    categories: ['developer', 'productivity', 'utilities'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/devai-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/devai-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/devai-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
