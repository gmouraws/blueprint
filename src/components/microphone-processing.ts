'use client';

import { useEffect, useRef, useState } from 'react';
import { ConnectionState, RoomEvent, Track, type Room } from 'livekit-client';
import { readPreferences, savePreferences } from '@/lib/client/preferences';
import { microphoneProcessing, processingStatus, setMicrophoneDefaults } from '@/lib/client/microphone-processing';

export function useMicrophoneProcessing(room: Room) {
  const [enabled, setEnabled] = useState(() => readPreferences().noiseSuppression);
  const [pending, setPending] = useState(false);
  const [settings, setSettings] = useState<MediaTrackSettings>();
  const [error, setError] = useState('');
  const lock = useRef(false);
  const alive = useRef(false);
  const supported = typeof navigator !== 'undefined' ? navigator.mediaDevices?.getSupportedConstraints() ?? {} : {};
  useEffect(() => {
    alive.current = true;
    const update = () => {
      const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (alive.current) setSettings(track?.readyState === 'live' ? track.getSettings() : undefined);
    };
    queueMicrotask(update);
    room.on(RoomEvent.LocalTrackPublished, update).on(RoomEvent.LocalTrackUnpublished, update).on(RoomEvent.ActiveDeviceChanged, update).on(RoomEvent.Reconnected, update).on(RoomEvent.Disconnected, update);
    return () => { alive.current = false; room.off(RoomEvent.LocalTrackPublished, update).off(RoomEvent.LocalTrackUnpublished, update).off(RoomEvent.ActiveDeviceChanged, update).off(RoomEvent.Reconnected, update).off(RoomEvent.Disconnected, update); };
  }, [room]);
  async function change(value: boolean) {
    if (lock.current || !supported.noiseSuppression) return;
    lock.current = true; setPending(true); setError('');
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    try {
      const constraints = microphoneProcessing(value, supported);
      if (track?.mediaStreamTrack.readyState === 'live') {
        await track.applyConstraints(constraints);
        const actual = track.mediaStreamTrack.getSettings().noiseSuppression;
        if (actual !== undefined && actual !== value && alive.current && room.state === ConnectionState.Connected && track.mediaStreamTrack.readyState === 'live' && room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack === track) {
          // Some browsers accept applyConstraints but require reacquisition.
          // SDK restart preserves mute/sender, stops old capture, and fences a
          // concurrent leave. It does not reconnect or republish the room.
          await track.restartTrack({ ...room.options.audioCaptureDefaults, ...constraints, deviceId: room.getActiveDevice('audioinput') || readPreferences().microphone });
        }
      }
      setMicrophoneDefaults(room, constraints);
      savePreferences({ noiseSuppression: value });
      if (alive.current) { setEnabled(value); setSettings(track?.mediaStreamTrack.readyState === 'live' ? track.mediaStreamTrack.getSettings() : undefined); }
    } catch {
      if (track?.mediaStreamTrack.readyState === 'ended') await track.mute().catch(() => undefined);
      if (alive.current) setError('Não foi possível alterar a supressão. Confira o microfone e tente novamente. A preferência anterior foi mantida.');
    }
    finally { lock.current = false; if (alive.current) setPending(false); }
  }
  return { enabled, pending, supported: !!supported.noiseSuppression, change, status: error || processingStatus(!!supported.noiseSuppression, settings) };
}
