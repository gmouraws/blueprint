import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { TokenVerifier, RoomConfiguration, Room } from 'livekit-server-sdk';
import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { handlers, services } from '../src/lib/server/handlers';
import { type Config, configuration, configurationStatus, allowedOrigins } from '../src/lib/server/config';
import { cookieOptions, COOKIE_NAME, passwordMatches, signSession, verifySession, SESSION_SECONDS, REMEMBERED_SESSION_SECONDS } from '../src/lib/server/session';
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
test('malformed URLs fail validation without throwing or revealing their input', () => {
  for (const name of ['APP_ORIGIN', 'LIVEKIT_URL', 'UPSTASH_REDIS_REST_URL'] as const) {
    const values = { ...config, [name]: 'malformed-url-canary' };
    assert.equal(configuration(values).success, false);
    assert.deepEqual(configurationStatus(values), { ready: false, issues: [{ name, status: 'invalid' }] });
  }
});
test('configuration diagnostics contain only known variable names and safe categories', () => {
  const values = { ...config, LIVEKIT_API_SECRET: undefined, ROOM_PASSWORD: 'short-canary', SESSION_SECRET: 'replace-with-session-canary' };
  const status = configurationStatus(values);
  assert.deepEqual(status, { ready: false, issues: [
    { name: 'ROOM_PASSWORD', status: 'invalid' },
    { name: 'SESSION_SECRET', status: 'placeholder' },
    { name: 'LIVEKIT_API_SECRET', status: 'missing' },
  ] });
  for (const value of Object.values(values).filter((value): value is string => !!value)) assert.ok(!JSON.stringify(status).includes(value));
  assert.deepEqual(configurationStatus(config), { ready: true, issues: [] });
  assert.equal(configurationStatus({}).issues.length, 9);
});
test('origin validation remains exact and trusted Preview aliases are accepted independently', async () => {
  for (const APP_ORIGIN of ['https://room.example.test/', 'https://room.example.test/path', 'http://room.example.test', 'https://user:password@room.example.test']) {
    assert.equal(configuration({ ...config, APP_ORIGIN }).success, false);
  }
  const names = ['VERCEL', 'VERCEL_URL', 'VERCEL_BRANCH_URL'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.VERCEL = '1';
    process.env.VERCEL_URL = 'blueprint-deployment.vercel.app';
    process.env.VERCEL_BRANCH_URL = 'blueprint-branch.vercel.app';
    assert.deepEqual(allowedOrigins(config), [config.APP_ORIGIN, 'https://blueprint-deployment.vercel.app', 'https://blueprint-branch.vercel.app']);
    for (const origin of allowedOrigins(config)) assert.equal((await handlers(deps).token(request({}, undefined, origin))).status, 401);
    assert.equal((await handlers(deps).token(request({}, undefined, 'https://untrusted.vercel.app'))).status, 403);
    process.env.VERCEL_URL = 'blueprint-deployment.vercel.app.attacker.test';
    assert.ok(!allowedOrigins(config).includes(`https://${process.env.VERCEL_URL}`));
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
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
  assert.doesNotMatch(cookie, /Max-Age|Expires/i);
  assert.equal(cookieOptions(config).maxAge, undefined);
});
test('remembered login is opt-in, lasts exactly 30 days and remains protected', async () => {
  for (const remember of [false, true]) {
    const response = await handlers(deps).login(request({ nickname: 'Ana', password: config.ROOM_PASSWORD, remember }));
    assert.equal(response.status, 200);
    const token = response.cookies.get(COOKIE_NAME)!.value;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(payload.remember, remember);
    assert.equal(payload.exp - payload.iat, remember ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS);
    const cookie = response.headers.get('set-cookie')!;
    for (const flag of [/HttpOnly/, /Secure/, /SameSite=strict/i, /Path=\//]) assert.match(cookie, flag);
    if (remember) assert.match(cookie, /Max-Age=2592000/); else assert.doesNotMatch(cookie, /Max-Age|Expires/i);
    assert.deepEqual(await response.json(), { nickname: 'Ana' });
  }
  assert.equal((await handlers(deps).login(request({ nickname: 'Ana', password: config.ROOM_PASSWORD, remember: 'true' }))).status, 400);
});
test('both session modes expire at the server boundary, even if the browser retains the cookie', async context => {
  const now = Date.now();
  context.mock.timers.enable({ apis: ['Date'], now });
  for (const remember of [false, true]) {
    context.mock.timers.setTime(now);
    const { token } = await signSession('Ana', config, remember);
    const duration = remember ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS;
    context.mock.timers.tick((duration - 1) * 1000);
    assert.ok(await verifySession(token, config));
    context.mock.timers.tick(1000);
    assert.equal(await verifySession(token, config), null);
    assert.equal((await handlers(deps).token(request({}, token))).status, 401);
  }
});
test('session verifier rejects invalid claims and excessive lifetimes in either mode', async () => {
  const now = Math.floor(Date.now() / 1000);
  const key = createHmac('sha256', config.SESSION_SECRET).update(config.ROOM_PASSWORD).digest();
  const claims = { nickname: 'Ana', sub: '00000000-0000-0000-0000-000000000000', iss: 'blueprint-room', aud: config.LIVEKIT_ROOM_NAME, iat: now, exp: now + SESSION_SECONDS };
  for (const changes of [
    { exp: undefined }, { iat: undefined }, { iat: now + 30 }, { remember: 'true' },
    { remember: false, exp: now + SESSION_SECONDS + 1 }, { remember: true, exp: now + REMEMBERED_SESSION_SECONDS + 1 },
    { exp: now + SESSION_SECONDS + 0.5 }, { aud: 'another-room' }, { nickname: '<script>' },
  ]) {
    const token = await new SignJWT({ ...claims, ...changes }).setProtectedHeader({ alg: 'HS256' }).sign(key);
    assert.equal(await verifySession(token, config), null);
  }
  const legacy = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(key);
  assert.ok(await verifySession(legacy, config));
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
test('password or signing-secret changes deny both session modes before rate limiting or LiveKit', async () => {
  for (const remember of [false, true]) {
    const { token } = await signSession('Ana', config, remember);
    for (const change of [{ ROOM_PASSWORD: 'a-new-shared-password' }, { SESSION_SECRET: 'a-new-signing-secret-long-enough-for-tests' }]) {
      let touched = false;
      const api = handlers({ ...deps, getConfig: () => ({ ...config, ...change }), rateLimit: async () => { touched = true; }, ensureRoom: async () => { touched = true; } });
      assert.equal((await api.token(request({}, token))).status, 401);
      assert.equal(touched, false);
    }
  }
});
test('forgetting access deletes the cookie, even if expired or participant removal fails', async () => {
  const { token, session } = await signSession('Ana', config, true);
  let removals = 0;
  const api = handlers({ ...deps, roomService: () => Object.assign(services.roomService(config), { removeParticipant: async (room: string, identity: string) => {
    assert.equal(room, config.LIVEKIT_ROOM_NAME); assert.equal(identity, session.identity); removals++; throw new Error('offline');
  } }) });
  assert.equal((await api.logout(request({}, token, 'https://attacker.test'))).status, 403);
  for (const value of [token, 'invalid-session', undefined]) {
    const response = await api.logout(request({}, value));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
    assert.equal(response.cookies.get(COOKIE_NAME)?.value, '');
  }
  assert.equal(removals, 1);
  assert.equal((await api.token(request({}))).status, 401);
});
test('remembered sessions keep token rate limits and fail-closed dependency protection', async () => {
  const { token, session } = await signSession('Ana', config, true);
  for (const status of [429, 503]) {
    let livekit = false;
    const api = handlers({ ...deps, rateLimit: async (_config, operation, identity) => {
      assert.equal(operation, 'token'); assert.equal(identity, session.identity); throw new LimitError(status);
    }, ensureRoom: async () => { livekit = true; } });
    assert.equal((await api.token(request({}, token))).status, status);
    assert.equal(livekit, false);
  }
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
test('fixed-room tokens have minimal grants, short TTL and an eight-person recreation cap', async () => {
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
  assert.equal(roomConfig.maxParticipants, 8); assert.equal(roomConfig.name, config.LIVEKIT_ROOM_NAME);
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

test('room creation allows the eighth slot, rejects a full room and rejects incompatible caps', async () => {
  await ensureRoom(config, { createRoom: async options => {
    assert.equal(options.name, config.LIVEKIT_ROOM_NAME); assert.equal(options.maxParticipants, 8);
    return new Room({ maxParticipants: 8, numParticipants: 7 });
  } });
  for (const maxParticipants of [0, 5]) {
    await assert.rejects(ensureRoom(config, { createRoom: async () => new Room({ maxParticipants }) }), /Unsafe room configuration/);
  }
  await assert.rejects(ensureRoom(config, { createRoom: async () => new Room({ maxParticipants: 8, numParticipants: 8 }) }), RoomFullError);
});
