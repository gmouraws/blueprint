import { Room } from 'livekit-client';
import { readPreferences } from './preferences';
import { prepareSounds, closeSounds } from './call-sounds';

// Called synchronously in the join gesture, before authentication awaits.
export function createCallRoom(prepareAudio = true) {
  const room = new Room({ adaptiveStream: true, dynacast: true,
    audioCaptureDefaults: { deviceId: readPreferences().microphone, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: { screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 }, stopMicTrackOnMute: false },
  });
  // Listening never acquires a microphone. Actual playback failures remain visible in RoomView.
  if (prepareAudio) prepareCallAudio(room);
  return room;
}
export function prepareCallAudio(room: Room) {
  void room.startAudio().catch(() => undefined);
  prepareSounds(room);
}
export function closeCallRoom(room: Room) { closeSounds(room); return room.disconnect(true); }
