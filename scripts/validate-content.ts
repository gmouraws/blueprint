import fs from 'node:fs';
import path from 'node:path';
import { validateEntries, entryUrl } from '../src/lib/content';
import { sections } from '../src/lib/i18n';
const files = (['en', 'pt-BR'] as const).flatMap(locale => sections.flatMap(kind => {
  const directory = path.join(process.cwd(), 'content', locale === 'en' ? 'en' : 'pt', kind);
  return fs.readdirSync(directory).filter(name => name.endsWith('.mdx')).map(name => ({source: fs.readFileSync(path.join(directory, name), 'utf8'), name, locale, kind}));
}));
const entries = validateEntries(files);
const published = entries.filter(e => e.publication === 'PUBLISHED');
const paths = new Set(['/', '/builds', '/experiments', '/notes', '/about', '/privacy', '/pt', '/pt/builds', '/pt/experiments', '/pt/notes', '/pt/about', '/pt/privacy', ...published.map(entryUrl)]);
for (const e of entries) {
  if (e.stale && e.publication === 'PUBLISHED') throw new Error(`Translation requires review: ${e.id}`);
  if (e.publication !== 'PUBLISHED') continue;
  if (e.locale === 'pt-BR') {
    const source = entries.find(s => s.locale === 'en' && s.id === e.id)!;
    const code = (body: string) => [...body.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map(m => m[0]);
    if (JSON.stringify(code(source.body)) !== JSON.stringify(code(e.body))) throw new Error(`Translation changed code tokens: ${e.id}`);
  }
  for (const match of e.body.matchAll(/\]\((\/[^\s)]*)\)/g)) {
    const target = match[1].split('#')[0];
    if (!paths.has(target)) throw new Error(`Broken link in ${e.id}: ${target}`);
  }
}
fs.mkdirSync('.generated', {recursive:true});
fs.writeFileSync('.generated/content.json', JSON.stringify(published));
console.log(`Validated ${entries.length} entries; ${published.length} published. Translation source revisions match.`);
