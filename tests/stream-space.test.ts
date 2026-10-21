import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ParticipantInfo, Room, TrackInfo, TrackSource, TokenVerifier } from 'livekit-server-sdk';
import { streamService, streamRoom, credential, digest, type StreamState, type StreamStore } from '../src/lib/server/stream-space';
import { roomService } from '../src/lib/server/livekit';
import { fixtureConfig } from './config-fixture';

function fixture() {
  const state = { data: { invitations: [], guests: [], sequence: 0 } as StreamState, lock: '', fence: true, now: Date.now(), people: [] as ParticipantInfo[], revoked: [] as string[], outage: false };
  const store: StreamStore = {
    lock: async owner => { if (state.lock) return false; state.lock = owner; return true; },
    read: async () => structuredClone(state.data),
    save: async (owner, data) => { if (!state.fence || state.lock !== owner) return false; state.data = structuredClone(data); return true; },
    unlock: async owner => { if (state.lock === owner) state.lock = ''; },
  };
  const media = Object.assign(roomService(fixtureConfig), {
    listRooms: async () => [new Room({ name: streamRoom(fixtureConfig) })],
    listParticipants: async () => state.people,
    createRoom: async () => new Room({ maxParticipants: 8 }),
    removeParticipant: async (_room: string, identity: string, options: { revokeTokenTs: bigint }) => { if (state.outage) throw Error('offline'); assert.equal(options.revokeTokenTs, BigInt(Math.floor(state.now / 1000) + 30)); state.revoked.push(identity); state.people = state.people.filter(p => p.identity !== identity); },
  });
  const api = streamService(fixtureConfig, store, media, () => state.now);
  const invite = async (role: 'share' | 'watch' = 'share') => (await api.manage('create', { role, hours: 1 })).created!;
  const guest = async (role: 'share' | 'watch' = 'share') => { const link = await invite(role); return { link, ...await api.exchange(link.secret) }; };
  return { state, api, invite, guest };
}
test('guest credentials are random hashed capabilities; expiration and revocation reach derived viewer sessions', async () => {
  const { api, state, guest } = fixture(); const one = await guest();
  assert.equal(one.secret.length, 43); assert.notEqual(one.secret, one.link.secret);
  assert.ok(!JSON.stringify(state.data).includes(one.secret)); assert.ok(!JSON.stringify(state.data).includes(one.link.secret));
  await assert.rejects(api.exchange(credential()));
  const joined = await api.join(one.secret);
  state.people.push(new ParticipantInfo({ identity: `stream:${joined.connectionId}`, tracks: [new TrackInfo({ source: TrackSource.SCREEN_SHARE })] }));
  const announcement = await api.announce(one.secret, randomUUID(), true); assert.ok(announcement);
  const viewer = await api.exchange(announcement.viewer.secret); await api.join(viewer.secret);
  await api.manage('revoke', { id: one.link.id });
  await assert.rejects(api.status(one.secret)); await assert.rejects(api.status(viewer.secret)); await assert.rejects(api.exchange(one.link.secret));
  assert.equal(state.revoked.length, 2);
  const next = await guest(); await api.join(next.secret); state.now += 3600001;
  await api.cleanup(); await assert.rejects(api.status(next.secret)); assert.equal(state.data.guests.length, 0);
});
test('one connection publishes and watches, replacing it revokes old tokens; ninth admission and concurrent joins fail', async () => {
  const { api, state, guest } = fixture(); const guests = [];
  for (let i = 0; i < 9; i++) guests.push(await guest(i % 2 ? 'watch' : 'share'));
  for (let i = 0; i < 8; i++) await api.join(guests[i].secret);
  await assert.rejects(api.join(guests[8].secret), /limite de 8/);
  const previous = state.data.guests[0].identity!;
  state.people.push(new ParticipantInfo({ identity: previous }));
  const replacement = await api.join(guests[0].secret); assert.ok(state.revoked.includes(previous));
  assert.equal(state.data.guests.filter(g => g.identity).length, 8);
  await api.leave(guests[0].secret, previous.slice(7)); assert.ok(state.data.guests[0].identity);
  await api.leave(guests[0].secret, replacement.connectionId);
  const raced = await Promise.allSettled([api.join(guests[8].secret), api.join(guests[0].secret)]);
  assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
});
test('token grants exclude microphone, cameras, chat/data/admin and unrelated rooms; watcher cannot publish', async () => {
  const { api, guest } = fixture();
  for (const role of ['watch', 'share'] as const) {
    const person = await guest(role); const joined = await api.join(person.secret);
    const claims = await new TokenVerifier(fixtureConfig.LIVEKIT_API_KEY, fixtureConfig.LIVEKIT_API_SECRET).verify(joined.token);
    assert.equal(claims.video?.room, streamRoom(fixtureConfig)); assert.equal(claims.video?.canPublish, role === 'share');
    assert.deepEqual(claims.video?.canPublishSources, role === 'share' ? ['screen_share', 'screen_share_audio'] : []);
    for (const key of ['canPublishData', 'canUpdateOwnMetadata', 'roomAdmin', 'roomCreate', 'roomList', 'roomRecord'] as const) assert.equal(claims.video?.[key], false);
    assert.equal(claims.roomConfig?.maxParticipants, 8);
  }
});
test('stale reservations, unknown peers, lock fencing and provider failure cannot free capacity unsafely', async () => {
  const { api, state, guest } = fixture(); const person = await guest(); await api.join(person.secret);
  state.now += 150001; const next = await guest(); await api.join(next.secret); assert.equal(state.revoked.length, 1);
  state.people = Array.from({ length: 8 }, () => new ParticipantInfo({ identity: randomUUID() }));
  await assert.rejects(api.join(person.secret), /limite de 8/); state.people = [];
  state.fence = false; await assert.rejects(api.join(person.secret), /proteção/); state.fence = true;
  state.outage = true;
  const result = await api.manage('revoke', { id: next.link.id }); assert.equal(result.cleanupPending, true);
  await assert.rejects(api.status(next.secret)); assert.ok(state.data.guests.some(g => g.hash === digest(next.secret)));
  state.outage = false; assert.equal(await api.cleanup(), false);
});
test('announcement requires real screen publication and is deduplicated across replacement/reconnect; default is disabled', async () => {
  const { api, state, guest } = fixture(); const person = await guest(); const joined = await api.join(person.secret); const attempt = randomUUID();
  assert.equal(await api.announce(person.secret, attempt, true), null);
  state.people = [new ParticipantInfo({ identity: `stream:${joined.connectionId}`, tracks: [new TrackInfo({ sid: 'video-1', source: TrackSource.SCREEN_SHARE })] })];
  assert.equal(await api.announce(person.secret, attempt, false), null);
  const result = await api.announce(person.secret, attempt, true); assert.equal(result?.viewer.role, 'watch');
  state.people[0].tracks[0].sid = 'replacement';
  assert.equal(await api.announce(person.secret, attempt, true), null);
  assert.equal(await api.announce(person.secret, randomUUID(), true), null);
  state.people[0].tracks = []; await api.stopped(person.secret);
  state.people[0].tracks = [new TrackInfo({ source: TrackSource.SCREEN_SHARE })];
  assert.ok(await api.announce(person.secret, randomUUID(), true));
  const viewer = await guest('watch'); await api.join(viewer.secret); await assert.rejects(api.announce(viewer.secret, randomUUID(), true));
});
