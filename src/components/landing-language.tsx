'use client';
import Link from 'next/link';
import type { LandingLocale } from '@/lib/landing';
export function LandingLanguage({ locale }: { locale: LandingLocale }) {
  return <nav className="landing-language" aria-label={locale === 'en' ? 'Language' : 'Idioma'}>{(['en', 'pt-BR'] as const).map(value =>
    <Link key={value} href={`/?lang=${value}`} hrefLang={value} lang={value} aria-current={locale === value ? 'page' : undefined} onClick={() => {
      document.cookie = `blueprint_landing_language=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    }}>{value === 'en' ? 'EN' : 'PT-BR'}</Link>)}</nav>;
}
