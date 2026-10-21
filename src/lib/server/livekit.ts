import 'server-only';
import { AccessToken, RoomConfiguration, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { Config } from './config';
import type { Session } from './session';
import { MAX_PARTICIPANTS, type VoiceRoomId } from '../room';

// Version the namespace so tokens from old immutable deployments cannot bypass global admission.
export const livekitRoomName = (config: Config, room: VoiceRoomId) => `${config.LIVEKIT_ROOM_NAME}-v2-${room}`;

export function roomService(config: Config) {
  return new RoomServiceClient(config.LIVEKIT_URL.replace('wss:', 'https:'), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
}
export class RoomFullError extends Error {}
export async function ensureRoom(config: Config, client: Pick<RoomServiceClient, 'createRoom'> = roomService(config), voiceRoom: VoiceRoomId = 'main') {
  const room = await client.createRoom({ name: livekitRoomName(config, voiceRoom), maxParticipants: MAX_PARTICIPANTS, emptyTimeout: 300, departureTimeout: 30 });
  // Do not issue credentials into a room created elsewhere with a different cap.
  if (room.maxParticipants !== MAX_PARTICIPANTS) throw new Error('Unsafe room configuration');
  // Friendly early feedback only; the actual admission cap remains server-enforced.
  if (room.numParticipants >= MAX_PARTICIPANTS) throw new RoomFullError('Room full');
}
export async function createRoomToken(config: Config, session: Session, voiceRoom: VoiceRoomId = 'main') {
  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { identity: session.identity, name: session.nickname, ttl: 120 });
  token.addGrant({ roomJoin: true, room: livekitRoomName(config, voiceRoom), canSubscribe: true, canPublish: true,
    canPublishData: true, canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    canUpdateOwnMetadata: false, roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false });
  // Admission is enforced by LiveKit, including recreation after automatic deletion.
  token.roomConfig = new RoomConfiguration({ name: livekitRoomName(config, voiceRoom), maxParticipants: MAX_PARTICIPANTS, emptyTimeout: 300, departureTimeout: 30 });
  return token.toJwt();
}
