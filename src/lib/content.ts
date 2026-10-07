import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import { sections, pathFor, type Locale, type Section } from './i18n';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const schema = z.object({
  id: z.string().regex(/^(BUILD|EXP|NOTE)-\d{3}$/),
  kind: z.enum(sections), locale: z.enum(['en', 'pt-BR']),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1), summary: z.string().min(1),
  publication: z.enum(['DRAFT', 'PUBLISHED']),
  status: z.enum(['PLANNED', 'BUILDING', 'LIVE', 'ARCHIVED', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  publishedAt: date.optional(), updatedAt: date.optional(),
  tags: z.array(z.string().min(1)).default([]),
  translationOf: z.string().optional(), sourceRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export type Entry = z.infer<typeof schema> & { body: string; revision: string; stale: boolean };
export function revisionOf(source: string) { return createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex'); }
export function validateEntries(files: { source: string; locale: Locale; kind: Section; name: string }[]): Entry[] {
  const entries = files.map(file => {
    const normalized = file.source.replace(/\r\n/g, '\n');
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
    if (!match) throw new Error(`Missing frontmatter: ${file.name}`);
    const data = schema.parse(parse(match[1]));
    if (data.locale !== file.locale || data.kind !== file.kind || data.slug !== file.name.replace(/\.mdx$/, '')) throw new Error(`Content path mismatch: ${file.name}`);
    const prefix = { builds: 'BUILD-', experiments: 'EXP-', notes: 'NOTE-' }[data.kind];
    if (!data.id.startsWith(prefix)) throw new Error(`ID kind mismatch: ${data.id}`);
    const statuses = data.kind === 'builds' ? ['PLANNED', 'BUILDING', 'LIVE', 'ARCHIVED'] : ['PLANNED', 'RUNNING', 'COMPLETED', 'FAILED', 'ARCHIVED'];
    if (data.kind === 'notes' ? data.status !== undefined : !data.status || !statuses.includes(data.status)) throw new Error(`Invalid lifecycle: ${data.id}`);
    if (data.updatedAt && data.publishedAt && data.updatedAt < data.publishedAt) throw new Error(`Invalid date order: ${data.id}`);
    if (data.locale === 'en' && (data.translationOf || data.sourceRevision)) throw new Error(`English cannot be a translation: ${data.id}`);
    return { ...data, body: match[2], revision: revisionOf(file.source), stale: false };
  });
  for (const field of ['id', 'slug'] as const) {
    const seen = new Set<string>();
    for (const e of entries) {
      const key = `${e.locale}:${field === 'slug' ? e.kind : ''}:${e[field]}`;
      if (seen.has(key)) throw new Error(`Duplicate ${field}: ${key}`);
      seen.add(key);
    }
  }
  for (const e of entries.filter(e => e.locale === 'pt-BR')) {
    const source = entries.find(s => s.locale === 'en' && s.id === e.translationOf);
    if (!source || source.id !== e.id || source.slug !== e.slug || source.kind !== e.kind || source.status !== e.status || !e.sourceRevision) throw new Error(`Invalid translation: ${e.id}`);
    if (e.publication === 'PUBLISHED' && source.publication !== 'PUBLISHED') throw new Error(`Translation source is draft: ${e.id}`);
    e.stale = source.revision !== e.sourceRevision;
  }
  return entries;
}
let registry: Entry[] | undefined;
export function allEntries(): Entry[] {
  if (registry) return registry;
  // Runtime reads only the build-generated public registry, never source drafts.
  return registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.generated', 'content.json'), 'utf8')) as Entry[];
}
export function publishedEntries() { return allEntries().filter(e => e.publication === 'PUBLISHED'); }
export function entryUrl(e: Pick<Entry, 'locale' | 'kind' | 'slug'>) { return pathFor(e.locale, `${e.kind}/${e.slug}`); }
export function getEntry(locale: Locale, kind: Section, slug: string) { return publishedEntries().find(e => e.locale === locale && e.kind === kind && e.slug === slug); }
export function translation(e: Entry) { return publishedEntries().find(t => t.id === e.id && t.locale !== e.locale); }
export function listing(locale: Locale, kind?: Section) {
  const english = publishedEntries().filter(e => e.locale === 'en' && (!kind || e.kind === kind));
  return english.map(e => locale === 'en' ? e : translation(e) ?? e).sort((a, b) => (b.updatedAt ?? b.publishedAt ?? '').localeCompare(a.updatedAt ?? a.publishedAt ?? '') || a.id.localeCompare(b.id));
}
