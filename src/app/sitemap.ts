import type { MetadataRoute } from 'next';
import { publishedEntries, entryUrl } from '@/lib/content';
import { pathFor } from '@/lib/i18n';
import { origin, isProduction, pageMetadata } from '@/lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProduction) return [];
  const pages = (['en', 'pt-BR'] as const).flatMap(locale => ['', 'builds', 'experiments', 'notes', 'about'].map(segment => ({
    url: origin + pathFor(locale, segment),
    alternates: { languages: { en: origin + pathFor('en', segment), 'pt-BR': origin + pathFor('pt-BR', segment) } },
  })));
  return [...pages, ...publishedEntries().map(e => {
    const metadata = pageMetadata(e.locale, e.title, e.summary, '', e);
    const languages = Object.fromEntries(Object.entries(metadata.alternates?.languages ?? {}).map(([locale, url]) => [locale, origin + url]));
    return { url: origin + entryUrl(e), ...(e.updatedAt ?? e.publishedAt ? {lastModified: e.updatedAt ?? e.publishedAt} : {}), alternates: { languages } };
  })];
}
