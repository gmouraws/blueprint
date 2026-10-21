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
  const snapshot = await api.publicationSnapshot(); assert.equal(snapshot[0].key, digest(one.secret)); assert.equal(snapshot[0].authorized, true); assert.equal(snapshot[0].legacy, false);
  const announcement = await api.announcementViewer(digest(one.secret));
  const viewer = await api.exchange(announcement.secret); await api.join(viewer.secret);
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
test('desktop handoff is single-use, short-lived and preserves parent role/revocation without an admission', async () => {
  const { api, state, guest } = fixture();
  const person = await guest('watch');
  const ticket = await api.handoff(person.secret);
  assert.equal(ticket.credential.length, 43);
  assert.ok(!JSON.stringify(state.data).includes(ticket.credential));
  assert.equal(state.data.guests.filter(g => g.identity).length, 0);
  const native = await api.exchange(ticket.credential);
  assert.equal((await api.status(native.secret)).role, 'watch');
  await assert.rejects(api.exchange(ticket.credential));
  const expired = await api.handoff(person.secret); state.now += 60001;
  await assert.rejects(api.exchange(expired.credential));
  const revoked = await api.handoff(person.secret);
  await api.manage('revoke', { id: person.link.id });
  await assert.rejects(api.exchange(revoked.credential));
  await assert.rejects(api.status(native.secret));
  await assert.rejects(api.handoff(person.secret));
});


test('persistent pair is explicit, reproducible only server-side, role-separated, and keeps short sessions/tokens', async () => {
  const { api, state, guest } = fixture(); const expiring = await guest('watch');
  assert.equal(await api.configuredLinks(), null);
  const created = await api.persistent('create'); assert.equal(created.active, true); assert.ok(created.links);
  const links = created.links!;assert.notEqual(links.share, links.watch);
  assert.ok(!JSON.stringify(state.data).includes(links.share));assert.ok(!JSON.stringify(state.data).includes(links.watch));
  const size = state.data.invitations.length;
  assert.deepEqual(await api.configuredLinks(), links);assert.deepEqual((await api.persistent('copy')).links,links);
  assert.equal(state.data.invitations.length,size);assert.equal((await api.persistent('status')).links,undefined);
  assert.equal(state.data.invitations.find(i=>i.id===expiring.link.id)!.expires,expiring.link.expires);
  state.now += 8*24*3600000;
  const share = await api.exchange(links.share), watch = await api.exchange(links.watch);
  assert.equal(share.expires,state.now+12*3600000);assert.equal(watch.role,'watch');
  const joined = await api.join(share.secret);const claims = await new TokenVerifier(fixtureConfig.LIVEKIT_API_KEY,fixtureConfig.LIVEKIT_API_SECRET).verify(joined.token);
  assert.ok(claims.exp! <= Math.floor(Date.now()/1000)+120);assert.ok(claims.exp! > Math.floor(Date.now()/1000));assert.deepEqual(claims.video?.canPublishSources,['screen_share','screen_share_audio']);
  state.people=[new ParticipantInfo({identity:`stream:${joined.connectionId}`,tracks:[new TrackInfo({source:TrackSource.SCREEN_SHARE})]})];
  const announcement=await api.announcementViewer(digest(share.secret));assert.equal(announcement.role,'watch');assert.notEqual(announcement.secret,links.share);
  const viewer=await api.exchange(announcement.secret);await api.join(viewer.secret);
  await api.persistent('revoke');assert.equal(await api.configuredLinks(),null);
  await assert.rejects(api.exchange(links.share));await assert.rejects(api.exchange(links.watch));await assert.rejects(api.status(viewer.secret));assert.ok(state.revoked.length>=2);
});

test('rotation commits revocation first; provider failure never returns a replacement, and key rotation fails closed', async () => {
  const {api,state}=fixture();const old=(await api.persistent('create')).links!;const guest=await api.exchange(old.share);await api.join(guest.secret);
  state.outage=true;const failed=await api.persistent('rotate');assert.equal(failed.cleanupPending,true);assert.equal(failed.links,undefined);assert.equal(await api.configuredLinks(),null);await assert.rejects(api.exchange(old.share));
  state.outage=false;const replacement=(await api.persistent('create')).links!;assert.notEqual(replacement.share,old.share);await assert.rejects(api.exchange(old.share));
  const next=(await api.persistent('rotate')).links!;assert.notEqual(next.share,replacement.share);await assert.rejects(api.exchange(replacement.watch));
  // A persistent hash cannot validate with a different environment key.
  const other=streamService({...fixtureConfig,SESSION_SECRET:'a-different-key-that-is-at-least-thirty-two-characters'},{lock:async()=>true,read:async()=>structuredClone(state.data),save:async()=>true,unlock:async()=>{}});
  assert.equal(await other.configuredLinks(),null);await assert.rejects(other.exchange(next.share));
});
