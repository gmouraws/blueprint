import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { chatHandlers, chatServices, cleanupHandler } from '../src/lib/server/chat-handlers';
import { COOKIE_NAME, signSession } from '../src/lib/server/session';
import { LimitError } from '../src/lib/server/rate-limit';
import { ChatConflict } from '../src/lib/server/chat-store';

const config = {
  APP_ORIGIN: 'https://room.example.test', ROOM_PASSWORD: 'test-only-password-not-a-secret', SESSION_SECRET: 'test-only-signing-key-long-enough-for-tests',
  LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'test-api-key', LIVEKIT_API_SECRET: 'test-api-secret-long-enough-for-tests', LIVEKIT_ROOM_NAME: 'test-fixed-room',
  UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only-redis-token',
};
function request(method: 'GET' | 'POST', token?: string, body?: object, query = '', origin = config.APP_ORIGIN) {
  return new NextRequest(`${config.APP_ORIGIN}/api/chat${query}`, { method, headers: { origin, 'content-type': 'application/json', ...(token ? { cookie: `${COOKIE_NAME}=${token}` } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
const deps = { ...chatServices, getConfig: () => config, rateLimit: async () => {} };
test('chat rejects absent, altered, expired and password-rotated sessions before storage', async context => {
  let touches = 0;
  const api = chatHandlers({ ...deps, rateLimit: async () => { touches++; }, readChat: async () => { touches++; throw new Error('unreachable'); }, saveChat: async () => { touches++; throw new Error('unreachable'); } });
  const { token } = await signSession('Ana', config, true);
  for (const value of [undefined, token + 'x']) for (const method of ['GET', 'POST'] as const) assert.equal((await api[method](request(method, value))).status, 401);
  const rotated = chatHandlers({ ...deps, getConfig: () => ({ ...config, ROOM_PASSWORD: 'rotated-password-for-tests' }), readChat: async () => { touches++; throw new Error(); } });
  assert.equal((await rotated.GET(request('GET', token))).status, 401);
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() + 2592000001 });
  assert.equal((await api.POST(request('POST', token))).status, 401);
  assert.equal(touches, 0);
});
test('chat derives identity/name on server, rejects spoofed fields and persists before acknowledgement', async () => {
  const { token, session } = await signSession('Ana', config);
  const requestId = randomUUID(); let saved = false;
  const api = chatHandlers({ ...deps, saveChat: async (sender, body, key) => {
    assert.deepEqual(sender, session); assert.equal(body, '<b>Olá</b>'); assert.equal(key, requestId); saved = true;
    return { id: '1', channel: 'geral', senderId: sender.identity, name: sender.nickname, body, createdAt: new Date().toISOString(), own: true };
  } });
  const good = { body: ' <b>Olá</b> ', requestId };
  for (const fields of [{ senderId: randomUUID() }, { name: 'Spoof' }, { createdAt: new Date().toISOString() }, { channel: 'other' }]) assert.equal((await api.POST(request('POST', token, { ...good, ...fields }))).status, 400);
  for (const body of ['', 'á'.repeat(1001), '\0']) assert.equal((await api.POST(request('POST', token, { body, requestId }))).status, 400);
  assert.equal(saved, false);
  const response = await api.POST(request('POST', token, good));
  assert.equal(saved, true); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).message.body, '<b>Olá</b>');
  assert.equal((await api.POST(request('POST', token, good, '', 'https://attacker.test'))).status, 403);
});
test('history validates cursor pagination and remains independent from voice/token issuance', async () => {
  const { token } = await signSession('Ana', config);
  const api = chatHandlers({ ...deps, readChat: async (_session, query) => { assert.deepEqual(query, { after: '0' }); return { messages: [], hasMore: false, serverTime: new Date().toISOString() }; } });
  assert.equal((await api.GET(request('GET', token, undefined, '?after=0'))).status, 200);
  for (const query of ['?after=1&before=2', '?after=-1', '?after=garbage', '?after=1&after=2', '?limit=999', '?after=9999999999999999999']) assert.equal((await api.GET(request('GET', token, undefined, query))).status, 400, query);
});
test('storage errors and rate-limit outages fail honestly without exposing provider data', async () => {
  const { token } = await signSession('Ana', config);
  for (const [failure, status] of [[new Error('secret-provider-canary'), 503], [new ChatConflict(), 409], [new LimitError(429), 429], [new LimitError(503), 503]] as const) {
    const api = chatHandlers({ ...deps, saveChat: async () => { throw failure; } });
    const response = await api.POST(request('POST', token, { body: 'Test', requestId: randomUUID() }));
    assert.equal(response.status, status); assert.ok(!(await response.text()).includes('secret-provider-canary'));
  }
});
test('cleanup requires separate authorization and reports failures', async () => {
  const secret = 'test-only-cron-secret-with-enough-entropy-for-fixture'; let deleted = false;
  const clean = async () => { deleted = true; };
  assert.equal((await cleanupHandler(request('GET'), clean, secret)).status, 401); assert.equal(deleted, false);
  const authorized = new NextRequest(`${config.APP_ORIGIN}/api/chat/cleanup`, { headers: { authorization: `Bearer ${secret}` } });
  assert.equal((await cleanupHandler(authorized, clean, secret)).status, 200); assert.equal(deleted, true);
  assert.equal((await cleanupHandler(authorized, async () => { throw new Error('private'); }, secret)).status, 503);
});
