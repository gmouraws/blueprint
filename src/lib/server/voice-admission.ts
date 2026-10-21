import 'server-only';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { TrackSource } from 'livekit-server-sdk';
import type { Config } from './config';
import type { Session } from './session';
import { createRoomToken, ensureRoom, livekitRoomName, roomService, RoomFullError } from './livekit';
import { MAX_PARTICIPANTS, VOICE_ROOMS, type VoiceRoomId, type VoiceRoster } from '../room';

export type Admission = { identity: string; owner: string; room: VoiceRoomId; issued: number };
export class AdmissionBusy extends Error {}
export type AdmissionBackend = {
  lock: (owner: string) => Promise<boolean>;
  read: () => Promise<Admission[]>;
  save: (owner: string, entries: Admission[]) => Promise<boolean>;
  unlock: (owner: string) => Promise<void>;
};
function ledger(config: Config): AdmissionBackend {
  const redis = new Redis({ url: config.UPSTASH_REDIS_REST_URL, token: config.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 }, signal: () => AbortSignal.timeout(5000) });
  const key = `blueprint:${config.LIVEKIT_ROOM_NAME}:voice:v2`;
  return {
    lock: async owner => await redis.set(`${key}:lock`, owner, { nx: true, px: 30000 }) === 'OK',
    read: async () => (await redis.get<Admission[]>(key)) ?? [],
    // Compare and save atomically: an expired mutex never authorizes a late token response.
    save: async (owner, entries) => await redis.eval("if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]); return 1", [`${key}:lock`, key], [owner, JSON.stringify(entries)]) === 1,
    unlock: async owner => { await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [`${key}:lock`], [owner]); },
  };
}
export function admissionService(config: Config, backend = ledger(config), client = roomService(config), now = Date.now) {
  const names = Object.fromEntries(VOICE_ROOMS.map(room => [room.id, livekitRoomName(config, room.id)])) as Record<VoiceRoomId, string>;
  async function participants() {
    const rooms = await client.listRooms(Object.values(names));
    return Object.fromEntries(await Promise.all(VOICE_ROOMS.map(async room => [room.id, rooms.some(item => item.name === names[room.id]) ? await client.listParticipants(names[room.id]) : []]))) as Record<VoiceRoomId, Awaited<ReturnType<typeof client.listParticipants>>>;
  }
  async function revoke(entry: Admission) {
    // Cloud revokes even absent identities. The future cutoff covers clock skew and refreshed tokens.
    // Identities are never reused, so this cutoff cannot block a later legitimate admission.
    await client.removeParticipant(names[entry.room], entry.identity, { revokeTokenTs: BigInt(Math.floor(now() / 1000) + 30) });
  }
  async function exclusive<T>(work: (entries: Admission[]) => Promise<{ entries: Admission[]; result: T }>) {
    const lock = randomUUID();
    if (!await backend.lock(lock)) throw new AdmissionBusy();
    try {
      const entries = await backend.read();
      const result = await work(entries);
      if (!await backend.save(lock, result.entries)) throw new AdmissionBusy();
      return result.result;
    } finally { await backend.unlock(lock); }
  }
  return {
    async join(session: Session, room: VoiceRoomId) {
      return exclusive(async entries => {
        const active = await participants();
        const kept: Admission[] = [];
        for (const entry of entries) {
          const present = active[entry.room].some(person => person.identity === entry.identity);
          if (entry.owner === session.identity || (!present && now() - entry.issued > 150000)) await revoke(entry);
          else kept.push(entry);
        }
        // Unknown active identities still consume a slot; never trust browser presence/heartbeats.
        const known = new Set(entries.map(entry => entry.identity));
        const unknown = VOICE_ROOMS.flatMap(item => active[item.id].filter(person => !known.has(person.identity)).map(person => ({ identity: person.identity, room: item.id })));
        const recovered = unknown.filter(person => person.identity.startsWith(session.identity + ':'));
        for (const person of recovered) await revoke({ ...person, owner: session.identity, issued: now() });
        if (kept.length + unknown.length - recovered.length >= MAX_PARTICIPANTS) throw new RoomFullError();
        await ensureRoom(config, client, room);
        const identity = `${session.identity}:${randomUUID()}`;
        const entry = { identity, owner: session.identity, room, issued: now() };
        const token = await createRoomToken(config, { ...session, identity }, room);
        return { entries: [...kept, entry], result: { token, serverUrl: config.LIVEKIT_URL, identity, nickname: session.nickname, voiceRoom: room } };
      });
    },
    async leave(session: Session, identity?: string) {
      return exclusive(async entries => {
        const mine = entries.filter(entry => entry.owner === session.identity && (!identity || identity === entry.identity));
        for (const entry of mine) await revoke(entry);
        return { entries: entries.filter(entry => !mine.includes(entry)), result: undefined };
      });
    },
    async roster(): Promise<VoiceRoster> {
      const active = await participants();
      return Object.fromEntries(VOICE_ROOMS.map(room => [room.id, active[room.id].map(person => ({ identity: person.identity, name: person.name || 'Participante', muted: !person.tracks.some(track => track.source === TrackSource.MICROPHONE && !track.muted) }))])) as VoiceRoster;
    },
  };
}
