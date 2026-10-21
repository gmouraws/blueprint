import test from 'node:test';
import assert from 'node:assert/strict';
import { streamDesktopUrl } from '../src/lib/client/stream-desktop';
test('desktop URL preserves intent only for approved HTTPS profiles and a validated handoff',()=>{
 const ticket='t'.repeat(43);
 assert.equal(streamDesktopUrl('https://www.blueprint.app.br',ticket,'share'),`blueprint-room://stream?intent=share#invite=${ticket}`);
 assert.match(streamDesktopUrl('https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app',ticket,'watch'),/^blueprint-room-preview:/);
 for(const origin of ['https://attacker.test','http://www.blueprint.app.br','https://www.blueprint.app.br.attacker.test'])assert.throws(()=>streamDesktopUrl(origin,ticket,'share'));
 assert.throws(()=>streamDesktopUrl('https://www.blueprint.app.br','invalid?target=evil','share'));
});
