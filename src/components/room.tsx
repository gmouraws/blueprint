'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, ConnectionState, Track } from 'livekit-client';
import { RoomContext, useAudioPlayback, useConnectionState, useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { VOICE_ROOMS, type ConnectionDetails, type VoiceRoomId } from '@/lib/room';
import { closeCallRoom, prepareCallAudio } from '@/lib/client/call-room';
import { connectRoom, VoiceConnectionTimeout } from '@/lib/client/connect-room';
import { readPreferences, savePreferences } from '@/lib/client/preferences';
import { playMembershipTone, resumeSounds } from '@/lib/client/call-sounds';
import { Brand, Icon } from './icons';
import { Chat } from './chat';
import { AudioDevices } from './audio-devices';
import { useMicrophone } from './microphone';
import { AudioDiagnostics, IncomingAudio, MembershipSounds, VolumeControl, type VolumeSetting } from './incoming-audio';
import { VoiceNavigation } from './voice-navigation';
import { SCREEN_QUALITIES, type ScreenQuality } from './screen-quality';
import { ScreenViewer } from './screen-viewer';
import { ControlMenu } from './control-menu';
import { CallAudioControls } from './call-audio-controls';

async function post(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a voz.');
  return result;
}
export default function ConnectedRoom({ room, details, onLeave }: { room: Room; details?: ConnectionDetails; onLeave: (message?: string) => void }) {
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<VoiceRoomId>(details?.voiceRoom ?? 'main');
  const admission = useRef(details?.identity);
  const joinLock = useRef(false);
  const leaving = useRef(false);
  const intentionalDisconnect = useRef(false);
  useEffect(() => {
    let active = true; leaving.current = false;
    const disconnected = () => { if (active && !leaving.current && !intentionalDisconnect.current) setError('A conexão foi encerrada. Você pode entrar na voz novamente.'); };
    room.on(RoomEvent.Disconnected, disconnected);
    if (details) void connectRoom(room, details.serverUrl, details.token).catch(failure => { if (active) setError(failure instanceof VoiceConnectionTimeout ? 'A conexão de voz demorou demais. Confira sua rede e tente novamente. O chat continua disponível.' : 'Não foi possível entrar na voz. Tente novamente.'); });
    const close = () => { void closeCallRoom(room); };
    window.addEventListener('pagehide', close);
    return () => { active = false; leaving.current = true; room.off(RoomEvent.Disconnected, disconnected); window.removeEventListener('pagehide', close); close(); };
  }, [room, details]);
  async function leave() {
    if (joinLock.current) return;
    joinLock.current = true; leaving.current = true;
    const wasConnected = room.state === ConnectionState.Connected;
    await room.disconnect(true);
    if (wasConnected) await playMembershipTone(room, false);
    let message = '';
    try { if (admission.current) await post('/api/voice/leave', { identity: admission.current }); }
    catch { message = 'A mídia foi desconectada. A vaga será liberada após a verificação do servidor.'; }
    finally { await closeCallRoom(room); onLeave(message); }
  }
  async function joinVoice(destination: VoiceRoomId) {
    if (joinLock.current || leaving.current || ![ConnectionState.Disconnected, ConnectionState.Connected].includes(room.state) || (room.state === ConnectionState.Connected && destination === currentRoom)) return;
    joinLock.current = true; intentionalDisconnect.current = true; setJoining(true); setError(''); prepareCallAudio(room);
    try {
      await room.disconnect(true);
      if (leaving.current) return;
      const result: ConnectionDetails = await post('/api/token', { room: destination });
      admission.current = result.identity;
      if (!leaving.current) { setCurrentRoom(destination); await connectRoom(room, result.serverUrl, result.token); }
    } catch (failure) { if (!leaving.current) setError(failure instanceof VoiceConnectionTimeout ? 'A conexão de voz demorou demais. Confira sua rede e tente novamente. O chat continua disponível.' : 'Não foi possível entrar na voz. A sala pode estar cheia ou indisponível. Tente novamente.'); }
    finally { intentionalDisconnect.current = false; joinLock.current = false; if (!leaving.current) setJoining(false); }
  }
  return <RoomContext.Provider value={room}><RoomView error={error} onLeave={leave} onJoin={joinVoice} joining={joining} currentRoom={currentRoom} initialView={details ? 'sala' : 'chat'} /></RoomContext.Provider>;
}

export function RoomView({ error = '', onLeave, onJoin, joining = false, currentRoom = 'main', initialView = 'sala' }: {
  error?: string; onLeave: () => void; onJoin?: (room: VoiceRoomId) => void; joining?: boolean; currentRoom?: VoiceRoomId; initialView?: 'sala' | 'chat';
}) {
  const room = useRoomContext();
  const state = useConnectionState();
  const connected = state === ConnectionState.Connected;
  const voiceBusy = joining || (!connected && state !== ConnectionState.Disconnected);
  const [view, setView] = useState(initialView);
  const [browsing, setBrowsing] = useState(currentRoom);
  const [unread, setUnread] = useState(0);
  const [audioMuted, setAudioMuted] = useState(false);
  const [notice, setNotice] = useState('');
  const [screenPending, setScreenPending] = useState(false);
  const [quality, setQuality] = useState<ScreenQuality>('balanced');
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
  const [miniHidden, setMiniHidden] = useState(false);
  const current = connected ? screens.find(track => track.publication.trackSid === selected) ?? screens[0] : undefined;
  const hasScreenAudio = current && screenAudios.some(ref => ref.participant.identity === current.participant.identity && !ref.publication.isMuted);
  const viewedRoom = useRef(currentRoom);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (viewedRoom.current === currentRoom) return;
    viewedRoom.current = currentRoom;
    queueMicrotask(() => { setBrowsing(currentRoom); setSelected(''); setMiniHidden(false); });
  }, [currentRoom]);
  const status = joining ? 'Trocando de sala…' : connected ? 'Conectado' : state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting ? 'Reconectando…' : state === ConnectionState.Connecting ? 'Conectando…' : 'Desconectado';
  const name = (id: VoiceRoomId) => VOICE_ROOMS.find(item => item.id === id)!.name;
  function unlock() { resumeSounds(room); void startAudio().catch(() => setNotice('A reprodução continua bloqueada. Confira as configurações do navegador.')); }
  function enter(destination: VoiceRoomId) { microphone.stop(); setNotice(''); setSelected(''); setMiniHidden(false); setBrowsing(destination); onJoin?.(destination); }
  async function share() {
    if (screenLock.current) return;
    screenLock.current = true; setScreenPending(true); setNotice('');
    const target = SCREEN_QUALITIES[quality];
    try {
      await localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled, {
        audio: true, systemAudio: 'include', selfBrowserSurface: 'exclude',
        resolution: { width: target.width, height: target.height, frameRate: target.frameRate }, contentHint: quality === 'balanced' ? 'detail' : 'motion',
      }, { screenShareEncoding: { maxBitrate: target.bitrate, maxFramerate: target.frameRate }, degradationPreference: 'balanced' });
    } catch (failure) {
      if (alive.current) setNotice(failure instanceof Error && ['NotAllowedError', 'AbortError'].includes(failure.name) ? 'Compartilhamento não iniciado. A seleção foi cancelada ou a permissão não foi concedida.' : 'Não foi possível compartilhar nessa qualidade. Tente 1080p / 30 fps ou outra fonte no seletor.');
    } finally { if (!alive.current || room.state === ConnectionState.Disconnected) await room.disconnect(true); screenLock.current = false; if (alive.current) setScreenPending(false); }
  }
  const mini = view === 'chat';
  const showStream = !!current && (mini ? !miniHidden : browsing === currentRoom);
  const audioControls = { enabled: isMicrophoneEnabled, pending: microphone.pending, disabled: !connected || joining, muted: audioMuted, onMicrophone: microphone.toggle, onCancel: microphone.cancel, onListening: () => setAudioMuted(value => !value) };
  function changeScreenVolume(setting: VolumeSetting) { setScreenSetting(setting); savePreferences({ screenVolume: setting.volume }); }
  return <main className="room-shell">
    <header className="room-header"><Brand /><span className="connection" role="status"><i className={connected ? 'connected-dot' : ''} /><span>Voz: <span>{status}</span>{connected && ' · ' + name(currentRoom)}</span></span><span className="small-label"><Icon name="lock" /> Sala privada</span></header>
    <div className="room-columns"><aside className="participants-panel"><VoiceNavigation currentRoom={currentRoom} connected={connected} browsing={browsing} busy={voiceBusy || screenPending || microphone.pending} onBrowse={destination => { setBrowsing(destination); setView('sala'); }} onJoin={enter} onChat={() => setView('chat')} chatActive={view === 'chat'} volumes={volumes} onVolume={(identity, value) => setVolumes(previous => ({ ...previous, [identity]: value }))} /></aside>
      <div className="workspace-main"><div className="view-tabs" role="tablist" aria-label="Visualização">{(['sala', 'chat'] as const).map(tab => <button key={tab} role="tab" id={'tab-' + tab} aria-controls={'panel-' + tab} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onClick={() => setView(tab)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'sala' : event.key === 'End' ? 'chat' : tab === 'sala' ? 'chat' : 'sala'; setView(next); document.getElementById('tab-' + next)?.focus(); } }}>{tab === 'sala' ? 'Sala' : 'Chat'}{tab === 'chat' && unread > 0 && view !== 'chat' && <span className="pill" aria-label={unread + ' mensagens novas'}>{unread > 99 ? '99+' : unread}</span>}</button>)}</div>
        <div className="workspace-notices">{error && <p className="error banner" role="alert">{error}</p>}{[notice, microphone.notice].filter(Boolean).map(message => <p className="notice banner" role="status" key={message}>{message}</p>)}{!canPlayAudio && connected && <button className="audio-unlock" onClick={unlock}>Ativar áudio</button>}</div>
        <div className={'media-chat-layout ' + (mini ? 'chat-layout' : '')}>
          <section className={mini ? 'stream-mini' : 'stage-column'} id="panel-sala" role={mini ? 'region' : 'tabpanel'} aria-label={mini ? 'Tela em mini-player' : undefined} aria-labelledby={mini ? undefined : 'tab-sala'} hidden={mini && !showStream}>
            {!mini && <div className="stage-heading"><h1>{name(browsing)}</h1>{(!connected || browsing !== currentRoom) && <button disabled={voiceBusy || screenPending || microphone.pending} onClick={() => enter(browsing)}>Entrar nesta voz</button>}</div>}
            {showStream ? <ScreenViewer current={current!} screens={screens} mini={mini} hasAudio={!!hasScreenAudio} setting={screenSetting} onSetting={changeScreenVolume} onSelect={setSelected} onExpand={() => { setBrowsing(currentRoom); setView('sala'); }} onHide={() => setMiniHidden(true)} onNotice={setNotice} audioControls={audioControls} /> : <div className="screen-viewer"><div className="viewer-empty"><Icon name="screen" width="36" height="36" /><h2>{browsing !== currentRoom || !connected ? 'Você está apenas visualizando esta sala' : 'Nenhuma tela compartilhada'}</h2><p>{browsing !== currentRoom || !connected ? 'Entre na voz para ouvir e ver os compartilhamentos.' : 'As telas compartilhadas aparecem aqui.'}</p></div></div>}
          </section>
          <section id="panel-chat" className="chat-view" role="tabpanel" aria-labelledby="tab-chat" hidden={view !== 'chat'}><Chat active={view === 'chat'} onUnread={setUnread} />{mini && miniHidden && current && <button className="show-mini" onClick={() => setMiniHidden(false)}>Mostrar mini-player</button>}</section>
        </div>
      </div></div>
    <footer className="call-controls"><div className="microphone-controls">{!connected && onJoin && <button className="primary" disabled={joining || state !== ConnectionState.Disconnected} onClick={() => enter(browsing)}>{joining ? 'Entrando…' : 'Entrar na voz'}</button>}<CallAudioControls {...audioControls} /></div>
      <div className="main-controls"><button className={isScreenShareEnabled ? 'active' : 'primary'} onClick={share} disabled={!connected || joining || screenPending} aria-label={screenPending ? 'Aguarde…' : isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'} title={isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}><Icon name="screen" /><span className="control-label">{screenPending ? 'Aguarde…' : isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}</span></button>
        <ControlMenu label="Configurações de áudio" icon="settings" className="call-settings"><AudioDevices room={room} microphoneBusy={microphone.pending || joining} /><label className="checkbox-label"><input type="checkbox" checked={sounds} onChange={event => { setSounds(event.target.checked); savePreferences({ sounds: event.target.checked }); }} />Sons de entrada e saída</label>
          <label>Qualidade solicitada<select aria-label="Qualidade do compartilhamento" value={quality} disabled={isScreenShareEnabled || screenPending} onChange={event => setQuality(event.target.value as ScreenQuality)}>{Object.entries(SCREEN_QUALITIES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><p className="muted">Aplicada no próximo compartilhamento. Até 5 Mbps em 30 fps/720p ou 8 Mbps em 1080p/60 fps; maior qualidade usa mais rede. Áudio da tela depende do navegador e da fonte.</p>
          {mini && miniHidden && current && !current.participant.isLocal && hasScreenAudio && <VolumeControl label="Áudio da tela selecionada" setting={screenSetting} onChange={changeScreenVolume} />}
          <p className="muted">Silenciar mantém a captura reservada. Sair ou trocar de sala libera os dispositivos.</p><AudioDiagnostics canPlay={canPlayAudio} globalMuted={audioMuted} timing={microphone.timing} />
        </ControlMenu>
      </div><button className="leave" disabled={joining || screenPending} aria-label="Sair da sala" title="Sair da sala" onClick={() => { microphone.stop(); onLeave(); }}><Icon name="leave" /><span className="control-label">Sair da sala</span></button></footer>
    <IncomingAudio volumes={volumes} screenIdentity={current?.participant.identity} screenSetting={screenSetting} globalMuted={audioMuted} /><MembershipSounds enabled={sounds} muted={audioMuted} />
  </main>;
}
