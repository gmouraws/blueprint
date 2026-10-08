import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('production metadata and sitemap publish only real equivalent routes', () => {
  const script = `
    import assert from 'node:assert/strict';
    import {pageMetadata} from './src/lib/seo.ts';
    import {getEntry, publishedEntries} from './src/lib/content.ts';
    import sitemap from './src/app/sitemap.ts';
    import robots from './src/app/robots.ts';
    const e = getEntry('pt-BR','builds','blueprint');
    const m = pageMetadata('pt-BR',e.title,e.summary,'',e);
    assert.equal(m.robots.index,true);
    assert.equal(m.alternates.canonical,'/pt/builds/blueprint');
    assert.equal(m.alternates.languages.en,'/builds/blueprint');
    assert.equal(sitemap().length,12 + publishedEntries().length);
    assert.ok(sitemap().every(e => e.url.startsWith('https://blueprint.app.br')));
    const privacy = pageMetadata('pt-BR','Privacidade','Privacy disclosure','privacy');
    assert.equal(privacy.alternates.canonical,'/pt/privacy');
    assert.equal(privacy.alternates.languages.en,'/privacy');
    for (const path of ['/privacy','/pt/privacy']) {
      const item = sitemap().find(item => item.url === 'https://blueprint.app.br' + path);
      assert.ok(item);
      assert.equal(item.alternates.languages['pt-BR'],'https://blueprint.app.br/pt/privacy');
      assert.equal(item.alternates.languages.en,'https://blueprint.app.br/privacy');
    }
    assert.equal(robots().rules.allow,'/');
  `;
  const result = spawnSync(process.execPath, ['--import','tsx','--input-type=module','-e',script], {encoding:'utf8',env:{...process.env,VERCEL_ENV:'production'}});
  assert.equal(result.status, 0, result.stderr);
});
