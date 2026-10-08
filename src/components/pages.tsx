import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { entryUrl, getEntry, listing, type Entry } from '@/lib/content';
import { words, pathFor, type Locale, type Section } from '@/lib/i18n';

function Status({ entry, locale }: { entry: Entry; locale: Locale }) {
  if (!entry.status) return null;
  const isBuild = entry.kind === 'builds';
  return <span className="status" data-build-status={isBuild ? entry.status : undefined}><span aria-hidden="true" className={isBuild ? 'status-dot' : undefined}>{isBuild ? null : '◦'}</span>{words[locale].statuses[entry.status]}</span>;
}
function Rows({ entries, locale }: { entries: Entry[]; locale: Locale }) {
  const w = words[locale];
  return entries.length ? <ul className="entry-list">{entries.map(e => <li key={e.id}><div className="entry-meta"><span className="mono">{e.id}</span><Status entry={e} locale={locale} /></div><div><h3><Link href={entryUrl(e)} lang={e.locale}>{e.title}<span aria-hidden="true" className="arrow">→</span></Link></h3><p lang={e.locale}>{e.summary}</p>{e.locale !== locale && <span className="availability">{w.onlyEnglish}</span>}</div></li>)}</ul> : <p className="empty">{w.empty}</p>;
}
export function Home({ locale }: { locale: Locale }) {
  const w = words[locale]; const entries = listing(locale); const featured = entries.find(e => e.id === 'BUILD-001');
  return <><section className="hero"><p className="eyebrow">BLUEPRINT / {w.lab}</p><h1>{w.tagline}</h1><p className="hero-intro">{w.intro}</p><div className="hero-index mono" aria-hidden="true">BUILD · EXP · NOTE <span>01 / V1</span></div></section>
    {featured && <section className="featured" aria-labelledby="featured"><div><p className="eyebrow" id="featured">{w.featured}</p><div className="entry-meta"><span className="mono">{featured.id}</span><Status entry={featured} locale={locale} /></div><h2><Link href={entryUrl(featured)}>Blueprint <span aria-hidden="true">→</span></Link></h2><p>{featured.summary}</p><Link className="text-link" href={entryUrl(featured)}>{w.read} <span aria-hidden="true">→</span></Link></div><div className="blueprint-drawing" aria-hidden="true"><span className="diagram-label">SPEC / BUILD-001</span><div className="drawing-structure"><div className="drawing-core">Blueprint<span>{w.lab}</span></div><svg className="drawing-connectors" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="M150 0V22M50 44V22H250V44M150 22V44" /></svg><div className="drawing-nodes"><span>{w.builds}</span><span>{w.experiments}</span><span>{w.notes}</span></div></div><span className="diagram-label">CONTENT → SYSTEM</span></div></section>}
    <section className="activity" aria-labelledby="activity"><div className="section-heading"><h2 id="activity">{w.activity}</h2><span className="mono">LOG / V1</span></div><Rows entries={entries.filter(e => e.id !== 'BUILD-001')} locale={locale} /></section></>;
}
export function SectionPage({ locale, section }: { locale: Locale; section: Section }) {
  const w = words[locale]; return <><div className="page-heading"><p className="eyebrow">BLUEPRINT / {w.lab}</p><h1>{w[section]}</h1><p>{w.descriptions[section]}</p></div><Rows entries={listing(locale, section)} locale={locale} /></>;
}
export function About({ locale }: { locale: Locale }) {
  const w = words[locale]; return <><article className="prose about"><p className="eyebrow">BLUEPRINT / {w.lab}</p><h1>{w.about}</h1><p className="lead">{w.aboutText}</p><h2>{w.principle}</h2><p>{w.aboutDetail}</p><h2 id="privacy">{w.privacy}</h2><p>{w.privacyText}</p></article></>;
}
export async function Article({ locale, section, slug }: { locale: Locale; section: Section; slug: string }) {
  const e = getEntry(locale, section, slug); if (!e) notFound(); const w = words[locale];
  return <><article className="article"><header className="article-heading"><Link className="eyebrow" href={pathFor(locale, section)}>{w[section]}</Link><div className="entry-meta"><span className="mono">{e.id}</span><Status entry={e} locale={locale} /></div><h1>{e.title}</h1><p className="lead">{e.summary}</p>{e.publishedAt && <p className="date">{w.published}: <time dateTime={e.publishedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(e.publishedAt))}</time></p>}{e.updatedAt && <p className="date">{w.updated}: <time dateTime={e.updatedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(e.updatedAt))}</time></p>}{e.stale && <p className="notice">{w.translation}</p>}</header><div className="prose"><MDXRemote source={e.body} components={{ pre: ({children, ...props}) => <pre {...props} tabIndex={0} role="region" aria-label={locale === 'en' ? 'Code example' : 'Exemplo de código'}>{children}</pre> }} options={{ mdxOptions: { rehypePlugins: [rehypeSlug, rehypeHighlight] } }} /></div><Evidence entry={e} locale={locale} /><div className="article-end mono">{e.id} / BLUEPRINT</div></article></>;
}
function Evidence({ entry, locale }: { entry: Entry; locale: Locale }) {
  if (!entry.evidence?.length) return null;
  const w = words[locale];
  return <section className="evidence" aria-labelledby="evidence-heading"><h2 id="evidence-heading">{w.evidence}</h2><dl>{entry.evidence.map((item, index) => <div className="evidence-row" key={index}><dt>{item.label}</dt><dd>{item.url ? <a href={item.url}>{item.url.replace('https://', '')}<span aria-hidden="true"> ↗</span></a> : null}<span className="evidence-basis">{item.basis === 'public' ? w.publicLink : w.authorStatement}</span></dd></div>)}</dl></section>;
}
export function Missing({ locale }: { locale: Locale }) { const w = words[locale]; return <div className="page-heading"><p className="eyebrow">404 / BLUEPRINT</p><h1>{w.notFound}</h1><p>{w.notFoundText}</p><Link className="text-link" href={pathFor(locale)}>{w.back}</Link></div>; }
