'use client';

import { AudioTrack, useConnectionQualityIndicator, useRoomContext, useTracks } from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track, type Participant, type RemoteParticipant } from 'livekit-client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { incomingVolume } from '@/lib/client/preferences';
import { playMembershipTone, setSoundPolicy } from '@/lib/client/call-sounds';
import { Icon } from './icons';

export type VolumeSetting = { volume: number; muted: boolean };
export const defaultVolume: VolumeSetting = { volume: 100, muted: false };
export const volumeIdentity = (identity: string) => identity.split(':')[0];
export function VolumeControl({ label, setting, onChange }: { label: string; setting: VolumeSetting; onChange: (value: VolumeSetting) => void }) {
  return <div className="volume-control"><label>{label}<input type="range" min="0" max="100" step="5" value={setting.volume} aria-label={label} aria-valuetext={`${setting.volume}%`} onChange={event => onChange({ ...setting, volume: Number(event.target.value) })} /></label><span className="volume-number">{setting.volume}%</span><button aria-label={`${setting.muted ? 'Ouvir' : 'Silenciar'} ${label.toLowerCase()} apenas para mim`} aria-pressed={setting.muted} onClick={() => onChange({ ...setting, muted: !setting.muted })}>{setting.muted ? 'Ouvir' : 'Silenciar para mim'}</button></div>;
}
export function ParticipantQuality({ participant }: { participant: Participant }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const labels: Record<string, string> = { excellent: 'Conexão excelente', good: 'Conexão boa', poor: 'Conexão instável', lost: 'Conexão perdida', unknown: 'Qualidade ainda não informada' };
  return <span className="participant-state">{labels[quality] ?? labels.unknown}</span>;
}
export function IncomingAudio({ volumes, screenIdentity, screenSetting, globalMuted, screenOnly = false }: { volumes: Record<string, VolumeSetting>; screenIdentity?: string; screenSetting: VolumeSetting; globalMuted: boolean; screenOnly?: boolean }) {
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true });
  // Keep subscriptions, but attach no playback element while deafened. The SDK
  // resets DOM muted during attach; omitting renderers also fences new tracks.
  const audible = tracks.filter(ref => !globalMuted && !ref.participant.isLocal && (ref.source === Track.Source.Microphone ? !screenOnly : ref.participant.identity === screenIdentity));
  return <div className="incoming-audio" hidden>{audible.map(ref => {
    const setting = ref.source === Track.Source.Microphone ? volumes[volumeIdentity(ref.participant.identity)] ?? defaultVolume : screenSetting;
    const volume = incomingVolume(globalMuted, setting.muted, setting.volume);
    return <AudioTrack key={`${ref.participant.identity}:${ref.publication.trackSid}`} trackRef={ref} ref={element => { if (element) element.volume = volume; }} volume={volume} data-audio-kind={ref.source} data-audio-owner={ref.participant.identity} />;
  })}</div>;
}
export function MembershipNotifications({ enabled, muted, roomName }: { enabled: boolean; muted: boolean; roomName: string }) {
  const room = useRoomContext();
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const options = useRef({ enabled, muted });
  useLayoutEffect(() => { options.current = { enabled, muted }; setSoundPolicy(room, options.current); }, [room, enabled, muted]);
  function dismiss(id: number) {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    setNotices(current => current.filter(notice => notice.id !== id));
  }
  useEffect(() => {
    const pending = timers.current;
    return () => { for (const timer of pending.values()) clearTimeout(timer); pending.clear(); };
  }, []);
  useEffect(() => {
    let ready = room.state === ConnectionState.Connected;
    let connectedOnce = ready;
    let known = new Set(room.remoteParticipants.keys());
    const notify = (text: string) => {
      const id = ++sequence.current;
      setNotices(current => [...current, { id, text }].slice(-3));
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id);
        setNotices(current => current.filter(notice => notice.id !== id));
      }, 12000));
    };
    const snapshot = () => { known = new Set(room.remoteParticipants.keys()); ready = true; };
    const connected = () => { snapshot(); connectedOnce = true; notify(`Você entrou na ${roomName}.`); void playMembershipTone(room, true); };
    const pause = () => { ready = false; };
    const disconnected = () => {
      pause(); known.clear();
      if (connectedOnce) notify(`Você foi desconectado da ${roomName}.`);
      connectedOnce = false;
    };
    const joined = (participant: RemoteParticipant) => {
      const newIdentity = !known.has(participant.identity); known.add(participant.identity);
      if (newIdentity && ready && room.state === ConnectionState.Connected) {
        notify(`${participant.name || 'Participante'} entrou na ${roomName}.`);
        if (options.current.enabled && !options.current.muted && room.canPlaybackAudio) void playMembershipTone(room, true);
      }
    };
    const left = (participant: RemoteParticipant) => {
      const existed = known.delete(participant.identity);
      if (existed && ready && room.state === ConnectionState.Connected) {
        notify(`${participant.name || 'Participante'} saiu da ${roomName}.`);
        if (options.current.enabled && !options.current.muted && room.canPlaybackAudio) void playMembershipTone(room, false);
      }
    };
    room.on(RoomEvent.Connected, connected).on(RoomEvent.Reconnected, snapshot).on(RoomEvent.Reconnecting, pause).on(RoomEvent.SignalReconnecting, pause).on(RoomEvent.Disconnected, disconnected).on(RoomEvent.ParticipantConnected, joined).on(RoomEvent.ParticipantDisconnected, left);
    return () => { room.off(RoomEvent.Connected, connected).off(RoomEvent.Reconnected, snapshot).off(RoomEvent.Reconnecting, pause).off(RoomEvent.SignalReconnecting, pause).off(RoomEvent.Disconnected, disconnected).off(RoomEvent.ParticipantConnected, joined).off(RoomEvent.ParticipantDisconnected, left); };
  }, [room, roomName]);
  return <div className="membership-notifications" role="log" aria-label="Atividade da sua sala de voz" aria-live="polite" aria-relevant="additions">{notices.map(notice => <div className="membership-notice" key={notice.id}><p>{notice.text}</p><button className="icon-button" onClick={() => dismiss(notice.id)} aria-label={`Dispensar aviso: ${notice.text}`} title="Dispensar aviso"><Icon name="close" /></button></div>)}</div>;
}
export function AudioDiagnostics({ canPlay, globalMuted, timing }: { canPlay: boolean; globalMuted: boolean; timing?: { captureMs: number; publishMs: number; totalMs: number } }) {
  const room = useRoomContext();
  const [counts, setCounts] = useState({ published: 0, subscribed: 0, attached: 0, playing: 0, failures: 0 });
  useEffect(() => {
    let failures = 0;
    const update = () => {
      const publications = [...room.remoteParticipants.values()].flatMap(p => [...p.audioTrackPublications.values()]);
      const elements = publications.flatMap(pub => pub.track?.attachedElements ?? []);
      setCounts({ published: publications.length, subscribed: publications.filter(pub => pub.isSubscribed).length, attached: elements.length, playing: elements.filter(el => !el.paused && !el.muted && el.volume > 0).length, failures });
    };
    const failed = () => { failures++; update(); };
    room.on(RoomEvent.TrackSubscriptionFailed, failed);
    // Only numeric local state; no identities, tokens, URLs, devices or messages are logged.
    const timer = setInterval(update, 1000); update();
    return () => { clearInterval(timer); room.off(RoomEvent.TrackSubscriptionFailed, failed); };
  }, [room]);
  return <details className="audio-diagnostics"><summary>Diagnóstico de áudio</summary><dl><dt>Publicações remotas de áudio</dt><dd>{counts.published}</dd><dt>Tracks recebidas</dt><dd>{counts.subscribed}</dd><dt>Renderers conectados</dt><dd>{counts.attached}</dd><dt>Elementos em reprodução</dt><dd>{counts.playing}</dd><dt>Falhas de assinatura</dt><dd>{counts.failures}</dd><dt>Reprodução no navegador</dt><dd>{canPlay ? 'Liberada' : 'Bloqueada'}</dd><dt>Áudio recebido silenciado</dt><dd>{globalMuted ? 'Ativado' : 'Desativado'}</dd></dl>{timing && <p>Última operação do microfone: {timing.totalMs} ms · captura {timing.captureMs} ms · publicação {timing.publishMs} ms.</p>}<p>Receber dados ou iniciar reprodução não confirma som audível no dispositivo. Confira a saída e os volumes.</p></details>;
}
