import Link from 'next/link';
import type { ReactNode } from 'react';
import { words, pathFor, type Locale } from '@/lib/i18n';
import { isProduction } from '@/lib/seo';
import { WebAnalytics } from './analytics';
import { LanguageSwitcher } from './language-switcher';
import { publishedEntries, entryUrl } from '@/lib/content';
export function Shell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const w = words[locale];
  const otherLocale = locale === 'en' ? 'pt-BR' : 'en';
  const availablePaths = ['', 'builds', 'experiments', 'notes', 'about'].map(segment => pathFor(otherLocale, segment)).concat(publishedEntries().filter(e => e.locale === otherLocale).map(entryUrl));
  return <html lang={locale}><body>
    <a className="skip" href="#main">{w.skip}</a>
    <header className="site-header"><div className="container header-inner">
      <Link className="brand" href={pathFor(locale)}><span className="brand-mark" aria-hidden="true">B<span>+</span></span><span>Blueprint<span className="brand-caption">{w.lab}</span></span></Link>
      <div className="header-controls"><nav aria-label={w.nav}><ul>{(['builds', 'experiments', 'notes', 'about'] as const).map(s => <li key={s}><Link href={pathFor(locale, s)}>{w[s]}</Link></li>)}</ul></nav>
      <LanguageSwitcher locale={locale} availablePaths={availablePaths} label={w.language} missing={w.missing} /></div>
    </div></header>
    <main id="main" className="container" tabIndex={-1}>{children}</main>
    <footer className="container footer"><span>Blueprint · Guilherme Moura</span><Link href={pathFor(locale, 'about')}>{w.about} / {w.privacy}</Link></footer>
    {isProduction && <WebAnalytics />}
  </body></html>;
}
