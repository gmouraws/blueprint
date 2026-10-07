import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { publishedEntries, entryUrl } from '../src/lib/content';
const production = process.env.VERCEL_ENV === 'production';
const directory = '.next/server/app';
const routes = ['/', '/builds', '/experiments', '/notes', '/about', '/pt', '/pt/builds', '/pt/experiments', '/pt/notes', '/pt/about', ...publishedEntries().map(entryUrl)];
for (const route of routes) {
  const html = fs.readFileSync(path.join(directory, `${route === '/' ? 'index' : route.slice(1)}.html`), 'utf8');
  assert.ok(html.includes(`name="robots" content="${production ? 'index, follow' : 'noindex, nofollow'}"`), `Indexing policy: ${route}`);
  assert.ok(html.includes('rel="canonical"'), `Missing canonical: ${route}`);
}
const sitemap = fs.readFileSync(path.join(directory, 'sitemap.xml.body'), 'utf8');
assert.equal((sitemap.match(/<url>/g) ?? []).length, production ? routes.length : 0);
const robots = fs.readFileSync(path.join(directory, 'robots.txt.body'), 'utf8');
assert.ok(robots.includes(production ? 'Allow: /' : 'Disallow: /'));
const walk = (dir: string): string[] => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
for (const filename of walk('.next/server').filter(f => f.endsWith('.nft.json'))) {
  const trace = JSON.parse(fs.readFileSync(filename,'utf8')) as {files:string[]};
  assert.ok(trace.files.every(f => !/(?:^|[/\\])content[/\\](?:en|pt)[/\\]/.test(f)), `Source content leaked into deployment trace: ${filename}`);
}
console.log(`Verified ${routes.length} static public routes, ${production ? 'production' : 'preview'} indexing policy, sitemap, robots, and draft source isolation.`);
