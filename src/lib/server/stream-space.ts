import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { AccessToken, RoomConfiguration, TrackSource } from 'livekit-server-sdk';
import type { Config } from './config';
import { roomService } from './livekit';

export const STREAM_COOKIE = 'blueprint_stream';
export const credential = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validCredential = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const streamRoom = (config: Config) => `${config.LIVEKIT_ROOM_NAME}-guest-stream-v1`;
type Invitation = { id: string; hash: string; role: 'watch' | 'share'; expires: number; revoked?: boolean; parent?: string };
type Guest = { hash: string; invite: string; expires: number; label: number; identity?: string; issued?: number; attempt?: string; announcement?: 'claimed' | 'sent' | 'failed' };
export type StreamState = { invitations: Invitation[]; guests: Guest[]; sequence: number; handoffs?: { hash: string; invite: string; expires: number }[] };
export interface StreamStore {
  lock(owner: string): Promise<boolean>;
  read(): Promise<StreamState>;
  save(owner: string, state: StreamState): Promise<boolean>;
  unlock(owner: string): Promise<void>;
}
export class StreamError extends Error { constructor(public status: number, message: string) { super(message); } }
export function streamStore(config: Config): StreamStore {
  const redis = new Redis({ url: config.UPSTASH_REDIS_REST_URL, token: config.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 }, signal: () => AbortSignal.timeout(5000) });
  const key = `blueprint:${config.LIVEKIT_ROOM_NAME}:guest-stream:v1`;
  return {
    lock: async owner => await redis.set(`${key}:lock`, owner, { nx: true, px: 30000 }) === 'OK',
    read: async () => await redis.get<StreamState>(key) ?? { invitations: [], guests: [], sequence: 0 },
    // Persist revocations until media cleanup succeeds. A lost lock never returns credentials.
    save: async (owner, state) => await redis.eval("if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]); return 1", [`${key}:lock`, key], [owner, JSON.stringify(state)]) === 1,
    unlock: async owner => { await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [`${key}:lock`], [owner]); },
  };
}
export function streamService(config: Config, store = streamStore(config), media = roomService(config), now = Date.now) {
  const room = streamRoom(config);
  const validInvite = (state: StreamState, invite?: Invitation): boolean => !!invite && !invite.revoked && invite.expires > now() && (!invite.parent || state.invitations.some(parent => parent.id === invite.parent && !parent.revoked && parent.expires > now()));
  const invitation = (state: StreamState, guest: Guest) => state.invitations.find(item => item.id === guest.invite);
  function session(state: StreamState, secret: string) {
    const guest = validCredential(secret) ? state.guests.find(item => item.hash === digest(secret)) : undefined;
    if (!guest || guest.expires <= now() || !validInvite(state, invitation(state, guest))) throw new StreamError(401, 'O convite expirou ou foi revogado. Peça um novo link ao responsável.');
    return guest;
  }
  async function revoke(guest: Guest) {
    if (guest.identity) await media.removeParticipant(room, guest.identity, { revokeTokenTs: BigInt(Math.floor(now() / 1000) + 30) });
    delete guest.identity; delete guest.issued; delete guest.attempt; delete guest.announcement;
  }
  async function exclusive<T>(work: (state: StreamState) => Promise<T>) {
    const lock = randomUUID();
    if (!await store.lock(lock)) throw new StreamError(409, 'Outra entrada está em andamento. Tente novamente.');
    try {
      const state = await store.read();
      const result = await work(state);
      if (!await store.save(lock, state)) throw new StreamError(503, 'A proteção do espaço está indisponível.');
      return result;
    } finally { await store.unlock(lock); }
  }
  async function cleanup(state: StreamState) {
    let pending = false;
    state.handoffs = (state.handoffs ?? []).filter(ticket => ticket.expires > now() && validInvite(state, state.invitations.find(item => item.id === ticket.invite)));
    for (const guest of state.guests) if (guest.expires <= now() || !validInvite(state, invitation(state, guest))) {
      try { await revoke(guest); } catch { pending = true; }
    }
    state.guests = state.guests.filter(guest => guest.identity || (guest.expires > now() && validInvite(state, invitation(state, guest))));
    state.invitations = state.invitations.filter(invite => validInvite(state, invite) || state.guests.some(guest => guest.invite === invite.id));
    return pending;
  }
  async function active() {
    return (await media.listRooms([room])).length ? media.listParticipants(room) : [];
  }
  function newInvite(state: StreamState, role: Invitation['role'], expires: number, parent?: string) {
    if (state.invitations.length >= 32) throw new StreamError(409, 'Revogue convites antigos antes de criar outro.');
    const secret = credential(); const invite = { id: randomUUID(), hash: digest(secret), role, expires, parent };
    state.invitations.push(invite);
    return { id: invite.id, secret, expires, role };
  }
  return {
    cleanup: () => exclusive(cleanup),
    manage: (action: 'list' | 'create' | 'revoke', input?: { role?: Invitation['role']; hours?: number; id?: string }) => exclusive(async state => {
      if (action === 'revoke') {
        const invite = state.invitations.find(item => item.id === input?.id);
        if (invite) invite.revoked = true;
      }
      const cleanupPending = await cleanup(state);
      const created = action === 'create' ? newInvite(state, input!.role!, now() + input!.hours! * 3600000) : undefined;
      return { created, cleanupPending, invitations: state.invitations.filter(item => !item.parent).map(({ id, role, expires, revoked }) => ({ id, role, expires, revoked: !!revoked })) };
    }),
    exchange: (secret: string, existing?: string) => exclusive(async state => {
      await cleanup(state);
      const ticket = validCredential(secret) ? state.handoffs?.find(item => item.hash === digest(secret) && item.expires > now()) : undefined;
      const invite = validCredential(secret) ? state.invitations.find(item => ticket ? item.id === ticket.invite : item.hash === digest(secret)) : undefined;
      if (!invite || !validInvite(state, invite)) throw new StreamError(401, 'Convite inválido, expirado ou revogado. Peça um novo link ao responsável.');
      if (ticket) state.handoffs = state.handoffs!.filter(item => item !== ticket);
      const previous = existing && validCredential(existing) ? state.guests.find(item => item.hash === digest(existing)) : undefined;
      if (previous && previous.invite === invite.id && previous.expires > now()) return { secret: existing!, expires: previous.expires, role: invite.role };
      if (previous) { await revoke(previous); state.guests = state.guests.filter(item => item !== previous); }
      if (state.guests.length >= 128) throw new StreamError(429, 'Muitas entradas recentes. Aguarde e tente novamente.');
      const next = credential(); const expires = Math.min(invite.expires, now() + 12 * 3600000);
      state.guests.push({ hash: digest(next), invite: invite.id, expires, label: ++state.sequence });
      return { secret: next, expires, role: invite.role };
    }),
    handoff: (secret: string) => exclusive(async state => {
      await cleanup(state);
      const guest = session(state, secret);
      if (state.handoffs!.length >= 32) throw new StreamError(429, 'Muitas aberturas recentes. Aguarde e tente novamente.');
      const next = credential();
      state.handoffs!.push({ hash: digest(next), invite: guest.invite, expires: Math.min(guest.expires, now() + 60000) });
      return { credential: next };
    }),
    join: (secret: string) => exclusive(async state => {
      await cleanup(state);
      const guest = session(state, secret); const invite = invitation(state, guest)!;
      const people = await active();
      for (const item of state.guests) if (item.identity && (item === guest || (!people.some(p => p.identity === item.identity) && now() - item.issued! > 150000))) await revoke(item);
      const reservations = state.guests.filter(item => item.identity);
      const known = new Set(reservations.map(item => item.identity));
      // One room/connection per admission, regardless of simultaneous publish + watch.
      const unknown = people.filter(person => !known.has(person.identity) && person.identity !== guest.identity);
      // A previous identity was removed above; exclude it from the fresh provider snapshot.
      const currentPeople = unknown.length ? await active() : people;
      if (reservations.length + currentPeople.filter(person => !known.has(person.identity)).length >= 8) throw new StreamError(409, 'O espaço está cheio: limite de 8 pessoas.');
      const created = await media.createRoom({ name: room, maxParticipants: 8, emptyTimeout: 300, departureTimeout: 30 });
      if (created.maxParticipants !== 8) throw new StreamError(503, 'Configuração do espaço indisponível.');
      session(state, secret);
      if (guest.expires - now() < 1000) throw new StreamError(401, 'O convite expirou. Peça um novo link.');
      guest.identity = `stream:${randomUUID()}`; guest.issued = now();
      const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { identity: guest.identity, name: `Visitante ${guest.label}`, ttl: Math.max(1, Math.min(120, Math.floor((guest.expires - now()) / 1000))) });
      token.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: invite.role === 'share', canPublishSources: invite.role === 'share' ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [], canPublishData: false, canUpdateOwnMetadata: false, roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false });
      token.roomConfig = new RoomConfiguration({ name: room, maxParticipants: 8, emptyTimeout: 300, departureTimeout: 30 });
      return { token: await token.toJwt(), serverUrl: config.LIVEKIT_URL, expires: guest.expires, role: invite.role, connectionId: guest.identity.slice(7) };
    }),
    status: (secret: string) => exclusive(async state => { const cleanupPending = await cleanup(state); const guest = session(state, secret); return { expires: guest.expires, role: invitation(state, guest)!.role, cleanupPending }; }),
    leave: (secret: string, connectionId: string) => exclusive(async state => { const guest = validCredential(secret) ? state.guests.find(item => item.hash === digest(secret)) : undefined; if (guest?.identity === `stream:${connectionId}`) await revoke(guest); return { ok: true }; }),
    // A client attempt ID groups track replacement/reconnects. Actual provider publication is required.
    announce: (secret: string, attempt: string, enabled: boolean) => exclusive(async state => {
      const guest = session(state, secret);
      if (invitation(state, guest)!.role !== 'share' || !guest.identity) throw new StreamError(403, 'Transmissão não autorizada.');
      if (!enabled) return null;
      if (guest.announcement || guest.attempt === attempt) return null;
      const participant = (await active()).find(item => item.identity === guest.identity);
      if (!participant?.tracks.some(track => track.source === TrackSource.SCREEN_SHARE)) return null;
      guest.attempt = attempt; guest.announcement = 'claimed';
      const viewer = newInvite(state, 'watch', Math.min(guest.expires, now() + 3600000), guest.invite);
      return { viewer, label: guest.label };
    }),
    stopped: (secret: string) => exclusive(async state => {
      const guest = session(state, secret);
      const participant = (await active()).find(item => item.identity === guest.identity);
      if (!participant?.tracks.some(track => track.source === TrackSource.SCREEN_SHARE)) { delete guest.attempt; delete guest.announcement; }
      return { ok: true };
    }),
  };
}
