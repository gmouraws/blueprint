'use client';

import { useEffect, useId, useState } from 'react';
import { Track, type Participant } from 'livekit-client';
import { useIsMuted, useIsSpeaking, useParticipants } from '@livekit/components-react';
import { VOICE_ROOMS, type VoiceRoomId, type VoiceRoster } from '@/lib/room';
import { Icon } from './icons';
import { defaultVolume, ParticipantQuality, VolumeControl, volumeIdentity, type VolumeSetting } from './incoming-audio';

function MicrophoneState({ muted, name }: { muted: boolean; name: string }) {
  const label = muted ? `${name}: microfone desligado pelo participante` : `${name}: microfone ligado`;
  return <span className={`mic-state ${muted ? 'mic-off' : ''}`} role="img" aria-label={label} title={label}><Icon name={muted ? 'micOff' : 'mic'} /></span>;
}
function ParticipantRow({ participant, volume, onVolume }: { participant: Participant; volume: VolumeSetting; onVolume: (setting: VolumeSetting) => void }) {
  const speaking = useIsSpeaking(participant);
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  const name = participant.name || 'Participante';
  const id = useId();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  return <li className="participant compact-participant">
    <span className={`speaking-dot ${speaking ? 'is-speaking' : ''}`} role="img" aria-label={speaking ? `${name} está falando` : `${name} não está falando`} title={speaking ? 'Falando' : 'Em silêncio'} />
    <strong>{name}{participant.isLocal && <span className="muted"> · você</span>}</strong>
    <MicrophoneState muted={muted} name={name} />
    {!participant.isLocal && volume.muted && <span className="listener-muted" role="img" aria-label={`${name} silenciado apenas para você`} title="Silenciado apenas para você"><Icon name="audioOff" /></span>}
    <button className="icon-button participant-options" popoverTarget={id} aria-label={`Opções de ${name}`} title={`Opções de ${name}`} onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      setPosition({ top: Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - 230)), left: Math.max(12, Math.min(rect.left, window.innerWidth - 270)) });
    }}><Icon name="more" /></button>
    <div id={id} popover="auto" className="participant-popover" style={position}>
      <strong>{name}</strong><ParticipantQuality participant={participant} />
      {!participant.isLocal ? <><VolumeControl label={`Voz de ${name}`} setting={volume} onChange={onVolume} /><p className="muted">Volume e silêncio afetam só o que você ouve.</p></> : <p className="muted">Seu microfone é controlado na barra da chamada.</p>}
      <button className="popover-close" popoverTarget={id} popoverTargetAction="hide">Fechar</button>
    </div>
  </li>;
}
export function VoiceNavigation({ currentRoom, connected, browsing, busy, onBrowse, onJoin, onChat, chatActive, volumes, onVolume }: {
  currentRoom: VoiceRoomId; connected: boolean; browsing: VoiceRoomId; busy: boolean;
  onBrowse: (room: VoiceRoomId) => void; onJoin: (room: VoiceRoomId) => void; onChat: () => void; chatActive: boolean;
  volumes: Record<string, VolumeSetting>; onVolume: (identity: string, value: VolumeSetting) => void;
}) {
  const participants = useParticipants().filter(person => person.identity);
  const [expanded, setExpanded] = useState<Record<VoiceRoomId, boolean>>({ main: currentRoom === 'main', second: currentRoom === 'second' });
  const [roster, setRoster] = useState<VoiceRoster | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { if (connected) queueMicrotask(() => setExpanded(value => ({ ...value, [currentRoom]: true }))); }, [connected, currentRoom]);
  useEffect(() => {
    let alive = true; let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch('/api/voice', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (alive) { setRoster(result.rooms); setUnavailable(false); }
      } catch { if (alive) setUnavailable(true); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(refresh, 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [currentRoom, connected]);
  return <nav aria-label="Canais" className="voice-navigation">
    <p className="eyebrow">Texto</p><button className="channel-link" aria-current={chatActive ? 'page' : undefined} onClick={onChat}># geral</button>
    <p className="eyebrow">Voz · até 8 no total</p>
    {VOICE_ROOMS.map(item => {
      const mine = connected && currentRoom === item.id;
      const members = mine ? participants : roster?.[item.id];
      return <section className={`voice-section ${mine ? 'current-voice' : ''}`} key={item.id} aria-label={item.name}>
        <button className="voice-disclosure" aria-expanded={expanded[item.id]} aria-controls={`members-${item.id}`} onClick={() => setExpanded(value => ({ ...value, [item.id]: !value[item.id] }))}>
          <Icon name="chevron" /><span>{item.name}</span><span className="room-count" aria-label={members ? `${members.length} participantes` : 'Contagem indisponível'}>{members?.length ?? '—'}</span>
          {mine && <span className="sr-only">Sua chamada atual</span>}
        </button>
        <div id={`members-${item.id}`} hidden={!expanded[item.id]}>
          <div className="voice-actions"><button aria-current={!chatActive && browsing === item.id ? 'page' : undefined} onClick={() => onBrowse(item.id)}>Ver sala</button>{!mine ? <button disabled={busy} onClick={() => onJoin(item.id)} aria-label={`Entrar em ${item.name}`}>{busy ? 'Aguarde…' : 'Entrar'}</button> : <span className="muted">Você está aqui</span>}</div>
          <ul className="participants">{mine ? participants.map(person => <ParticipantRow key={person.identity} participant={person} volume={volumes[volumeIdentity(person.identity)] ?? defaultVolume} onVolume={setting => onVolume(volumeIdentity(person.identity), setting)} />) : roster?.[item.id].map(person => <li className="participant compact-participant other-room-member" key={person.identity}><strong>{person.name}</strong><MicrophoneState muted={person.muted} name={person.name} /></li>)}</ul>
          {members?.length === 0 && <p className="room-empty muted">Ninguém na voz</p>}
        </div>
      </section>;
    })}
    {unavailable && <p className="room-empty muted" role="status">Lista das outras salas indisponível.</p>}
  </nav>;
}
