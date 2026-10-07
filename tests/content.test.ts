import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allEntries, validateEntries, revisionOf, publishedEntries, getEntry, translation } from '../src/lib/content';
import { privatePageview } from '../src/lib/analytics';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source = (overrides = '') => `---\nid: NOTE-099\nkind: notes\nlocale: en\nslug: fixture\ntitle: Fixture\nsummary: Fixture summary\npublication: DRAFT\n${overrides}---\n\nDRAFT_SENTINEL_099`;
const file = (s = source()) => ({source:s, locale:'en' as const, kind:'notes' as const, name:'fixture.mdx'});
test('drafts parse but never enter published registry', () => {
  const e = validateEntries([file()]); assert.equal(e[0].publication, 'DRAFT');
  assert.ok(publishedEntries().every(e => e.publication === 'PUBLISHED'));
});
test('duplicate IDs and wrong lifecycle fail', () => {
  assert.throws(() => validateEntries([file(), file()]), /Duplicate/);
  assert.throws(() => validateEntries([file(source('status: LIVE\n'))]), /lifecycle/);
});
test('invalid dates and metadata fail', () => {
  assert.throws(() => validateEntries([file(source('publishedAt: "2026-02-30"\n'))]));
  assert.throws(() => validateEntries([file(source('extra: forbidden\n'))]));
});
test('translated content retains identity and source revision', () => {
  for (const pt of publishedEntries().filter(e => e.locale === 'pt-BR')) {
    const e = translation(pt); assert.ok(e); assert.equal(pt.slug, e.slug); assert.equal(pt.sourceRevision, e.revision); assert.equal(pt.stale, false);
  }
  assert.ok(allEntries().some(e => e.id === 'BUILD-001' && e.locale === 'en'));
});
test('source hashes normalize line endings and detect edits', () => {
  assert.equal(revisionOf('a\r\nb'), revisionOf('a\nb')); assert.notEqual(revisionOf('a'), revisionOf('b'));
});
test('unknown content is unavailable', () => { assert.equal(getEntry('en', 'notes', 'unknown'), undefined); });
test('missing translation is allowed and outdated translations are detected', () => {
  const en = file();
  assert.equal(validateEntries([en]).length, 1);
  const pt = {source: source().replace('locale: en', 'locale: pt-BR').replace('---\n\n', `translationOf: NOTE-099\nsourceRevision: ${revisionOf(en.source)}\n---\n\n`), locale: 'pt-BR' as const, kind: 'notes' as const, name: 'fixture.mdx'};
  assert.equal(validateEntries([en,pt])[1].stale,false);
  assert.equal(validateEntries([{...en,source:en.source+'\nChanged'},pt])[1].stale,true);
  assert.throws(() => validateEntries([pt]), /translation/);
});
test('analytics strips query and hash and refuses custom events', () => {
  assert.equal(privatePageview({type:'pageview', url:'https://blueprint.app.br/notes?secret=value#private'})?.url, 'https://blueprint.app.br/notes');
  assert.equal(privatePageview({type:'event',url:'https://blueprint.app.br/'}), null);
});
test('generation excludes draft body and metadata from the deployment registry', () => {
  fs.mkdirSync('test-results', {recursive:true});
  const directory = fs.mkdtempSync(path.join(process.cwd(), 'test-results', 'content-fixture-'));
  for (const locale of ['en','pt']) for (const kind of ['builds','experiments','notes']) fs.mkdirSync(path.join(directory,'content',locale,kind), {recursive:true});
  fs.writeFileSync(path.join(directory,'content/en/notes/fixture.mdx'), source());
  const result = spawnSync(process.execPath, ['--import',import.meta.resolve('tsx'),path.join(process.cwd(),'scripts/validate-content.ts')], {cwd:directory,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const generated = fs.readFileSync(path.join(directory,'.generated/content.json'),'utf8');
  assert.equal(generated,'[]'); assert.ok(!generated.includes('DRAFT_SENTINEL_099')); assert.ok(!generated.includes('NOTE-099'));
});
