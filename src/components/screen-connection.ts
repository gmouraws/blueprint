'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import type { ConnectionDetails, VoiceRoomId } from '@/lib/room';
import { connectRoom } from '@/lib/client/connect-room';

export function createScreenRoom() {
  return new Room({ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true });
}

// Each browsing lifetime owns one read-only connection. A cancelled request cannot
// connect later, and the next lifetime waits for its predecessor's full cleanup.
export function useScreenObserver(destination: VoiceRoomId, enabled: boolean) {
  const [connection, setConnection] = useState<{ room: Room; destination: VoiceRoomId } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const cleanup = useRef(Promise.resolve());
  const releases = useRef(new Map<string, VoiceRoomId>());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    const observer = createScreenRoom();
    const previous = cleanup.current;
    let identity: string | undefined;
    const release = async () => {
      for (const [id, room] of releases.current) {
        const response = await fetch('/api/view/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, identity: id }), cache: 'no-store', keepalive: true, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Cleanup unavailable');
        releases.current.delete(id);
      }
    };
    const disconnected = () => { if (!cancelled) setError('A visualização foi desconectada. Sua chamada de voz não mudou.'); };
    observer.on(RoomEvent.Disconnected, disconnected);
    const work = (async () => {
      try {
        await previous;
        if (cancelled) return;
        setError('');
        await release();
        if (cancelled) return;
        setConnection({ room: observer, destination });
        const response = await fetch('/api/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: destination }), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const result: ConnectionDetails & { error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error || 'Visualização indisponível.');
        identity = result.identity;
        if (!cancelled) await connectRoom(observer, result.serverUrl, result.token, 35000, false);
        if (cancelled) await observer.disconnect(true);
      } catch (failure) { if (!cancelled) setError(failure instanceof Error && responseError(failure.message) ? failure.message : 'Não foi possível abrir as telas desta sala. Tente novamente.'); }
    })();
    let closing: Promise<void> | undefined;
    const close = () => {
      if (closing) return closing;
      cancelled = true; controller.abort(); observer.off(RoomEvent.Disconnected, disconnected);
      closing = (async () => {
        await observer.disconnect(true);
        await work.catch(() => undefined);
        await observer.disconnect(true);
        if (identity) releases.current.set(identity, destination);
        await release().catch(() => undefined);
      })();
      return closing;
    };
    window.addEventListener('pagehide', close);
    return () => { window.removeEventListener('pagehide', close); cleanup.current = close(); };
  }, [destination, enabled, attempt]);
  return { room: enabled && connection?.destination === destination ? connection.room : undefined, error: enabled ? error : '', retry: () => setAttempt(value => value + 1) };
}
function responseError(message: string) { return ['Visualização indisponível.', 'Seu acesso expirou.', 'Aguarde antes de abrir'].some(prefix => message.startsWith(prefix)); }

export function useScreenOutput(voice: Room, screen: Room) {
  const [routing, setRouting] = useState<{ room: Room; ready: boolean; error: string } | null>(null);
  useEffect(() => {
    let active = true; let revision = 0;
    const sync = (kind: MediaDeviceKind = 'audiooutput', id = voice.getActiveDevice('audiooutput') || 'default') => {
      if (kind !== 'audiooutput') return;
      const version = ++revision;
      void Promise.resolve().then(async () => {
        if (!active || version !== revision) return;
        setRouting({ room: screen, ready: false, error: '' });
        try {
          if ('setSinkId' in HTMLMediaElement.prototype && !await screen.switchActiveDevice('audiooutput', id)) throw new Error();
          if (active && version === revision) setRouting({ room: screen, ready: true, error: '' });
        } catch {
          if (active && version === revision) setRouting({ room: screen, ready: false, error: 'Não foi possível usar a saída selecionada para a tela. O áudio da tela ficou silenciado; confira a saída nas configurações de áudio.' });
        }
      });
    };
    sync(); voice.on(RoomEvent.ActiveDeviceChanged, sync);
    return () => { active = false; voice.off(RoomEvent.ActiveDeviceChanged, sync); };
  }, [voice, screen]);
  return { ready: routing?.room === screen && routing.ready, error: routing?.room === screen ? routing.error : '' };
}
