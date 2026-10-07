import type { Metadata } from 'next';
import { entryUrl, translation, type Entry } from './content';
import { pathFor, type Locale } from './i18n';
export const origin = 'https://blueprint.app.br';
export const isProduction = process.env.VERCEL_ENV === 'production';
export function pageMetadata(locale: Locale, title: string, description: string, segment = '', entry?: Entry): Metadata {
  const url = entry ? entryUrl(entry) : pathFor(locale, segment);
  const other = entry ? translation(entry) : undefined;
  const languages: Record<string, string> = entry ? { [locale]: url, ...(other ? { [other.locale]: entryUrl(other) } : {}) } : { en: pathFor('en', segment), 'pt-BR': pathFor('pt-BR', segment) };
  languages['x-default'] = entry ? (entry.locale === 'en' ? url : other ? entryUrl(other) : url) : pathFor('en', segment);
  return {
    metadataBase: new URL(origin), title, description,
    alternates: { canonical: url, languages }, robots: { index: isProduction, follow: isProduction },
    icons: { icon: '/icon.svg' },
    openGraph: { title, description, url, siteName: 'Blueprint', locale: locale === 'en' ? 'en_US' : 'pt_BR', type: entry ? 'article' : 'website', images: [{ url: '/social.png', width: 1200, height: 630, alt: 'Blueprint — Engineering Lab' }], ...(entry ? {publishedTime: entry.publishedAt, modifiedTime: entry.updatedAt} : {}) },
    twitter: { card: 'summary_large_image', title, description, images: ['/social.png'] },
  };
}
