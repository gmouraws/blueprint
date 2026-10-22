import { Brand } from '@/components/icons';
import { DesktopSettings } from '@/components/desktop-settings';
import { LandingLanguage } from '@/components/landing-language';
import { creatorLinks, landingCopy, landingLocale } from '@/lib/landing';
import { cookies } from 'next/headers';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = landingLocale((await searchParams).lang) ?? landingLocale((await cookies()).get('blueprint_landing_language')?.value) ?? 'en';
  const copy = landingCopy[locale];
  return <div className="landing" lang={locale}>
    <header className="entry-header"><Brand/><div className="landing-navigation"><LandingLanguage locale={locale}/><Link href={`/admin?lang=${locale}`} className="muted">{copy.admin}</Link></div></header>
    <main>
      <section className="landing-hero"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.description}</p></section>
      <section className="landing-features" aria-label={locale === 'en' ? 'About the experiment' : 'Sobre o experimento'}>{copy.features.map(([title, description], index) => <article key={title}><span className="eyebrow" aria-hidden="true">0{index + 1}</span><h2>{title}</h2><p>{description}</p></article>)}</section>
      <section id="windows" className="landing-windows"><div><p className="eyebrow">WINDOWS x64</p><h2>{copy.windows}</h2><p>{copy.desktop}</p></div><p className="landing-private">{copy.distribution}</p></section>
      <div lang="pt-BR"><DesktopSettings/></div>
    </main>
    <footer className="landing-footer"><div><span className="landing-lab">Blueprint Lab</span><p>{copy.disclaimer}</p></div><div className="creator-attribution"><p>{copy.attribution}</p><nav aria-label={locale === 'en' ? 'Creator and source' : 'Autor e código-fonte'}><a href={creatorLinks.github} target="_blank" rel="noopener noreferrer">GitHub</a><a href={creatorLinks.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a><a href="https://github.com/gmouraws/blueprint" target="_blank" rel="noopener noreferrer">{copy.repository}</a></nav></div></footer>
  </div>;
}
