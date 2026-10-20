import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { TokenVerifier, RoomConfiguration, Room } from 'livekit-server-sdk';
import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { handlers, services } from '../src/lib/server/handlers';
import { type Config, configuration } from '../src/lib/server/config';
import { cookieOptions, COOKIE_NAME, passwordMatches, signSession, verifySession } from '../src/lib/server/session';
import { createRoomToken, ensureRoom, RoomFullError } from '../src/lib/server/livekit';
import { LimitError, enforceLimitResults } from '../src/lib/server/rate-limit';
import { encodeMessage, decodeMessage, normalizeNickname, validNickname } from '../src/lib/room';

const config: Config = {
  APP_ORIGIN: 'https://room.example.test', ROOM_PASSWORD: 'test-only-password-not-a-secret', SESSION_SECRET: 'test-only-signing-key-long-enough-for-tests',
  LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'test-api-key', LIVEKIT_API_SECRET: 'test-api-secret-long-enough-for-tests', LIVEKIT_ROOM_NAME: 'test-fixed-room',
  UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only-redis-token',
};
const deps = { ...services, getConfig: () => config, rateLimit: async () => {}, ensureRoom: async () => {} };
function request(body: unknown, token?: string, origin = config.APP_ORIGIN) {
  return new NextRequest(`${config.APP_ORIGIN}/api/token`, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(token ? { cookie: `${COOKIE_NAME}=${token}` } : {}) }, body: JSON.stringify(body) });
}
test('configuration rejects absent values, placeholders and non-Cloud endpoints', () => {
  assert.equal(configuration({}).success, false);
  assert.equal(configuration(config).success, true);
  assert.equal(configuration({ ...config, LIVEKIT_API_SECRET: 'replace-with-project-api-secret' }).success, false);
  assert.equal(configuration({ ...config, LIVEKIT_URL: 'wss://untrusted.test' }).success, false);
});
test('nickname normalization preserves Portuguese and rejects markup/control characters', () => {
  assert.equal(normalizeNickname('  João   Silva  '), 'João Silva');
  for (const invalid of ['a', '<script>', 'Ana\u202e', 'a'.repeat(25)]) assert.equal(validNickname(invalid), false);
});
test('invalid password is rejected and never creates a session cookie', async () => {
  assert.equal(passwordMatches('wrong', config), false);
  const response = await handlers(deps).login(request({ nickname: 'João', password: 'wrong' }));
  assert.equal(response.status, 401); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('successful login sets a signed HttpOnly Secure SameSite session with server identity', async () => {
  const response = await handlers(deps).login(request({ nickname: 'João', password: config.ROOM_PASSWORD }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=strict/i);
  const session = await verifySession(response.cookies.get(COOKIE_NAME)?.value, config);
  assert.ok(session); assert.equal(session.nickname, 'João'); assert.match(session.identity, /^[a-f\d-]{36}$/);
  assert.equal(cookieOptions(config).maxAge, 43200);
});
test('unsigned, altered, expired and password-rotated sessions are rejected', async () => {
  const { token } = await signSession('Ana', config);
  assert.ok(await verifySession(token, config));
  assert.equal(await verifySession(token + 'x', config), null);
  assert.equal(await verifySession(token, { ...config, ROOM_PASSWORD: 'new-long-shared-password' }), null);
  const expired = await new SignJWT({ nickname: 'Ana' }).setProtectedHeader({ alg: 'HS256' }).setSubject('00000000-0000-0000-0000-000000000000').setIssuer('blueprint-room').setAudience(config.LIVEKIT_ROOM_NAME).setIssuedAt(1).setExpirationTime(2).sign(createHmac('sha256', config.SESSION_SECRET).update(config.ROOM_PASSWORD).digest());
  assert.equal(await verifySession(expired, config), null);
});
test('unauthorized token requests cannot call LiveKit', async () => {
  let touched = false;
  const api = handlers({ ...deps, ensureRoom: async () => { touched = true; } });
  assert.equal((await api.token(request({}))).status, 401); assert.equal(touched, false);
});
test('cross-origin requests and unexpected endpoint inputs are rejected', async () => {
  assert.equal((await handlers(deps).login(request({}, undefined, 'https://attacker.test'))).status, 403);
  assert.equal((await handlers(deps).login(request({ nickname: 'Ana', password: config.ROOM_PASSWORD, identity: 'chosen' }))).status, 400);
  assert.equal((await handlers(deps).login(request({ nickname: 'Ana', password: 'x'.repeat(5000) }))).status, 400);
  const { token } = await signSession('Ana', config);
  assert.equal((await handlers(deps).token(request({ room: 'arbitrary' }, token))).status, 400);
});
test('rate limits and unavailable protection fail closed before password validation', async () => {
  for (const status of [429, 503]) {
    const response = await handlers({ ...deps, rateLimit: async () => { throw new LimitError(status); } }).login(request({ nickname: 'Ana', password: config.ROOM_PASSWORD }));
    assert.equal(response.status, status); assert.equal(response.cookies.get(COOKIE_NAME), undefined);
  }
});
test('fixed-room tokens have minimal grants, short TTL and a five-person recreation cap', async () => {
  const { session } = await signSession('Ana', config);
  const jwt = await createRoomToken(config, session);
  const claims = await new TokenVerifier(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).verify(jwt);
  assert.equal(claims.sub, session.identity); assert.equal(claims.name, 'Ana');
  assert.equal(claims.video?.room, config.LIVEKIT_ROOM_NAME); assert.equal(claims.video?.roomJoin, true);
  assert.equal(claims.video?.canPublishData, true); assert.equal(claims.video?.canSubscribe, true);
  assert.deepEqual(claims.video?.canPublishSources, ['microphone', 'screen_share', 'screen_share_audio']);
  for (const flag of ['roomAdmin','roomCreate','roomList','roomRecord','canUpdateOwnMetadata'] as const) assert.equal(claims.video?.[flag], false);
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  assert.ok(payload.exp - payload.nbf <= 120);
  const roomConfig = RoomConfiguration.fromJson(payload.roomConfig);
  assert.equal(roomConfig.maxParticipants, 5); assert.equal(roomConfig.name, config.LIVEKIT_ROOM_NAME);
  assert.equal(roomConfig.agents.length, 0); assert.equal(roomConfig.egress, undefined);
});
test('token issuance checks existing room safety before returning any credentials', async () => {
  const { token } = await signSession('Ana', config);
  const response = await handlers({ ...deps, ensureRoom: async () => { throw new Error('unsafe'); } }).token(request({}, token));
  assert.equal(response.status, 503); assert.equal((await response.json()).token, undefined);
  assert.equal((await handlers({ ...deps, ensureRoom: async () => { throw new RoomFullError(); } }).token(request({}, token))).status, 409);
});
test('authorized token endpoint derives identity and name from session, not request', async () => {
  const { token, session } = await signSession('Ana', config);
  const response = await handlers(deps).token(request({}, token));
  assert.equal(response.status, 200); const body = await response.json();
  assert.equal(body.identity, session.identity); assert.equal(body.nickname, 'Ana');
  assert.ok(body.token); assert.equal(body.serverUrl, config.LIVEKIT_URL);
});
test('chat only accepts bounded plain UTF-8 text, never a supplied sender', () => {
  assert.equal(encodeMessage('  '), null); assert.equal(encodeMessage('á'.repeat(1001)), null);
  assert.equal(decodeMessage(new Uint8Array([255])), null);
  assert.equal(decodeMessage(new Uint8Array(2001)), null);
  assert.equal(decodeMessage(encodeMessage('<b>João</b>')!), '<b>João</b>');
});

test('a successful SDK timeout response is still denied and retry windows are bounded', () => {
  assert.throws(() => enforceLimitResults([{ success: true, reason: 'timeout', reset: 0 }]), (error: unknown) => error instanceof LimitError && error.status === 503);
  assert.throws(() => enforceLimitResults([{ success: false, reset: Date.now() + 60000 }]), (error: unknown) => error instanceof LimitError && error.status === 429 && error.retryAfter > 0);
  assert.doesNotThrow(() => enforceLimitResults([{ success: true, reset: Date.now() + 60000 }]));
});

test('room creation requests five slots and rejects existing unlimited rooms', async () => {
  await ensureRoom(config, { createRoom: async options => {
    assert.equal(options.name, config.LIVEKIT_ROOM_NAME); assert.equal(options.maxParticipants, 5);
    return new Room({ maxParticipants: 5, numParticipants: 0 });
  } });
  await assert.rejects(ensureRoom(config, { createRoom: async () => new Room({ maxParticipants: 0 }) }), /Unsafe room configuration/);
  await assert.rejects(ensureRoom(config, { createRoom: async () => new Room({ maxParticipants: 5, numParticipants: 5 }) }), RoomFullError);
});
