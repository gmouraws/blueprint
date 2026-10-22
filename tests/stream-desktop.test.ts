import test from 'node:test';
import assert from 'node:assert/strict';
import { streamDesktopCaptureState, streamDesktopUrl } from '../src/lib/client/stream-desktop';
test('desktop URL preserves intent only for approved HTTPS profiles and a validated handoff',()=>{
 const ticket='t'.repeat(43);
 assert.equal(streamDesktopUrl('https://www.blueprint.app.br',ticket,'share'),`blueprint-room://stream?intent=share#invite=${ticket}`);
 assert.match(streamDesktopUrl('https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app',ticket,'watch'),/^blueprint-room-preview:/);
 for(const origin of ['https://attacker.test','http://www.blueprint.app.br','https://www.blueprint.app.br.attacker.test'])assert.throws(()=>streamDesktopUrl(origin,ticket,'share'));
 assert.throws(()=>streamDesktopUrl('https://www.blueprint.app.br','invalid?target=evil','share'));
});


test('native capture lease stays inside the local guard for fresh sessions with server clock skew', () => {
 const now = 1800000000000;
 for (const skew of [-30000, 0, 1000, 30000, 300000]) {
   const sessionExpires = now + 12 * 3600000 + skew;
   const state = streamDesktopCaptureState(true, sessionExpires, now);
   assert.equal(state.available, true);
   assert.ok(Number.isSafeInteger(state.expires));
   assert.ok(state.expires <= now + 60000);
   assert.ok(state.expires <= sessionExpires);
   assert.ok(state.expires <= now + 12 * 3600000);
 }
 assert.equal(streamDesktopCaptureState(true, now + 500, now).expires, now + 500);
 for (const expires of [now, now - 1, NaN, Infinity, now + .5]) assert.deepEqual(streamDesktopCaptureState(true, expires, now), { available: false, expires: 0 });
 assert.deepEqual(streamDesktopCaptureState(false, now + 12 * 3600000, now), { available: false, expires: 0 });
});
