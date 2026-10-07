import type { MetadataRoute } from 'next';
import { origin, isProduction } from '@/lib/seo';
export default function robots(): MetadataRoute.Robots {
  return isProduction ? { rules: { userAgent: '*', allow: '/' }, sitemap: `${origin}/sitemap.xml` } : { rules: { userAgent: '*', disallow: '/' } };
}
