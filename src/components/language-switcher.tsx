'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pathFor, type Locale } from '@/lib/i18n';

export function LanguageSwitcher({ locale, availablePaths, label, missing }: {
  locale: Locale; availablePaths: string[]; label: string; missing: string;
}) {
  const pathname = usePathname();
  const otherLocale = locale === 'en' ? 'pt-BR' : 'en';
  const segment = pathname.replace(/^\/pt(?=\/|$)/, '').replace(/^\//, '');
  const candidate = pathFor(otherLocale, segment);
  const available = availablePaths.includes(candidate);
  const href = available ? candidate : pathFor(otherLocale, segment.split('/')[0]);
  const targetLabel = otherLocale === 'en' ? 'English' : 'Português';
  return <div className="language">
    <span className="mono">{locale === 'en' ? 'EN' : 'PT-BR'}</span>
    <span aria-hidden="true">/</span>
    <Link href={href} hrefLang={otherLocale} lang={otherLocale} aria-label={`${label}: ${targetLabel}`} aria-describedby={!available ? 'translation-message' : undefined}>{targetLabel}</Link>
    {!available && <span id="translation-message" className="translation-message">{missing}</span>}
  </div>;
}
