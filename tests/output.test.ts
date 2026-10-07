import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyOutput } from '../scripts/verify-output';

function fixture(production = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-output-'));
  const outputs = path.join(directory, 'server', 'arbitrary-adapter', 'opaque-owner');
  fs.mkdirSync(outputs, { recursive: true });
  const routes = ['/', '/builds/example'];
  const manifest = { version: 4, routes: Object.fromEntries([...routes, '/sitemap.xml', '/robots.txt'].map(route => [route, { initialRevalidateSeconds: false, compute: 'static' }])), dynamicRoutes: { '/builds/[slug]': { fallback: false as false | null } } };
  const saveManifest = () => fs.writeFileSync(path.join(directory, 'prerender-manifest.json'), JSON.stringify(manifest));
  saveManifest();
  for (const [index, route] of routes.entries()) fs.writeFileSync(path.join(outputs, `${index}.html`), `<link href="https://blueprint.app.br${route === '/' ? '' : route}" rel="canonical"><meta content="${production ? 'index, follow' : 'noindex, nofollow'}" name="robots">`);
  fs.writeFileSync(path.join(outputs, 'metadata-a.body'), `<urlset>${production ? routes.map(route => `<url><loc>https://blueprint.app.br${route}</loc></url>`).join('') : ''}</urlset>`);
  fs.writeFileSync(path.join(outputs, 'metadata-b.body'), `User-Agent: *\n${production ? 'Allow' : 'Disallow'}: /\n`);
  fs.writeFileSync(path.join(outputs, 'page.js.nft.json'), JSON.stringify({files: ['../../.generated/content.json']}));
  return { directory, outputs, manifest, saveManifest, verify: () => verifyOutput({buildDirectory: directory, routes, production}) };
}

test('output verification follows manifest routes with arbitrarily located artifacts in production and preview', () => {
  for (const production of [true, false]) {
    const f = fixture(production);
    try { assert.equal(fs.existsSync(path.join(f.directory, 'server/app/index.html')), false); f.verify(); }
    finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
  }
});

test('output verification rejects missing routes, dynamic computation and unpublished fallback paths', () => {
  const f = fixture();
  try {
    delete f.manifest.routes['/']; f.saveManifest();
    assert.throws(f.verify, /Missing prerendered route/);
    f.manifest.routes['/'] = {initialRevalidateSeconds: false, compute: 'blocking'}; f.saveManifest();
    assert.throws(f.verify, /Request-time computation/);
    f.manifest.routes['/'].compute = 'static';
    f.manifest.dynamicRoutes['/builds/[slug]'].fallback = null; f.saveManifest();
    assert.throws(f.verify, /Unpublished paths could be generated/);
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});

test('output verification rejects unpublished routes and traced draft sources', () => {
  const f = fixture();
  try {
    f.manifest.routes['/notes/unpublished'] = {initialRevalidateSeconds: false, compute: 'static'}; f.saveManifest();
    assert.throws(f.verify, /Unexpected\/unpublished output route/);
    delete f.manifest.routes['/notes/unpublished']; f.saveManifest();
    fs.writeFileSync(path.join(f.outputs, 'page.js.nft.json'), JSON.stringify({files: ['../../content/en/notes/draft.mdx']}));
    assert.throws(f.verify, /Source content leaked/);
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});

test('output verification still requires rendered HTML, indexing policy, sitemap and traces', () => {
  const f = fixture();
  try {
    const homepage = path.join(f.outputs, '0.html');
    const html = fs.readFileSync(homepage, 'utf8');
    fs.writeFileSync(homepage, html.replace('index, follow', 'noindex, nofollow'));
    assert.throws(f.verify, /Indexing policy/);
    fs.writeFileSync(homepage, html);
    fs.writeFileSync(path.join(f.outputs, 'metadata-a.body'), '<urlset></urlset>');
    assert.throws(f.verify, /Sitemap contains/);
    fs.unlinkSync(homepage);
    assert.throws(f.verify, /Missing rendered canonical output/);
    fs.unlinkSync(path.join(f.outputs, 'page.js.nft.json'));
    assert.throws(f.verify, /Missing output file traces/);
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});
