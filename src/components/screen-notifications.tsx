'use client';
import { useEffect, useEffectEvent } from 'react';
import { ConnectionState, type Room } from 'livekit-client';
import { observeScreenStarts } from '@/lib/client/screen-notifications';
import { playScreenTone } from '@/lib/client/call-sounds';

export function ScreenNotifications({ voice, screens, enabled, muted, joined }: { voice: Room; screens: Room; enabled: boolean; muted: boolean; joined: boolean }) {
  const notify = useEffectEvent(() => {
    if (joined && enabled && !muted && voice.state === ConnectionState.Connected) void playScreenTone(voice);
  });
  useEffect(() => observeScreenStarts(screens, () => notify()), [screens]);
  return null;
}
