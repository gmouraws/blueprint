import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { entryUrl, getEntry, listing, type Entry } from '@/lib/content';
import { words, pathFor, sections, type Locale, type Section } from '@/lib/i18n';

function Status({ entry, locale }: { entry: Entry; locale: Locale }) {
  if (!entry.status) return null;
  const isBuild = entry.kind === 'builds';
  return <span className="status" data-build-status={isBuild ? entry.status : undefined}><span aria-hidden="true" className={isBuild ? 'status-dot' : undefined}>{isBuild ? null : '◦'}</span>{words[locale].statuses[entry.status]}</span>;
}
function Rows({ entries, locale, featuredId, headingLevel = 3 }: { entries: Entry[]; locale: Locale; featuredId?: string; headingLevel?: 2 | 3 }) {
  const w = words[locale];
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return entries.length ? <ul className="entry-list">{entries.map(e => <li key={e.id} className={e.id === featuredId ? 'featured' : undefined}><div className="entry-meta"><span className="mono">{e.id}</span><Status entry={e} locale={locale} />{e.publishedAt && <time className="date" dateTime={e.publishedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(e.publishedAt))}</time>}</div><div><Heading><Link href={entryUrl(e)} lang={e.locale}>{e.title}<span aria-hidden="true" className="arrow">→</span></Link></Heading><p lang={e.locale}>{e.summary}</p>{e.locale !== locale && <span className="availability">{w.onlyEnglish}</span>}</div></li>)}</ul> : <p className="empty">{w.empty}</p>;
}
export function Home({ locale }: { locale: Locale }) {
  const w = words[locale];
  return <><section className="hero"><h1>{w.purpose}</h1><p className="hero-intro">{w.homeContext}</p></section>
    {sections.map((section, index) => <section key={section} className="activity editorial-index" aria-labelledby={`index-${section}`}><div className="section-heading"><span className="mono index-number" aria-hidden="true">0{index + 1} /</span><h2 id={`index-${section}`}><Link href={pathFor(locale, section)}>{w[section]}</Link></h2></div><Rows entries={listing(locale, section)} locale={locale} featuredId={section === 'builds' ? 'BUILD-001' : undefined} /></section>)}</>;
}
export function SectionPage({ locale, section }: { locale: Locale; section: Section }) {
  const w = words[locale]; return <><div className="page-heading"><p className="eyebrow section-signature"><span className="index-number" aria-hidden="true">0{sections.indexOf(section) + 1} /</span> Blueprint</p><h1>{w[section]}</h1><p>{w.descriptions[section]}</p></div><Rows entries={listing(locale, section)} locale={locale} headingLevel={2} /></>;
}
export function About({ locale }: { locale: Locale }) {
  const w = words[locale];
  return <article className="about-editorial">
    <header className="about-heading"><p className="eyebrow section-signature"><span className="index-number" aria-hidden="true">04 /</span>{w.about}</p><h1>Guilherme Moura</h1><p className="about-byline">{w.roleLocation}</p><p className="lead about-intro">{w.aboutIntro}</p></header>
    <section className="about-section" aria-labelledby="the-lab"><h2 id="the-lab">{w.theLab}</h2><div><p className="about-context">{w.aboutLab}</p><ul className="lab-index">{sections.map((section, index) => <li key={section}><Link href={pathFor(locale, section)}><span className="mono index-number" aria-hidden="true">0{index + 1} /</span>{w[section]}<span className="arrow" aria-hidden="true">→</span></Link><p>{w.labTypes[section]}</p></li>)}</ul></div></section>
    <section className="about-section" aria-labelledby="the-principle"><h2 id="the-principle">{w.principleLabel}</h2><div><p className="about-principle">{w.principle}</p><a className="text-link" href="https://github.com/gmouraws/blueprint">{w.github}<span aria-hidden="true"> ↗</span></a></div></section>
  </article>;
}
export function Privacy({ locale }: { locale: Locale }) {
  const w = words[locale];
  return <article className="prose privacy-page"><p className="eyebrow">Blueprint</p><h1>{w.privacy}</h1><p>{w.privacyText}</p></article>;
}
export async function Article({ locale, section, slug }: { locale: Locale; section: Section; slug: string }) {
  const e = getEntry(locale, section, slug); if (!e) notFound(); const w = words[locale];
  return <><article className="article" data-kind={section}><header className="article-heading"><Link className="eyebrow section-signature" href={pathFor(locale, section)}><span className="index-number" aria-hidden="true">0{sections.indexOf(section) + 1} /</span>{w[section]}</Link><div className="entry-meta"><span className="mono">{e.id}</span><Status entry={e} locale={locale} /></div>{section === 'builds' && <p className="case-label">{w.caseStudy}</p>}<h1>{e.title}</h1><p className="lead">{e.summary}</p>{e.publishedAt && <p className="date">{w.published}: <time dateTime={e.publishedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(e.publishedAt))}</time></p>}{e.updatedAt && <p className="date">{w.updated}: <time dateTime={e.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(e.updatedAt))}</time></p>}{e.stale && <p className="notice">{w.translation}</p>}</header><div className="prose"><MDXRemote source={e.body} components={{ pre: ({children, ...props}) => <pre {...props} tabIndex={0} role="region" aria-label={locale === 'en' ? 'Code example' : 'Exemplo de código'}>{children}</pre> }} options={{ mdxOptions: { rehypePlugins: [rehypeSlug, rehypeHighlight] } }} /></div><Evidence entry={e} locale={locale} /><div className="article-end mono">{e.id} / BLUEPRINT</div></article></>;
}
function Evidence({ entry, locale }: { entry: Entry; locale: Locale }) {
  if (!entry.evidence?.length) return null;
  const w = words[locale];
  return <section className="evidence" aria-labelledby="evidence-heading"><h2 id="evidence-heading">{w.evidence}</h2><dl>{entry.evidence.map((item, index) => <div className="evidence-row" key={index}><dt>{item.label}</dt><dd>{item.url ? <a href={item.url}>{item.url.replace('https://', '')}<span aria-hidden="true"> ↗</span></a> : null}<span className="evidence-basis">{item.basis === 'public' ? w.publicLink : w.authorStatement}</span></dd></div>)}</dl></section>;
}
export function Missing({ locale }: { locale: Locale }) { const w = words[locale]; return <div className="page-heading"><p className="eyebrow">404 / BLUEPRINT</p><h1>{w.notFound}</h1><p>{w.notFoundText}</p><Link className="text-link" href={pathFor(locale)}>{w.back}</Link></div>; }
