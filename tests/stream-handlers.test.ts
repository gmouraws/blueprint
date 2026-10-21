import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { streamHandler, streamServices, discordTarget, invitationUrl } from '../src/lib/server/stream-handlers';
import { STREAM_COOKIE, credential, streamService } from '../src/lib/server/stream-space';
import { fixtureConfig } from './config-fixture';
import { LimitError } from '../src/lib/server/rate-limit';
const secret = credential();
const request = (body: object, cookie = '', origin = fixtureConfig.APP_ORIGIN) => new NextRequest(`${fixtureConfig.APP_ORIGIN}/api/stream`, { method: 'POST', headers: { origin, 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
const service = () => ({ ...streamService(fixtureConfig), exchange: async () => ({ secret, expires: Date.now() + 10000, role: 'watch' as const }), join: async () => ({ token: 'test-only-media', serverUrl: fixtureConfig.LIVEKIT_URL, expires: Date.now() + 10000, role: 'watch' as const, connectionId: randomUUID() }), manage: async () => ({ invitations: [], cleanupPending: false, created: undefined }) });
const deps = () => ({ ...streamServices, getConfig: () => fixtureConfig, rateLimit: async () => undefined, verifySession: async () => null, streamService: service });
test('exchange uses a restricted HttpOnly session cookie and never returns the bearer to JavaScript', async () => {
  const response = await streamHandler(request({ action: 'exchange', credential: credential() }), false, deps());
  assert.equal(response.status, 200); const body = await response.text(); assert.ok(!body.includes(secret));
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i); assert.match(cookie, /Path=\/api\/stream/i);
  assert.ok(!cookie.includes('Max-Age')); assert.equal(response.headers.get('cache-control'), 'no-store');
  const secure = deps(); secure.getConfig = () => ({ ...fixtureConfig, APP_ORIGIN: 'https://www.blueprint.app.br' });
  const https = await streamHandler(request({ action: 'exchange', credential: credential() }, '', 'https://www.blueprint.app.br'), false, secure);
  assert.match(https.headers.get('set-cookie')!, /Secure/);
});
test('guest cookies cannot manage invitations; origin, malformed capabilities and rate failures are enforced', async () => {
  assert.equal((await streamHandler(request({ action: 'join' }), false, deps())).status, 401);
  assert.equal((await streamHandler(request({ action: 'join' }, `${STREAM_COOKIE}=${secret}`, 'https://other.invalid'), false, deps())).status, 403);
  assert.equal((await streamHandler(request({ action: 'exchange', credential: 'short' }), false, deps())).status, 400);
  assert.equal((await streamHandler(request({ action: 'list' }, `${STREAM_COOKIE}=${secret}`), true, deps())).status, 401);
  for (const role of ['member', 'owner'] as const) {
    const authorized = { ...deps(), verifySession: async () => ({ identity: 'test-account', nickname: 'Test', sessionId: 'test-session', role }) };
    assert.equal((await streamHandler(request({ action: 'list' }), true, authorized)).status, role === 'owner' ? 200 : 403);
  }
  for (const status of [429, 503]) {
    const limited = deps(); limited.rateLimit = async () => { throw new LimitError(status); };
    assert.equal((await streamHandler(request({ action: 'join' }, `${STREAM_COOKIE}=${secret}`), false, limited)).status, status);
  }
});
test('Discord is opt-in, exact-host only, scoped viewer capability, mention-free and non-blocking', async () => {
  assert.equal(discordTarget({}), null);
  assert.equal(discordTarget({ DISCORD_STREAM_ANNOUNCEMENTS_ENABLED: 'true', DISCORD_STREAM_WEBHOOK_URL: 'https://other.invalid/api/webhooks/1/test' }), null);
  const prior = { enabled: process.env.DISCORD_STREAM_ANNOUNCEMENTS_ENABLED, url: process.env.DISCORD_STREAM_WEBHOOK_URL };
  let sent = 0;
  try {
    process.env.DISCORD_STREAM_ANNOUNCEMENTS_ENABLED = 'true'; process.env.DISCORD_STREAM_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/test-only';
    const mock = deps();
    mock.streamService = () => ({ ...service(), announce: async (_secret: string, _attempt: string, enabled: boolean) => { assert.equal(enabled, true); return { viewer: { id: randomUUID(), secret: credential(), role: 'watch' as const, expires: Date.now() + 10000 }, label: 1 }; } });
    mock.fetch = async (_url, init) => { sent++; const body = JSON.parse(String(init?.body)); assert.deepEqual(body.allowed_mentions, { parse: [] }); assert.match(body.content, /intent=watch#invite=/); assert.ok(!body.content.includes(secret)); return new Response('', { status: 503 }); };
    const response = await streamHandler(request({ action: 'announce', attempt: randomUUID() }, `${STREAM_COOKIE}=${secret}`), false, mock);
    assert.equal(response.status, 200); assert.equal((await response.json()).announcement, 'failed'); assert.equal(sent, 1);
  } finally {
    if (prior.enabled === undefined) delete process.env.DISCORD_STREAM_ANNOUNCEMENTS_ENABLED; else process.env.DISCORD_STREAM_ANNOUNCEMENTS_ENABLED = prior.enabled;
    if (prior.url === undefined) delete process.env.DISCORD_STREAM_WEBHOOK_URL; else process.env.DISCORD_STREAM_WEBHOOK_URL = prior.url;
  }
  const url = new URL(invitationUrl(fixtureConfig.APP_ORIGIN, secret, 'watch'));
  assert.ok(!url.search.includes(secret)); assert.equal(url.hash, `#invite=${secret}`);
});


test('persistent management is owner-only and returns copy links without cache only on explicit operations',async()=>{
 const body={action:'persistent',operation:'copy'};
 assert.equal((await streamHandler(request(body,`${STREAM_COOKIE}=${secret}`),true,deps())).status,401);
 for(const role of ['member','owner'] as const){
  let called=0;const authorized={...deps(),verifySession:async()=>({identity:'test-account',nickname:'Test',sessionId:'test-session',role}),streamService:()=>({...service(),persistent:async()=>{called++;return {active:true,cleanupPending:false,links:{share:'s'.repeat(43),watch:'w'.repeat(43)}};}})};
  const response=await streamHandler(request(body),true,authorized);assert.equal(response.status,role==='owner'?200:403);assert.equal(called,role==='owner'?1:0);
  if(role==='owner'){assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.ok(result.urls.share.includes('intent=share#invite='));assert.ok(result.urls.watch.includes('intent=watch#invite='));}
 }
});
