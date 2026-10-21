import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { TokenVerifier, RoomConfiguration, ServerError } from 'livekit-server-sdk';
import { viewHandler } from '../src/lib/server/view-handler';
import { createScreenToken, createRoomToken, screenRoomName, livekitRoomName, SCREEN_CONNECTION_LIMIT, roomService } from '../src/lib/server/livekit';
import { randomUUID } from 'node:crypto';
import { COOKIE_NAME, signSession } from '../src/lib/server/session';
import { LimitError } from '../src/lib/server/rate-limit';
import { fixtureConfig as config } from './config-fixture';

const deps = { getConfig: () => config, rateLimit: async () => {}, createScreenToken, roomService };
function request(body: unknown, cookie?: string, origin = config.APP_ORIGIN) {
  return new NextRequest(`${config.APP_ORIGIN}/api/view`, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie: `${COOKIE_NAME}=${cookie}` } : {}) }, body: JSON.stringify(body) });
}
const verifier = new TokenVerifier(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);

test('viewing requires current authentication, an exact origin and an allowlisted room; clients cannot request publishing', async () => {
  const { token } = await signSession('Ana', config);
  for (const cookie of [undefined, 'invalid']) assert.equal((await viewHandler(request({ room: 'second' }, cookie), deps)).status, 401);
  assert.equal((await viewHandler(request({ room: 'second' }, token, 'https://unrelated.test'), deps)).status, 403);
  for (const body of [{ room: 'other' }, { room: 'second', publish: true }, { room: 'main', identity: 'someone' }, {}]) assert.equal((await viewHandler(request(body, token), deps)).status, 400);
  const changedPassword = { ...deps, getConfig: () => ({ ...config, ROOM_PASSWORD: 'changed-password-invalidates-sessions' }) };
  assert.equal((await viewHandler(request({ room: 'second' }, token), changedPassword)).status, 401);
});

test('view grants are hidden, read-only, short-lived and scoped only to the chosen screen transport', async () => {
  const { token, session } = await signSession('Ana', config);
  for (const room of ['main', 'second'] as const) {
    const response = await viewHandler(request({ room }, token), deps);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json(); const claims = await verifier.verify(result.token);
    assert.ok(result.identity.startsWith(session.identity + ':view:'));
    assert.equal(claims.video?.room, screenRoomName(config, room));
    assert.notEqual(claims.video?.room, livekitRoomName(config, room));
    assert.equal(claims.video?.canSubscribe, true);
    assert.equal(claims.video?.hidden, true);
    for (const flag of ['canPublish', 'canPublishData', 'canUpdateOwnMetadata', 'roomAdmin', 'roomCreate', 'roomList', 'roomRecord'] as const) assert.equal(claims.video?.[flag], false);
    const payload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString());
    assert.ok(payload.exp - payload.nbf <= 120);
    assert.equal(RoomConfiguration.fromJson(payload.roomConfig).maxParticipants, SCREEN_CONNECTION_LIMIT);
  }
});

test('voice and screen publishing grants enforce separate sources; no screen-room token can publish a microphone', async () => {
  const { session } = await signSession('Ana', config);
  const voice = await verifier.verify(await createRoomToken(config, session, 'second'));
  const screens = await verifier.verify(await createScreenToken(config, session, 'second', true));
  assert.deepEqual(voice.video?.canPublishSources, ['microphone']);
  assert.deepEqual(screens.video?.canPublishSources, ['screen_share', 'screen_share_audio']);
  assert.equal(screens.video?.canPublish, true); assert.equal(screens.video?.canPublishData, false);
  assert.notEqual(voice.video?.room, screens.video?.room);
});

test('viewer rate limiting and unavailable dependencies fail closed without issuing a token', async () => {
  const { token, session } = await signSession('Ana', config);
  for (const status of [429, 503]) {
    let issued = false;
    const response = await viewHandler(request({ room: 'second' }, token), { ...deps, rateLimit: async (_config, kind, identity) => {
      assert.equal(kind, 'view-token'); assert.equal(identity, session.identity); throw new LimitError(status);
    }, createScreenToken: async () => { issued = true; return 'must-not-be-issued'; } });
    assert.equal(response.status, status); assert.equal(issued, false); assert.equal((await response.json()).token, undefined);
  }
});

test('view cleanup is authenticated and cannot revoke voice publishers or another owner', async () => {
  const { token, session } = await signSession('Ana', config);
  const removed: string[] = [];
  const cleanup = { ...deps, roomService: () => Object.assign(roomService(config), { removeParticipant: async (room: string, identity: string, options?: { revokeTokenTs?: bigint }) => {
    assert.equal(room, screenRoomName(config, 'second')); assert.ok(options?.revokeTokenTs); removed.push(identity);
  } }) };
  const identity = session.identity + ':view:' + randomUUID();
  assert.equal((await viewHandler(request({ room: 'second', identity }), cleanup, true)).status, 401);
  for (const invalid of [randomUUID() + ':view:' + randomUUID(), session.identity + ':screen', session.identity + ':view:invalid']) assert.equal((await viewHandler(request({ room: 'second', identity: invalid }, token), cleanup, true)).status, 400);
  assert.equal((await viewHandler(request({ room: 'second', identity }, token), cleanup, true)).status, 200);
  assert.deepEqual(removed, [identity]);
});

test('viewer cleanup is idempotent for an absent participant but does not hide provider failures', async () => {
  const { token, session } = await signSession('Ana', config);
  const identity = session.identity + ':view:' + randomUUID();
  for (const [code, expected] of [['not_found', 200], ['permission_denied', 503], ['unavailable', 503]] as const) {
    const cleanup = { ...deps, roomService: () => Object.assign(roomService(config), { removeParticipant: async () => { throw new ServerError('Provider error', 'Safe test fixture', 404, code); } }) };
    assert.equal((await viewHandler(request({ room: 'second', identity }, token), cleanup, true)).status, expected);
  }
});
