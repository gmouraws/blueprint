import { Room } from 'livekit-client';
import { readPreferences } from './preferences';
import { prepareSounds, closeSounds } from './call-sounds';
import { microphoneProcessing } from './microphone-processing';

// Called synchronously in the join gesture, before authentication awaits.
export function createCallRoom(prepareAudio = true) {
  const room = new Room({ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true,
    audioOutput: { deviceId: readPreferences().output },
    audioCaptureDefaults: { deviceId: readPreferences().microphone, ...microphoneProcessing(readPreferences().noiseSuppression, navigator.mediaDevices?.getSupportedConstraints() ?? {}) },
    publishDefaults: { screenShareEncoding: { maxBitrate: 5_000_000, maxFramerate: 30 }, stopMicTrackOnMute: false },
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
