import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Public, indexable pages only (no /dashboard, /sign-in, /sign-up, /kit or /api).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/docs`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
