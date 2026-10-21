'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, ConnectionState, Track } from 'livekit-client';
import { RoomContext, useAudioPlayback, useConnectionState, useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { VOICE_ROOMS, type ConnectionDetails, type VoiceRoomId } from '@/lib/room';
import { closeCallRoom, prepareCallAudio } from '@/lib/client/call-room';
import { connectRoom, VoiceConnectionTimeout } from '@/lib/client/connect-room';
import { readPreferences, savePreferences, currentPreferenceAccount, configurePreferences } from '@/lib/client/preferences';
import { playMembershipTone, resumeSounds } from '@/lib/client/call-sounds';
import { Brand, Icon } from './icons';
import { AccountProfile, loadProfile } from './account-profile';
import { AccountLogin } from './account-login';
import { Chat } from './chat';
import { AudioDevices } from './audio-devices';
import { useMicrophone } from './microphone';
import { AudioDiagnostics, IncomingAudio, MembershipNotifications, VolumeControl, type VolumeSetting } from './incoming-audio';
import { VoiceNavigation } from './voice-navigation';
import { SCREEN_QUALITIES, type ScreenQuality } from './screen-quality';
import { ScreenViewer } from './screen-viewer';
import { ControlMenu } from './control-menu';
import { CallAudioControls } from './call-audio-controls';
import { createScreenRoom, useScreenObserver, useScreenOutput } from './screen-connection';
import { useCallAudio } from './use-call-audio';
import { AudioShortcuts, useAudioShortcuts } from './audio-shortcuts';
import { DesktopSettings } from './desktop-settings';
import { useMicrophoneProcessing } from './microphone-processing';

async function post(path: string, body: object): Promise<ConnectionDetails & { error?: string }> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) { if (path === '/api/token' && result.takeoverRequired && !('takeover' in body) && window.confirm(result.error)) return post(path, {...body,takeover:true}); throw new Error(result.error || 'Não foi possível atualizar a voz.'); }
  return result;
}
export default function ConnectedRoom({ room, details, onLeave }: { room: Room; details?: ConnectionDetails; onLeave: (message?: string) => void }) {
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(!!details);
  const [currentRoom, setCurrentRoom] = useState<VoiceRoomId>(details?.voiceRoom ?? 'main');
  const [publisher] = useState(createScreenRoom);
  const [expired, setExpired] = useState(false);
  const [accountRevision, setAccountRevision] = useState(0);
  const draftOwner = useRef(currentPreferenceAccount());
  const loginDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (expired) loginDialog.current?.showModal(); }, [expired]);
  async function restoreAccount() {
    const previous = draftOwner.current;
    const profile = await loadProfile();
    // Another account must not inherit a draft or in-memory device choices.
    if (previous !== profile.id) setAccountRevision(value => value + 1);
    draftOwner.current=profile.id;
    setExpired(false);
  }
  useEffect(() => {
    let active = true;
    const check = async () => { try { const response = await fetch('/api/account', {cache:'no-store'}); if (response.status === 401 && active) { configurePreferences('',{});await publisher.disconnect(true); await room.disconnect(true); setExpired(true); } } catch { /* A network failure is not a logout. */ } };
    const timer = setInterval(() => void check(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [room, publisher]);
  const admission = useRef(details?.identity);
  const joinLock = useRef(!!details);
  const leaving = useRef(false);
  const intentionalDisconnect = useRef(false);
  useEffect(() => {
    let active = true; leaving.current = false;
    const disconnected = () => { void publisher.disconnect(true); if (active && !leaving.current && !intentionalDisconnect.current) setError('A conexão foi encerrada. Você pode entrar na sala novamente.'); };
    room.on(RoomEvent.Disconnected, disconnected);
    if (details) void connectRoom(room, details.serverUrl, details.token).then(async () => {
      if (active && details.screens) await connectRoom(publisher, details.screens.serverUrl, details.screens.token, 35000, false);
      if (!active) await publisher.disconnect(true);
    }).catch(failure => { if (active) setError(failure instanceof VoiceConnectionTimeout ? 'A conexão demorou demais. Confira sua rede e tente entrar novamente. O chat continua disponível.' : 'Não foi possível conectar toda a mídia. Saia e entre novamente.'); }).finally(() => { if (active) { joinLock.current = false; setJoining(false); } });
    const close = () => { void publisher.disconnect(true); void closeCallRoom(room); };
    window.addEventListener('pagehide', close);
    return () => { active = false; leaving.current = true; room.off(RoomEvent.Disconnected, disconnected); window.removeEventListener('pagehide', close); close(); };
  }, [room, publisher, details]);
  async function leave() {
    if (joinLock.current) return;
    joinLock.current = true; leaving.current = true;
    const wasConnected = room.state === ConnectionState.Connected;
    await publisher.disconnect(true); await room.disconnect(true);
    if (wasConnected) await playMembershipTone(room, false);
    let message = '';
    try { if (admission.current) await post('/api/voice/leave', { identity: admission.current }); }
    catch { message = 'A mídia foi desconectada. A vaga será liberada após a verificação do servidor.'; }
    finally { await closeCallRoom(room); onLeave(message); }
  }
  async function joinVoice(destination: VoiceRoomId) {
    if (expired || joinLock.current || leaving.current || ![ConnectionState.Disconnected, ConnectionState.Connected].includes(room.state) || (room.state === ConnectionState.Connected && destination === currentRoom)) return;
    joinLock.current = true; intentionalDisconnect.current = true; setJoining(true); setError(''); prepareCallAudio(room);
    try {
      await publisher.disconnect(true); await room.disconnect(true);
      if (leaving.current) return;
      const result: ConnectionDetails = await post('/api/token', { room: destination });
      admission.current = result.identity;
      if (!leaving.current) {
        setCurrentRoom(destination); await connectRoom(room, result.serverUrl, result.token);
        if (!leaving.current && result.screens) await connectRoom(publisher, result.screens.serverUrl, result.screens.token, 35000, false);
        if (leaving.current) await publisher.disconnect(true);
      }
    } catch (failure) { if (!leaving.current) setError(failure instanceof VoiceConnectionTimeout ? 'A conexão de voz demorou demais. Confira sua rede e tente novamente. O chat continua disponível.' : 'Não foi possível entrar na sala. A sala pode estar cheia ou indisponível. Tente novamente.'); }
    finally { intentionalDisconnect.current = false; joinLock.current = false; if (!leaving.current) setJoining(false); }
  }
  return <RoomContext.Provider value={room}>{expired&&<dialog ref={loginDialog} onCancel={event=>event.preventDefault()} className="profile-dialog" aria-label="Entrar novamente"><p>Sua sessão expirou. Seu rascunho continua nesta página. A mídia foi desconectada.</p><AccountLogin onAuthenticated={()=>void restoreAccount().catch(()=>setError('Não foi possível carregar o perfil. Tente novamente.'))}/></dialog>}<RoomView key={accountRevision} expired={expired} publisher={publisher} error={error} onLeave={leave} onJoin={joinVoice} joining={joining} currentRoom={currentRoom} initialView={details ? 'sala' : 'chat'} /></RoomContext.Provider>;
}

export function RoomView({ publisher: providedPublisher, error = '', onLeave, onJoin, joining = false, currentRoom = 'main', initialView = 'sala', expired = false }: {
  publisher?: Room; expired?: boolean; error?: string; onLeave: () => void; onJoin?: (room: VoiceRoomId) => void; joining?: boolean; currentRoom?: VoiceRoomId; initialView?: 'sala' | 'chat';
}) {
  const room = useRoomContext();
  const state = useConnectionState();
  const connected = state === ConnectionState.Connected;
  const voiceBusy = joining || (!connected && state !== ConnectionState.Disconnected);
  const [view, setView] = useState(initialView);
  const [browsing, setBrowsing] = useState(currentRoom);
  const [fallbackPublisher] = useState(createScreenRoom);
  const publisher = providedPublisher ?? fallbackPublisher;
  const [viewed, setViewed] = useState(initialView === 'sala');
  const [listening, setListening] = useState('');
  const foreign = state === ConnectionState.Disconnected || browsing !== currentRoom;
  const observer = useScreenObserver(browsing, viewed && foreign && !joining && !expired);
  const screenRoom = foreign ? observer.room ?? fallbackPublisher : publisher;
  const screenState = useConnectionState(screenRoom);
  const publisherState = useConnectionState(publisher);
  const screenOutput = useScreenOutput(room, screenRoom);
  const [unread, setUnread] = useState(0);

  const [notice, setNotice] = useState('');
  const [screenPending, setScreenPending] = useState(false);
  const [quality, setQuality] = useState<ScreenQuality>('balanced');
  const screenLock = useRef(false);
  const [volumes, setVolumes] = useState<Record<string, VolumeSetting>>({});
  const [screenSetting, setScreenSetting] = useState<VolumeSetting>(() => ({ volume: readPreferences().screenVolume, muted: false }));
  const [sounds, setSounds] = useState(() => readPreferences().sounds);
  const alive = useRef(false);
  const microphone = useMicrophone(room);
  const processing = useMicrophoneProcessing(room);
  const audio = useCallAudio(room, microphone, !connected || joining || processing.pending);
  const audioMuted = audio.muted;

  const { isMicrophoneEnabled } = useLocalParticipant();
  const shortcuts = useAudioShortcuts(audio.dispatch, connected && !joining && !expired && !processing.pending && !microphone.pending, { microphone: isMicrophoneEnabled, muted: audio.muted, combined: audio.combined });
  const { localParticipant: screenParticipant, isScreenShareEnabled } = useLocalParticipant({ room: publisher });
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const screenPlayback = useAudioPlayback(screenRoom);
  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: false, room: screenRoom });
  const screenAudios = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: false, room: screenRoom });
  const [selected, setSelected] = useState('');
  const [miniHidden, setMiniHidden] = useState(false);
  const current = screenState === ConnectionState.Connected ? screens.find(track => track.publication.trackSid === selected) ?? screens[0] : undefined;
  const hasScreenAudio = current && screenAudios.some(ref => ref.participant.identity === current.participant.identity && !ref.publication.isMuted);
  const listeningKey = `${browsing}:${current?.publication.trackSid ?? ''}`;
  const screenListening = !foreign || listening === listeningKey;
  useEffect(() => () => {
    // The publisher remains connected while browsing elsewhere, but it must not
    // retain unused remote screen subscriptions or a second audio receive path.
    for (const person of screenRoom.remoteParticipants.values()) for (const publication of person.trackPublications.values()) publication.setSubscribed(false);
  }, [screenRoom]);
  useEffect(() => {
    for (const person of screenRoom.remoteParticipants.values()) for (const publication of person.trackPublications.values()) {
      const wanted = publication.source === Track.Source.ScreenShare ? publication.trackSid === current?.publication.trackSid : publication.source === Track.Source.ScreenShareAudio && person.identity === current?.participant.identity && screenListening;
      if (publication.isDesired !== wanted) publication.setSubscribed(wanted);
    }
  }, [screenRoom, screens, screenAudios, current, screenListening]);
  const viewedRoom = useRef(currentRoom);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (viewedRoom.current === currentRoom) return;
    viewedRoom.current = currentRoom;
    queueMicrotask(() => { setBrowsing(currentRoom); setSelected(''); setMiniHidden(false); });
  }, [currentRoom]);
  const status = joining ? 'Trocando de sala…' : connected ? 'Conectado' : state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting ? 'Reconectando…' : state === ConnectionState.Connecting ? 'Conectando…' : 'Desconectado';
  const name = (id: VoiceRoomId) => VOICE_ROOMS.find(item => item.id === id)!.name;
  function unlock() { resumeSounds(room); void Promise.all([startAudio(), screenPlayback.startAudio()]).catch(() => setNotice('A reprodução continua bloqueada. Confira as configurações do navegador.')); }
  function browse(destination: VoiceRoomId) { if (destination !== browsing) { setSelected(''); setListening(''); } setViewed(true); setBrowsing(destination); setMiniHidden(false); setView('sala'); }
  function enter(destination: VoiceRoomId) { if (voiceBusy || screenPending || microphone.pending || (connected && destination === currentRoom)) return; microphone.stop(); setNotice(''); setSelected(''); setListening(''); setMiniHidden(false); setBrowsing(destination); onJoin?.(destination); }
  function toggleScreenListening() { if (screenListening) setListening(''); else { setListening(listeningKey); void screenPlayback.startAudio().catch(() => setNotice('Use Ativar áudio para liberar a reprodução.')); } }
  async function share() {
    if (screenLock.current) return;
    screenLock.current = true; setScreenPending(true); setNotice('');
    const target = SCREEN_QUALITIES[quality];
    try {
      await screenParticipant.setScreenShareEnabled(!screenParticipant.isScreenShareEnabled, {
        audio: true, systemAudio: 'include', selfBrowserSurface: 'exclude',
        resolution: { width: target.width, height: target.height, frameRate: target.frameRate }, contentHint: quality === 'balanced' ? 'detail' : 'motion',
      }, { screenShareEncoding: { maxBitrate: target.bitrate, maxFramerate: target.frameRate }, degradationPreference: 'balanced' });
    } catch (failure) {
      if (alive.current) setNotice(failure instanceof Error && ['NotAllowedError', 'AbortError'].includes(failure.name) ? 'Compartilhamento não iniciado. A seleção foi cancelada ou a permissão não foi concedida.' : 'Não foi possível compartilhar nessa qualidade. Tente 1080p / 30 fps ou outra fonte no seletor.');
    } finally { if (!alive.current || room.state === ConnectionState.Disconnected) await publisher.disconnect(true); screenLock.current = false; if (alive.current) setScreenPending(false); }
  }
  const mini = view === 'chat';
  const showStream = !!current && (!mini || !miniHidden);
  const viewingStatus = !foreign ? 'Na voz' : observer.error ? 'Visualização indisponível' : screenState === ConnectionState.Connected ? 'Visualizando' : 'Abrindo telas…';
  const audioControls = { enabled: isMicrophoneEnabled, pending: microphone.pending, disabled: !connected || joining || processing.pending, muted: audioMuted, combined: audio.combined, combinedBusy: audio.busy, onMicrophone: () => audio.dispatch('microphone'), onCancel: microphone.cancel, onListening: () => audio.dispatch('listening'), onAll: () => audio.dispatch('all') };
  function changeScreenVolume(setting: VolumeSetting) { setScreenSetting(setting); savePreferences({ screenVolume: setting.volume }); }
  return <main className="room-shell">
    <header className="room-header"><Brand /><AccountProfile /><span className="connection" role="status"><i className={connected ? 'connected-dot' : ''} /><span>Voz: <span>{status}</span>{connected && ' · ' + name(currentRoom)}</span></span><span className="small-label"><Icon name="lock" /> Sala privada</span></header>
    <div className="room-columns"><aside className="participants-panel"><VoiceNavigation currentRoom={currentRoom} connected={connected} browsing={browsing} busy={voiceBusy || screenPending || microphone.pending} onBrowse={browse} onJoin={enter} onChat={() => setView('chat')} chatActive={view === 'chat'} volumes={volumes} onVolume={(identity, value) => setVolumes(previous => ({ ...previous, [identity]: value }))} /></aside>
      <div className="workspace-main"><div className="view-tabs" role="tablist" aria-label="Visualização">{(['sala', 'chat'] as const).map(tab => <button key={tab} role="tab" id={'tab-' + tab} aria-controls={'panel-' + tab} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onClick={() => { if (tab === 'sala') setViewed(true); setView(tab); }} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'sala' : event.key === 'End' ? 'chat' : tab === 'sala' ? 'chat' : 'sala'; if (next === 'sala') setViewed(true); setView(next); document.getElementById('tab-' + next)?.focus(); } }}>{tab === 'sala' ? 'Sala' : 'Chat'}{tab === 'chat' && unread > 0 && view !== 'chat' && <span className="pill" aria-label={unread + ' mensagens novas'}>{unread > 99 ? '99+' : unread}</span>}</button>)}</div>
        <MembershipNotifications enabled={sounds} muted={audioMuted} roomName={name(currentRoom)} />
        <div className="workspace-notices">{error && <p className="error banner" role="alert">{error}</p>}{observer.error && <p className="error banner" role="alert">{observer.error} <button onClick={observer.retry}>Tentar visualização novamente</button></p>}{[notice, microphone.notice, screenOutput.error].filter(Boolean).map(message => <p className="notice banner" role="status" key={message}>{message}</p>)}{((!canPlayAudio && connected) || (!screenPlayback.canPlayAudio && hasScreenAudio && screenListening)) && <button className="audio-unlock" onClick={unlock}>Ativar áudio</button>}</div>
        <div className={'media-chat-layout ' + (mini ? 'chat-layout' : '')}>
          <section className={mini ? 'stream-mini' : 'stage-column'} id="panel-sala" role={mini ? 'region' : 'tabpanel'} aria-label={mini ? 'Tela em mini-player' : undefined} aria-labelledby={mini ? undefined : 'tab-sala'} hidden={mini && !showStream}>
            {!mini && <div className="stage-heading"><h1>{name(browsing)}</h1><span className="viewing-status">{viewingStatus}</span>{foreign && <button disabled={voiceBusy || screenPending || microphone.pending} onClick={() => enter(browsing)} aria-label={`Entrar na sala: ${name(browsing)}`}><Icon name="audio" />Entrar na sala</button>}</div>}
            <RoomContext.Provider value={screenRoom}>{showStream ? <ScreenViewer current={current!} screens={screens} mini={mini} hasAudio={!!hasScreenAudio} setting={screenSetting} onSetting={changeScreenVolume} onSelect={sid => { setSelected(sid); setListening(''); }} onExpand={() => setView('sala')} onHide={() => setMiniHidden(true)} onNotice={setNotice} audioControls={audioControls} listening={foreign ? { enabled: screenListening, toggle: toggleScreenListening } : undefined} /> : <div className="screen-viewer"><div className="viewer-empty"><Icon name="screen" width="36" height="36" /><h2>{screenState === ConnectionState.Connecting ? 'Abrindo telas…' : screenState === ConnectionState.Reconnecting || screenState === ConnectionState.SignalReconnecting ? 'Reconectando visualização…' : 'Nenhuma tela compartilhada'}</h2><p>As telas desta sala aparecem aqui, sem entrar na sala.</p></div></div>}</RoomContext.Provider>
          </section>
          <section id="panel-chat" className="chat-view" role="tabpanel" aria-labelledby="tab-chat" hidden={view !== 'chat'}><Chat active={view === 'chat'} onUnread={setUnread} />{mini && miniHidden && current && <button className="show-mini" onClick={() => setMiniHidden(false)}>Mostrar mini-player</button>}</section>
        </div>
      </div></div>
    <footer className="call-controls"><div className="microphone-controls">{!connected && onJoin && <button className="primary" disabled={joining || state !== ConnectionState.Disconnected} onClick={() => enter(browsing)}>{joining ? 'Entrando…' : 'Entrar na sala'}</button>}<CallAudioControls {...audioControls} /></div>
      <div className="main-controls"><button className={isScreenShareEnabled ? 'active' : 'primary'} onClick={share} disabled={!connected || publisherState !== ConnectionState.Connected || joining || screenPending} aria-label={screenPending ? 'Aguarde…' : isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'} title={isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}><Icon name="screen" /><span className="control-label">{screenPending ? 'Aguarde…' : isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}</span></button>
        <ControlMenu label="Configurações de áudio" icon="settings" className="call-settings"><AudioDevices room={room} microphoneBusy={microphone.pending || joining || processing.pending} processing={processing} /><label className="checkbox-label"><input type="checkbox" checked={sounds} onChange={event => { setSounds(event.target.checked); savePreferences({ sounds: event.target.checked }); }} />Sons de entrada e saída</label>
          <p className="muted">Silenciar tudo guarda os estados anteriores. Alterar um controle individual encerra esse modo e mantém o outro silenciado.</p><AudioShortcuts {...shortcuts} /><DesktopSettings /><label>Qualidade solicitada<select aria-label="Qualidade do compartilhamento" value={quality} disabled={isScreenShareEnabled || screenPending} onChange={event => setQuality(event.target.value as ScreenQuality)}>{Object.entries(SCREEN_QUALITIES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><p className="muted">Aplicada no próximo compartilhamento. Até 5 Mbps em 30 fps/720p ou 8 Mbps em 1080p/60 fps; maior qualidade usa mais rede. Áudio da tela depende do navegador e da fonte.</p>
          {mini && miniHidden && current && !current.participant.isLocal && hasScreenAudio && <VolumeControl label="Áudio da tela selecionada" setting={screenSetting} onChange={changeScreenVolume} />}
          <p className="muted">Silenciar mantém a captura reservada. Sair ou trocar de sala libera os dispositivos.</p><AudioDiagnostics canPlay={canPlayAudio} globalMuted={audioMuted} timing={microphone.timing} />
        </ControlMenu>
      </div><button className="leave" disabled={joining || screenPending} aria-label="Sair da sala" title="Sair da sala" onClick={() => { microphone.stop(); onLeave(); }}><Icon name="leave" /><span className="control-label">Sair da sala</span></button></footer>
    <IncomingAudio volumes={volumes} screenSetting={screenSetting} globalMuted={audioMuted} />
    <RoomContext.Provider value={screenRoom}><IncomingAudio volumes={{}} screenOnly screenIdentity={screenListening ? current?.participant.identity : undefined} screenSetting={screenSetting} globalMuted={audioMuted || !screenOutput.ready} /></RoomContext.Provider>
  </main>;
}
