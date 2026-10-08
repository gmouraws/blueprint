import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { allEntries, entryUrl } from '../src/lib/content';
import { origin } from '../src/lib/seo';

type PrerenderManifest = {
  version: number;
  routes: Record<string, { initialRevalidateSeconds: number | false; compute?: string }>;
  dynamicRoutes: Record<string, { fallback: string | false | null }>;
};
const frameworkRoutes = new Set(['/_not-found', '/_global-error', '/404', '/500']);
const metadataRoutes = ['/sitemap.xml', '/robots.txt'];
const walk = (directory: string): string[] => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const attributes = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)=["']([^"']*)["']/g)].map(match => [match[1], match[2]]));

export function verifyOutput({ buildDirectory, routes, production }: { buildDirectory: string; routes: string[]; production: boolean }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'prerender-manifest.json'), 'utf8')) as PrerenderManifest;
  assert.equal(manifest.version, 4, 'Unsupported Next.js prerender manifest version; review the verifier');
  const expected = new Set([...routes, ...metadataRoutes]);
  for (const route of expected) {
    const emitted = manifest.routes[route];
    assert.ok(emitted, `Missing prerendered route: ${route}`);
    assert.equal(emitted.initialRevalidateSeconds, false, `Route must remain fully static: ${route}`);
    if (emitted.compute !== undefined) assert.equal(emitted.compute, 'static', `Request-time computation: ${route}`);
  }
  for (const route of Object.keys(manifest.routes)) {
    assert.ok(expected.has(route) || frameworkRoutes.has(route), `Unexpected/unpublished output route: ${route}`);
  }
  for (const [route, emitted] of Object.entries(manifest.dynamicRoutes)) {
    assert.equal(emitted.fallback, false, `Unpublished paths could be generated at runtime: ${route}`);
  }

  // Discover artifacts by their emitted contents, never by URL-to-filename guesses.
  // Next.js adapters can relocate prerenders while preserving manifest identities.
  const files = walk(path.join(buildDirectory, 'server'));
  const found = new Set<string>();
  const bodies: string[] = [];
  const traces = files.filter(filename => filename.endsWith('.nft.json'));
  assert.ok(traces.length, 'Missing output file traces; cannot verify source isolation');
  for (const filename of files) {
    if (filename.endsWith('.html')) {
      const html = fs.readFileSync(filename, 'utf8');
      const links = [...html.matchAll(/<link\b[^>]*>/g)].map(match => attributes(match[0]));
      const canonical = links.find(link => link.rel === 'canonical')?.href;
      if (!canonical) continue; // Framework error pages have no public canonical.
      const route = new URL(canonical).pathname;
      if (!routes.includes(route)) continue;
      assert.equal(canonical, `${origin}${route === '/' ? '' : route}`, `Canonical URL: ${route}`);
      const metas = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0]));
      assert.equal(metas.find(meta => meta.name === 'robots')?.content, production ? 'index, follow' : 'noindex, nofollow', `Indexing policy: ${route}`);
      found.add(route);
    } else if (filename.endsWith('.body')) {
      bodies.push(fs.readFileSync(filename, 'utf8'));
    }
  }
  for (const route of routes) assert.ok(found.has(route), `Missing rendered canonical output: ${route}`);
  const sitemaps = bodies.filter(body => /<urlset\b/.test(body));
  assert.equal(sitemaps.length, 1, 'Expected one emitted sitemap');
  const sitemapUrls = [...sitemaps[0].matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).href);
  assert.deepEqual(sitemapUrls.sort(), production ? routes.map(route => new URL(route, origin).href).sort() : [], 'Sitemap contains missing or unpublished URLs');
  const robots = bodies.filter(body => /^User-agent:/im.test(body));
  assert.equal(robots.length, 1, 'Expected one emitted robots response');
  assert.ok(robots[0].includes(production ? 'Allow: /' : 'Disallow: /'), 'Robots indexing policy');
  for (const filename of traces) {
    const trace = JSON.parse(fs.readFileSync(filename, 'utf8')) as { files: string[] };
    assert.ok(Array.isArray(trace.files), `Invalid output file trace: ${filename}`);
    assert.ok(trace.files.every(file => !/(?:^|[/\\])content[/\\](?:en|pt)[/\\]/.test(file)), `Source content leaked into deployment trace: ${filename}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const entries = allEntries();
  assert.ok(entries.every(entry => entry.publication === 'PUBLISHED'), 'Unpublished content in deployment registry');
  const routes = ['/', '/builds', '/experiments', '/notes', '/about', '/privacy', '/pt', '/pt/builds', '/pt/experiments', '/pt/notes', '/pt/about', '/pt/privacy', ...entries.map(entryUrl)];
  const production = process.env.VERCEL_ENV === 'production';
  verifyOutput({ buildDirectory: '.next', routes, production });
  console.log(`Verified ${routes.length} static public routes, ${production ? 'production' : 'preview'} indexing policy, sitemap, robots, and draft source isolation.`);
}
