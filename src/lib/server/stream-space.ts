import 'server-only';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { AccessToken, ParticipantInfo_State, RoomConfiguration, TrackSource } from 'livekit-server-sdk';
import type { Config } from './config';
import { roomService } from './livekit';
import { STREAM_VIEW_ATTRIBUTE, streamDisplayName } from '../stream-labels';

export const STREAM_COOKIE = 'blueprint_stream';
export const credential = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validCredential = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const streamRoom = (config: Config) => `${config.LIVEKIT_ROOM_NAME}-guest-stream-v1`;
type Invitation = { id: string; hash: string; role: 'watch' | 'share'; expires: number | null; revoked?: boolean; parent?: string; persistent?: true };
type Guest = { hash: string; invite: string; expires: number; label: number; name?: string; identity?: string; issued?: number; attempt?: string; announcement?: 'claimed' | 'sent' | 'failed' };
export type StreamState = { invitations: Invitation[]; guests: Guest[]; sequence: number; persistentId?: string; handoffs?: { hash: string; invite: string; expires: number; name?: string }[] };
export interface StreamStore {
  lock(owner: string): Promise<boolean>;
  read(): Promise<StreamState>;
  save(owner: string, state: StreamState): Promise<boolean>;
  unlock(owner: string): Promise<void>;
}
export class StreamError extends Error { constructor(public status: number, message: string, public code?: 'STREAM_BUSY') { super(message); } }
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
  // Deliberately reproducible only for new owner-managed persistent links. Old random secrets remain unrecoverable.
  const persistentSecret = (invite: Invitation) => createHmac('sha256', config.SESSION_SECRET).update(`blueprint:stream:persistent:v1:${room}:${invite.id}:${invite.role}`).digest('base64url');
  const validLifetime = (invite: Invitation) => invite.persistent === true && invite.expires === null ? invite.hash === digest(persistentSecret(invite)) : typeof invite.expires === 'number' && invite.expires > now();
  const validInvite = (state: StreamState, invite?: Invitation): boolean => !!invite && !invite.revoked && validLifetime(invite) && (!invite.parent || state.invitations.some(parent => parent.id === invite.parent && !parent.revoked && validLifetime(parent)));
  const persistentPair = (state: StreamState) => {
    const share = state.invitations.find(item => item.id === state.persistentId && item.persistent && item.role === 'share');
    const watch = share && state.invitations.find(item => item.parent === share.id && item.persistent && item.role === 'watch');
    return share && watch && validInvite(state, share) && validInvite(state, watch) ? { share, watch } : null;
  };
  const pairSecrets = (pair: NonNullable<ReturnType<typeof persistentPair>>) => ({ share: persistentSecret(pair.share), watch: persistentSecret(pair.watch) });
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
    if (!await store.lock(lock)) throw new StreamError(409, 'Outra entrada está em andamento. Tente novamente.', 'STREAM_BUSY');
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
    publicationSnapshot: async () => {
      const people = await active(); const state = await store.read();
      return people.filter(person => person.tracks.some(track => track.source === TrackSource.SCREEN_SHARE)).map(person => {
        const guest = state.guests.find(item => item.identity === person.identity);
        return { key: guest?.hash ?? person.identity, label: guest?.label ?? 0, name: streamDisplayName(guest?.name), identity: person.identity, authorized: !!guest && guest.expires > now() && validInvite(state, invitation(state, guest)) && invitation(state, guest)?.role === 'share', legacy: !!guest?.announcement };
      });
    },
    announcementViewer: (key: string) => exclusive(async state => {
      await cleanup(state);
      const guest = state.guests.find(item => item.hash === key);
      if (!guest || guest.expires <= now() || !validInvite(state, invitation(state, guest)) || invitation(state, guest)?.role !== 'share') throw new StreamError(401, 'Transmissão indisponível.');
      return newInvite(state, 'watch', Math.min(guest.expires, now() + 3600000), guest.invite);
    }),
    cleanup: () => exclusive(cleanup),
    // Read-only: commands reuse the configured pair and never mint permanent invitations.
    configuredLinks: async () => { const pair = persistentPair(await store.read()); return pair ? pairSecrets(pair) : null; },
    // Each verified Discord interaction gets individual five-minute entry tickets, never a named shared invite.
    discordLinks: (name?: string) => exclusive(async state => {
      await cleanup(state);
      const pair = persistentPair(state); if (!pair) return null;
      if (state.handoffs!.length > 30) throw new StreamError(429, 'Muitas aberturas recentes. Aguarde e tente novamente.');
      const share = credential(), watch = credential();
      for (const [secret, invite] of [[share, pair.share], [watch, pair.watch]] as const) state.handoffs!.push({ hash: digest(secret), invite: invite.id, expires: now() + 300000, name: streamDisplayName(name) });
      return { share, watch };
    }),
    persistent: async (action: 'status' | 'create' | 'copy' | 'rotate' | 'revoke') => {
      if (action === 'rotate' || action === 'revoke') {
        // Commit revocation before a replacement can exist. Provider failure keeps cleanup retryable.
        const pending = await exclusive(async state => {
          const previous = state.invitations.find(item => item.id === state.persistentId);
          if (previous) previous.revoked = true;
          return cleanup(state);
        });
        if (action === 'revoke' || pending) return { active: false, cleanupPending: pending, links: undefined };
      }
      return exclusive(async state => {
        const cleanupPending = await cleanup(state);
        let pair = persistentPair(state);
        if (!pair && (action === 'create' || action === 'rotate') && !cleanupPending) {
          if (state.invitations.length > 30) throw new StreamError(409, 'Revogue convites antigos antes de criar outro.');
          const share: Invitation = { id: randomUUID(), role: 'share', expires: null, persistent: true, hash: '' };
          const watch: Invitation = { id: randomUUID(), role: 'watch', expires: null, persistent: true, parent: share.id, hash: '' };
          share.hash = digest(persistentSecret(share)); watch.hash = digest(persistentSecret(watch));
          state.invitations.push(share, watch); state.persistentId = share.id; pair = { share, watch };
        }
        return { active: !!pair, cleanupPending, links: pair && action !== 'status' ? pairSecrets(pair) : undefined };
      });
    },
    manage: (action: 'list' | 'create' | 'revoke', input?: { role?: Invitation['role']; hours?: number; id?: string }) => exclusive(async state => {
      if (action === 'revoke') {
        const invite = state.invitations.find(item => item.id === input?.id);
        if (invite) invite.revoked = true;
      }
      const cleanupPending = await cleanup(state);
      const created = action === 'create' ? newInvite(state, input!.role!, now() + input!.hours! * 3600000) : undefined;
      return { created, cleanupPending, invitations: state.invitations.filter(item => !item.parent && !item.persistent).map(({ id, role, expires, revoked }) => ({ id, role, expires, revoked: !!revoked })) };
    }),
    exchange: (secret: string, existing?: string) => exclusive(async state => {
      await cleanup(state);
      const ticket = validCredential(secret) ? state.handoffs?.find(item => item.hash === digest(secret) && item.expires > now()) : undefined;
      const invite = validCredential(secret) ? state.invitations.find(item => ticket ? item.id === ticket.invite : item.hash === digest(secret)) : undefined;
      if (!invite || !validInvite(state, invite)) throw new StreamError(401, 'Convite inválido, expirado ou revogado. Peça um novo link ao responsável.');
      if (ticket) state.handoffs = state.handoffs!.filter(item => item !== ticket);
      const previous = existing && validCredential(existing) ? state.guests.find(item => item.hash === digest(existing)) : undefined;
      if (!ticket && previous && previous.invite === invite.id && previous.expires > now()) return { secret: existing!, expires: previous.expires, role: invite.role };
      if (previous) { await revoke(previous); state.guests = state.guests.filter(item => item !== previous); }
      if (state.guests.length >= 128) throw new StreamError(429, 'Muitas entradas recentes. Aguarde e tente novamente.');
      const next = credential(); const expires = Math.min(invite.expires ?? Infinity, now() + 12 * 3600000);
      state.guests.push({ hash: digest(next), invite: invite.id, expires, label: ++state.sequence, name: streamDisplayName(ticket?.name) });
      return { secret: next, expires, role: invite.role };
    }),
    handoff: (secret: string) => exclusive(async state => {
      await cleanup(state);
      const guest = session(state, secret);
      if (state.handoffs!.length >= 32) throw new StreamError(429, 'Muitas aberturas recentes. Aguarde e tente novamente.');
      const next = credential();
      state.handoffs!.push({ hash: digest(next), invite: guest.invite, expires: Math.min(guest.expires, now() + 60000), name: streamDisplayName(guest.name) });
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
      const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { identity: guest.identity, name: streamDisplayName(guest.name) ?? `Visitante ${guest.label}`, ttl: Math.max(1, Math.min(120, Math.floor((guest.expires - now()) / 1000))) });
      token.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: invite.role === 'share', canPublishSources: invite.role === 'share' ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [], canPublishData: false, canUpdateOwnMetadata: false, roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false });
      token.roomConfig = new RoomConfiguration({ name: room, maxParticipants: 8, emptyTimeout: 300, departureTimeout: 30 });
      return { token: await token.toJwt(), serverUrl: config.LIVEKIT_URL, expires: guest.expires, role: invite.role, connectionId: guest.identity.slice(7) };
    }),
    status: (secret: string) => exclusive(async state => { const cleanupPending = await cleanup(state); const guest = session(state, secret); return { expires: guest.expires, role: invitation(state, guest)!.role, cleanupPending }; }),
    // Client SDK confirms an actual video subscription, not selection intent. Store only its SID on this admission.
    viewing: async (secret: string, connectionId: string, trackSid: string | null) => {
      const state = await store.read(); const guest = session(state, secret);
      if (guest.identity !== `stream:${connectionId}`) throw new StreamError(409, 'Conexão de visualização desatualizada.');
      const identity = guest.identity;
      if (trackSid) {
        const people = await active();
        const publisher = people.find(person => person.identity !== identity && person.tracks.some(track => track.sid === trackSid && track.source === TrackSource.SCREEN_SHARE));
        const owner = state.guests.find(item => item.identity === publisher?.identity);
        if (!owner || owner.expires <= now() || !validInvite(state, invitation(state, owner)) || invitation(state, owner)?.role !== 'share') throw new StreamError(400, 'Transmissão indisponível.');
      }
      const current = session(await store.read(), secret);
      if (current.identity !== identity) throw new StreamError(409, 'Conexão de visualização desatualizada.');
      await media.updateParticipant(room, identity, { attributes: { [STREAM_VIEW_ATTRIBUTE]: trackSid ?? '' } });
      return { ok: true };
    },
    // Discovery validates bearer access but never creates a room, token or media admission.
    discover: async (secret: string) => {
      session(await store.read(), secret);
      // Provider discovery must not hold the admission/revocation lock. Re-read
      // access after the network call so an intervening revocation fails closed.
      const people = await active();
      const state = await store.read();
      const guest = session(state, secret);
      const streams = people.flatMap(person => {
        const publisher = state.guests.find(item => item.identity === person.identity);
        if (!publisher || publisher.expires <= now() || !validInvite(state, invitation(state, publisher)) || invitation(state, publisher)?.role !== 'share') return [];
        const screen = person.tracks.find(track => track.source === TrackSource.SCREEN_SHARE);
        const viewers = screen ? people.filter(viewer => viewer.identity !== person.identity && viewer.state === ParticipantInfo_State.ACTIVE && viewer.attributes[STREAM_VIEW_ATTRIBUTE] === screen.sid && state.guests.some(item => item.identity === viewer.identity && item.expires > now() && validInvite(state, invitation(state, item)))).length : 0;
        return screen ? [{ identity: person.identity, sid: screen.sid, label: publisher.label, name: streamDisplayName(publisher.name), viewers }] : [];
      });
      return { expires: guest.expires, role: invitation(state, guest)!.role, streams };
    },
    leave: (secret: string, connectionId: string) => exclusive(async state => { const guest = validCredential(secret) ? state.guests.find(item => item.hash === digest(secret)) : undefined; if (guest?.identity === `stream:${connectionId}`) await revoke(guest); return { ok: true }; }),
    stopped: (secret: string) => exclusive(async state => {
      const guest = session(state, secret);
      const participant = (await active()).find(item => item.identity === guest.identity);
      if (!participant?.tracks.some(track => track.source === TrackSource.SCREEN_SHARE)) { delete guest.attempt; delete guest.announcement; }
      return { ok: true };
    }),
  };
}
