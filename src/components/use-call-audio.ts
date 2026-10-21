'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { ConnectionState, RoomEvent, Track, type Room } from 'livekit-client';
import { AudioController, type AudioAction } from '@/lib/client/audio-controller';
import type { useMicrophone } from './microphone';
import { playConfirmationTone } from '@/lib/client/call-sounds';
import { readPreferences } from '@/lib/client/preferences';

export function useCallAudio(room: Room, microphone: ReturnType<typeof useMicrophone>, disabled: boolean) {
  const latest = useRef({ microphone, disabled });
  useLayoutEffect(() => { latest.current = { microphone, disabled }; });
  const [state, setState] = useState({ muted: false, combined: false, busy: false });
  const controller = useRef<AudioController | null>(null);
  useLayoutEffect(() => {
    const instance = new AudioController({
    microphone: () => {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      return { enabled: !!publication && !publication.isMuted, device: room.getActiveDevice('audioinput'), track: publication?.track?.mediaStreamTrack.readyState === 'live' ? publication.track.mediaStreamTrack : undefined };
    },
    available: () => room.state === ConnectionState.Connected && !latest.current.disabled && !latest.current.microphone.pending,
    setMicrophone: (enabled, existingOnly) => latest.current.microphone.setEnabled(enabled, existingOnly),
    changed: setState,
    confirmed: (_action, silenced) => { if (room.state === ConnectionState.Connected && readPreferences().confirmationSounds) void playConfirmationTone(room, silenced); },
    });
    controller.current = instance;
    const reset = () => instance.invalidate();
    room.on(RoomEvent.Disconnected, reset).on(RoomEvent.Reconnecting, reset).on(RoomEvent.SignalReconnecting, reset);
    return () => { instance.invalidate(); controller.current = null; room.off(RoomEvent.Disconnected, reset).off(RoomEvent.Reconnecting, reset).off(RoomEvent.SignalReconnecting, reset); };
  }, [room]);
  return { ...state, dispatch: (action: AudioAction) => { void controller.current?.dispatch(action); } };
}
