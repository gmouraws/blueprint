import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Room, ParticipantInfo, TokenVerifier } from 'livekit-server-sdk';
import { admissionService, AdmissionBusy, type Admission, type AdmissionBackend } from '../src/lib/server/voice-admission';
import { roomService, livekitRoomName, RoomFullError } from '../src/lib/server/livekit';
import { fixtureConfig } from './config-fixture';


function fixture() {
  const state = { entries: [] as Admission[], owner: '', fence: true, time: Date.now(), revoked: [] as string[], active: new Map<string, ParticipantInfo[]>() };
  const backend: AdmissionBackend = {
    lock: async owner => { if (state.owner) return false; state.owner = owner; return true; },
    read: async () => structuredClone(state.entries),
    save: async (owner, entries) => { if (!state.fence || state.owner !== owner) return false; state.entries = entries; return true; },
    unlock: async owner => { if (state.owner === owner) state.owner = ''; },
  };
  const client = Object.assign(roomService(fixtureConfig), {
    listRooms: async () => [...state.active.keys()].map(name => new Room({ name })),
    listParticipants: async (name: string) => state.active.get(name) ?? [],
    createRoom: async ({ name }: { name: string }) => { if (!state.active.has(name)) state.active.set(name, []); return new Room({ name, maxParticipants: 8, numParticipants: state.active.get(name)!.length }); },
    removeParticipant: async (name: string, identity: string, options: { revokeTokenTs?: bigint } = {}) => {
      assert.equal(options.revokeTokenTs, BigInt(Math.floor(state.time / 1000) + 30));
      state.revoked.push(identity); state.active.set(name, (state.active.get(name) ?? []).filter(person => person.identity !== identity));
    },
  });
  return { state, api: admissionService(fixtureConfig, backend, client, () => state.time) };
}
const session = () => ({ identity: randomUUID(), nickname: 'Ana' });
test('combined admission cap includes pending tokens in both rooms and rejects concurrent writes', async () => {
  const { state, api } = fixture();
  const attempts = await Promise.allSettled(Array.from({ length: 9 }, () => api.join(session(), 'main')));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(attempts.filter(result => result.status === 'rejected').every(result => result.reason instanceof AdmissionBusy));
  for (let i = 1; i < 8; i++) await api.join(session(), i % 2 ? 'second' : 'main');
  assert.equal(state.entries.length, 8);
  await assert.rejects(api.join(session(), 'second'), RoomFullError);
});
test('switch revokes previous identities before issuing a scoped fresh identity; stale reservations are revoked', async () => {
  const { state, api } = fixture(); const owner = session();
  const first = await api.join(owner, 'main'); const next = await api.join(owner, 'second');
  assert.deepEqual(state.revoked, [first.identity]); assert.notEqual(next.identity, first.identity);
  const claims = await new TokenVerifier(fixtureConfig.LIVEKIT_API_KEY, fixtureConfig.LIVEKIT_API_SECRET).verify(next.token);
  assert.equal(claims.video?.room, livekitRoomName(fixtureConfig, 'second'));
  assert.equal(state.entries.length, 1);
  state.time += 150001;
  await api.join(session(), 'main'); assert.ok(state.revoked.includes(next.identity));
  assert.equal(state.entries.length, 1);
});
test('active occupants survive stale cleanup; a lost lock or unavailable backend never returns a token', async () => {
  const { state, api } = fixture();
  const first = await api.join(session(), 'main');
  state.active.set(livekitRoomName(fixtureConfig, 'main'), [new ParticipantInfo({ identity: first.identity })]);
  state.time += 200000; await api.join(session(), 'second'); assert.equal(state.revoked.length, 0);
  state.fence = false; await assert.rejects(api.join(session(), 'main'), AdmissionBusy);
  assert.equal(state.entries.length, 2);
});
test('unknown active identities count toward capacity and recovered owner cannot occupy both rooms', async () => {
  const { state, api } = fixture(); const owner = session();
  state.active.set(livekitRoomName(fixtureConfig, 'main'), Array.from({ length: 8 }, (_, i) => new ParticipantInfo({ identity: i === 0 ? owner.identity + ':old' : randomUUID() })));
  await assert.rejects(api.join(session(), 'second'), RoomFullError);
  await api.join(owner, 'second'); assert.ok(state.revoked.includes(owner.identity + ':old'));
});
test('leaving cannot revoke another sender or a newer admission', async () => {
  const { state, api } = fixture(); const owner = session(); const other = session();
  const mine = await api.join(owner, 'main'); const theirs = await api.join(other, 'second');
  await api.leave(owner, theirs.identity); assert.equal(state.entries.length, 2);
  await api.leave(owner, mine.identity); assert.deepEqual(state.entries.map(item => item.identity), [theirs.identity]);
});
