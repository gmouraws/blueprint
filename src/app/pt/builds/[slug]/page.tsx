import { notFound } from 'next/navigation';
import { Article } from '@/components/pages';
import { getEntry, publishedEntries } from '@/lib/content';
import { pageMetadata } from '@/lib/seo';
export const dynamicParams = false;
export function generateStaticParams() { return publishedEntries().filter(e => e.locale === 'pt-BR' && e.kind === 'builds').map(e => ({slug: e.slug})); }
type Props = {params: Promise<{slug: string}>};
export async function generateMetadata({params}: Props) { const {slug} = await params; const e = getEntry('pt-BR', 'builds', slug); if (!e) notFound(); return pageMetadata('pt-BR', e.title, e.summary, '', e); }
export default async function Page({params}: Props) { const {slug} = await params; return <Article locale="pt-BR" section="builds" slug={slug} />; }
