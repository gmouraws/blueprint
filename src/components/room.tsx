'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, ConnectionState, Track, ConnectionError, type Participant } from 'livekit-client';
import { RoomContext, VideoTrack, useAudioPlayback, useConnectionState, useIsMuted, useIsSpeaking, useLocalParticipant, useParticipants, useRoomContext, useTracks } from '@livekit/components-react';
import { MAX_PARTICIPANTS, ROOM_FULL_MESSAGE, type ConnectionDetails } from '@/lib/room';
import { closeCallRoom, prepareCallAudio } from '@/lib/client/call-room';
import { readPreferences, savePreferences } from '@/lib/client/preferences';
import { resumeSounds } from '@/lib/client/call-sounds';
import { Brand, Icon } from './icons';
import { Chat } from './chat';
import { AudioDevices } from './audio-devices';
import { useMicrophone } from './microphone';
import { AudioDiagnostics, IncomingAudio, MembershipSounds, ParticipantQuality, VolumeControl, defaultVolume, type VolumeSetting } from './incoming-audio';

function connectionMessage(error: unknown) {
  if (error instanceof Error && /max.*participants|participants.*exceeded|room.*full/i.test(error.message)) return ROOM_FULL_MESSAGE;
  if (error instanceof ConnectionError && error.status === 401) return 'A autorização expirou. Saia e entre novamente.';
  return 'Não foi possível entrar na sala. Ela pode estar cheia ou indisponível. Saia e tente novamente em instantes.';
}
export default function ConnectedRoom({ room, details, onLeave }: { room: Room; details?: ConnectionDetails; onLeave: (message?: string) => void }) {
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const joinLock = useRef(false);
  const leaving = useRef(false);
  useEffect(() => {
    let active = true;
    leaving.current = false;
    const disconnected = () => { if (active && !leaving.current) setError('A conexão foi encerrada. Saia e entre novamente para tentar reconectar.'); };
    room.on(RoomEvent.Disconnected, disconnected);
    if (details) void room.connect(details.serverUrl, details.token, { autoSubscribe: true }).catch(failure => { if (active) setError(connectionMessage(failure)); });
    const close = () => { void closeCallRoom(room); };
    window.addEventListener('pagehide', close);
    return () => { active = false; leaving.current = true; room.off(RoomEvent.Disconnected, disconnected); window.removeEventListener('pagehide', close); close(); };
  }, [room, details]);
  async function leave() {
    leaving.current = true;
    try { await closeCallRoom(room); } finally { onLeave(); }
  }
  async function joinVoice() {
    if (joinLock.current) return;
    joinLock.current = true; setJoining(true); setError(''); prepareCallAudio(room);
    try {
      const response = await fetch('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) { if (!leaving.current) setError(result.error || 'Não foi possível entrar na voz.'); return; }
      if (!leaving.current) await room.connect(result.serverUrl, result.token, { autoSubscribe: true });
    } catch (failure) { if (!leaving.current) setError(connectionMessage(failure)); }
    finally { joinLock.current = false; if (!leaving.current) setJoining(false); }
  }
  return <RoomContext.Provider value={room}><RoomView error={error} onLeave={leave} onJoin={joinVoice} joining={joining} initialView={details ? 'sala' : 'chat'} /></RoomContext.Provider>;
}

function ParticipantRow({ participant, volume, onVolume }: { participant: Participant; volume: VolumeSetting; onVolume: (setting: VolumeSetting) => void }) {
  const speaking = useIsSpeaking(participant);
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  return <li className={`participant ${speaking ? 'speaking' : ''}`}><div className="participant-identity"><span className="avatar" aria-hidden="true">{(participant.name || '?').slice(0, 2).toUpperCase()}</span><div><strong>{participant.name || 'Participante'}{participant.isLocal && <span className="muted"> · você</span>}</strong><span className="participant-state">{muted ? 'Microfone desligado' : speaking ? 'Falando' : 'Microfone ligado'}</span><ParticipantQuality participant={participant} /></div><Icon name="mic" className={muted ? 'muted' : 'accent'} /></div>{!participant.isLocal && <VolumeControl label={`Voz de ${participant.name || 'participante'}`} setting={volume} onChange={onVolume} />}</li>;
}

export function RoomView({ error = '', onLeave, onJoin, joining = false, initialView = 'sala' }: { error?: string; onLeave: () => void; onJoin?: () => void; joining?: boolean; initialView?: 'sala' | 'chat' }) {
  const room = useRoomContext();
  const state = useConnectionState();
  const participants = useParticipants();
  const connected = state === ConnectionState.Connected;
  const [view, setView] = useState(initialView);
  const [unread, setUnread] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const [notice, setNotice] = useState('');
  const [screenPending, setScreenPending] = useState(false);
  const screenLock = useRef(false);
  const [volumes, setVolumes] = useState<Record<string, VolumeSetting>>({});
  const [screenSetting, setScreenSetting] = useState<VolumeSetting>(() => ({ volume: readPreferences().screenVolume, muted: false }));
  const [sounds, setSounds] = useState(() => readPreferences().sounds);
  const alive = useRef(false);
  const microphone = useMicrophone(room);
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const screenAudios = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true });
  const [selected, setSelected] = useState('');
  const current = screens.find(track => track.publication.trackSid === selected) ?? screens[0];
  const hasScreenAudio = current && screenAudios.some(ref => ref.participant.identity === current.participant.identity && !ref.publication.isMuted);
  const viewer = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const status = connected ? 'Conectado' : state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting ? 'Reconectando…' : state === ConnectionState.Connecting ? 'Conectando…' : 'Desconectado';
  function unlock() { resumeSounds(room); void startAudio().catch(() => setNotice('A reprodução continua bloqueada. Tente “Ativar áudio” novamente e confira as configurações do navegador.')); }
  async function share() {
    if (screenLock.current) return;
    screenLock.current = true; setScreenPending(true); setNotice('');
    try { await localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled, { audio: true, systemAudio: 'include', selfBrowserSurface: 'exclude', resolution: { width: 1920, height: 1080, frameRate: 15 }, contentHint: 'detail' }); }
    catch (failure) { if (alive.current) setNotice(failure instanceof Error && ['NotAllowedError', 'AbortError'].includes(failure.name) ? 'Compartilhamento não iniciado. A seleção foi cancelada ou a permissão não foi concedida.' : 'Não foi possível compartilhar a tela. Confira as permissões e tente novamente.'); }
    finally { if (!alive.current || room.state === ConnectionState.Disconnected) await room.disconnect(true); screenLock.current = false; if (alive.current) setScreenPending(false); }
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await viewer.current?.requestFullscreen(); }
    catch { setNotice('Não foi possível abrir em tela cheia neste navegador.'); }
  }
  return <main className="room-shell">
    <header className="room-header"><Brand /><span className="connection" role="status"><i className={connected ? 'connected-dot' : ''} /><span>Voz: <span>{status}</span></span></span><span className="small-label"><Icon name="lock" /> Sala privada</span></header>
    <div className="room-columns"><aside className="participants-panel"><nav aria-label="Canais"><p className="eyebrow">Texto</p><button className="channel-link" aria-current={view === "chat" ? "page" : undefined} onClick={() => setView("chat")}># geral</button><p className="eyebrow">Voz</p><button className="channel-link" aria-current={view === "sala" ? "page" : undefined} onClick={() => setView("sala")}>Sala principal</button></nav><div className="panel-heading"><h2>Na voz</h2><span className="pill">{connected ? participants.length : '—'} / {MAX_PARTICIPANTS}</span></div><p className="muted side-description">Volumes ajustam apenas o que você ouve.</p><ul className="participants">{participants.filter(participant => participant.identity).map(participant => <ParticipantRow key={participant.identity} participant={participant} volume={volumes[participant.identity] ?? defaultVolume} onVolume={setting => setVolumes(previous => ({ ...previous, [participant.identity]: setting }))} />)}</ul>{!connected && <p className="muted">Você não está conectado à voz.</p>}<div className="sidebar-note"><Icon name="lock" /><p>Voz e tela só entre quem entrou. Sem gravação pelo aplicativo.</p></div></aside>
      <div className="workspace-main"><div className="view-tabs" role="tablist" aria-label="Visualização">{(['sala', 'chat'] as const).map(tab => <button key={tab} role="tab" id={`tab-${tab}`} aria-controls={`panel-${tab}`} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onClick={() => setView(tab)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'sala' : event.key === 'End' ? 'chat' : tab === 'sala' ? 'chat' : 'sala'; setView(next); document.getElementById(`tab-${next}`)?.focus(); } }}>{tab === 'sala' ? 'Sala' : 'Chat'}{tab === 'chat' && unread > 0 && view !== 'chat' && <span className="pill" aria-label={`${unread} mensagens novas`}>{unread > 99 ? '99+' : unread}</span>}</button>)}</div><div className="workspace-notices">
        {error && <p className="error banner" role="alert">{error}</p>}
        {[notice, microphone.notice].filter(Boolean).map(message => <p className="notice banner" role="status" key={message}>{message}</p>)}
        {!canPlayAudio && connected && <button className="audio-unlock" onClick={unlock}>Ativar áudio</button>}
        </div><section className="stage-column" id="panel-sala" role="tabpanel" aria-labelledby="tab-sala" hidden={view !== "sala"}><div className="stage-heading"><div><p className="eyebrow">SALA DE VOZ</p><h1>Sala principal</h1></div><span className="pill">Sem webcam</span></div><div className="screen-viewer" ref={viewer}>{current ? <><div className="viewer-toolbar"><label>Tela de <select aria-label="Escolher tela compartilhada" value={current.publication.trackSid} onChange={event => setSelected(event.target.value)}>{screens.map(track => <option value={track.publication.trackSid} key={track.publication.trackSid}>{track.participant.name || 'Participante'}{track.participant.isLocal ? ' (você)' : ''}</option>)}</select></label><button onClick={fullscreen} aria-label="Alternar tela cheia"><Icon name="expand" /><span>Tela cheia</span></button></div><VideoTrack trackRef={current} muted playsInline className="shared-video" /></> : <div className="viewer-empty"><span className="screen-outline" aria-hidden="true"><Icon name="screen" width="44" height="44" /></span><h2>Nenhuma tela compartilhada</h2><p>Quando alguém compartilhar a tela,<br />ela aparece aqui.</p><span className="empty-caption">A conversa por voz continua sem compartilhar.</span></div>}</div>
        {current && <div className="screen-audio-controls">{current.participant.isLocal ? <p>Sua prévia não reproduz áudio local para evitar eco.</p> : hasScreenAudio ? <VolumeControl label="Áudio da tela selecionada" setting={screenSetting} onChange={setting => { setScreenSetting(setting); savePreferences({ screenVolume: setting.volume }); }} /> : <p>Esta tela não tem uma track de áudio disponível.</p>}</div>}
        <p className="capture-note">O áudio compartilhado depende do navegador, do sistema e da fonte escolhida. Apenas a tela selecionada é ouvida; sua voz permanece separada.</p>
        </section><section id="panel-chat" className="chat-view" role="tabpanel" aria-labelledby="tab-chat" hidden={view !== "chat"}><Chat active={view === "chat"} onUnread={setUnread} /></section><details className="call-settings"><summary>Configurações de áudio</summary><AudioDevices room={room} microphoneBusy={microphone.pending} /><label className="checkbox-label"><input type="checkbox" checked={sounds} onChange={event => { setSounds(event.target.checked); savePreferences({ sounds: event.target.checked }); }} />Sons de entrada e saída</label><p className="muted">Ao silenciar o microfone, a captura fica reservada para reativação rápida. Ao sair, ela é liberada. Volumes individuais valem apenas nesta sessão.</p><AudioDiagnostics canPlay={canPlayAudio} globalMuted={audioMuted} timing={microphone.timing} /></details>
      </div></div>
    <footer className="call-controls"><div className="microphone-controls">{!connected && onJoin && <button className="primary" disabled={joining || state !== ConnectionState.Disconnected} onClick={onJoin}>{joining ? "Entrando…" : "Entrar na voz"}</button>}<button onClick={microphone.toggle} disabled={!connected || microphone.pending} aria-pressed={isMicrophoneEnabled}><Icon name="mic" />{microphone.pending ? 'Ativando…' : isMicrophoneEnabled ? 'Desligar microfone' : 'Ativar microfone'}</button>{microphone.pending && <button onClick={microphone.cancel}>Cancelar ativação</button>}</div>
      <div className="main-controls"><button aria-pressed={audioMuted} onClick={() => setAudioMuted(value => !value)}><Icon name="audio" />{audioMuted ? 'Ouvir áudio' : 'Silenciar áudio'}</button><button className={isScreenShareEnabled ? 'active' : 'primary'} onClick={share} disabled={!connected || screenPending}><Icon name="screen" />{screenPending ? 'Aguarde…' : isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}</button></div><button className="leave" onClick={() => { microphone.stop(); onLeave(); }}><Icon name="leave" />Sair da sala</button></footer>
    <IncomingAudio volumes={volumes} screenIdentity={current?.participant.identity} screenSetting={screenSetting} globalMuted={audioMuted} />
    <MembershipSounds enabled={sounds} muted={audioMuted} />
  </main>;
}
