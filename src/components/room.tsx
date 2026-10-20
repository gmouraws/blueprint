'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, ConnectionState, Track, ConnectionError, type Participant } from 'livekit-client';
import { RoomContext, RoomAudioRenderer, VideoTrack, useAudioPlayback, useConnectionState, useIsMuted, useIsSpeaking, useLocalParticipant, useMediaDeviceSelect, useParticipants, useRoomContext, useTracks } from '@livekit/components-react';
import { MAX_PARTICIPANTS, type ConnectionDetails } from '@/lib/room';
import { Brand, Icon } from './icons';
import { Chat } from './chat';

function connectionMessage(error: unknown) {
  // Provider versions may surface capacity via a signalling error rather than a disconnect enum.
  if (error instanceof Error && /max.*participants|participants.*exceeded|room.*full/i.test(error.message)) return 'A sala está cheia: cinco pessoas já estão conectadas. Tente novamente quando alguém sair.';
  if (error instanceof ConnectionError && error.status === 401) return 'A autorização expirou. Saia e entre novamente.';
  return 'Não foi possível entrar na sala. Ela pode estar cheia ou indisponível. Saia e tente novamente em instantes.';
}
export default function ConnectedRoom({ details, onLeave }: { details: ConnectionDetails; onLeave: (message?: string) => void }) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: { screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 }, stopMicTrackOnMute: true },
  }));
  const [error, setError] = useState('');
  const leaving = useRef(false);
  useEffect(() => {
    let active = true;
    const disconnected = () => { if (active && !leaving.current) setError('A conexão foi encerrada. Saia e entre novamente para tentar reconectar.'); };
    room.on(RoomEvent.Disconnected, disconnected);
    void room.connect(details.serverUrl, details.token).catch(failure => { if (active) setError(connectionMessage(failure)); });
    const close = () => { void room.disconnect(true); };
    window.addEventListener('pagehide', close);
    return () => { active = false; room.off(RoomEvent.Disconnected, disconnected); window.removeEventListener('pagehide', close); close(); };
  }, [room, details]);
  async function leave() {
    leaving.current = true;
    try { await room.disconnect(true); }
    finally { onLeave(); }
  }
  return <RoomContext.Provider value={room}><RoomView error={error} onLeave={leave} /></RoomContext.Provider>;
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant);
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  return <li className={`participant ${speaking ? 'speaking' : ''}`}><span className="avatar" aria-hidden="true">{(participant.name || '?').slice(0, 2).toUpperCase()}</span><div><strong>{participant.name || 'Participante'}{participant.isLocal && <span className="muted"> · você</span>}</strong><span className="participant-state">{muted ? 'Microfone desligado' : speaking ? 'Falando' : 'Microfone ligado'}</span></div><Icon name="mic" className={muted ? 'muted' : 'accent'} /></li>;
}

export function RoomView({ error = '', onLeave }: { error?: string; onLeave: () => void }) {
  const room = useRoomContext();
  const state = useConnectionState();
  const participants = useParticipants();
  const connected = state === ConnectionState.Connected;
  const [audioMuted, setAudioMuted] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<'mic' | 'screen' | null>(null);
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind: 'audioinput', requestPermissions: false, onError: () => setNotice('Não foi possível acessar esse microfone. Verifique as permissões do navegador.') });
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const status = connected ? 'Conectado' : state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting ? 'Reconectando…' : state === ConnectionState.Connecting ? 'Conectando…' : 'Desconectado';
  async function microphone() {
    setPending('mic'); setNotice('');
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }
    catch { setNotice('Microfone indisponível. Permita o acesso no navegador e confira se o dispositivo está conectado. Você pode continuar ouvindo e conversando por texto.'); }
    finally { if (room.state === ConnectionState.Disconnected) await room.disconnect(true); setPending(null); }
  }
  async function share() {
    setPending('screen'); setNotice('');
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: true, systemAudio: 'include', selfBrowserSurface: 'exclude', resolution: { width: 1920, height: 1080, frameRate: 15 }, contentHint: 'detail' });
    } catch (failure) {
      setNotice(failure instanceof Error && ['NotAllowedError', 'AbortError'].includes(failure.name) ? 'Compartilhamento não iniciado. A seleção foi cancelada ou a permissão não foi concedida.' : 'Não foi possível compartilhar a tela. Confira as permissões e tente novamente.');
    } finally { if (room.state === ConnectionState.Disconnected) await room.disconnect(true); setPending(null); }
  }
  return <main className="room-shell">
    <header className="room-header"><Brand /><span className="connection" role="status"><i className={connected ? 'connected-dot' : ''} />{status}</span><span className="small-label"><Icon name="lock" /> Sala privada</span></header>
    <div className="room-columns"><aside className="participants-panel"><div className="panel-heading"><h2>Na sala</h2><span className="pill">{connected ? participants.length : '—'} / {MAX_PARTICIPANTS}</span></div><p className="muted side-description">Um lugar para os cinco.</p><ul className="participants">{participants.filter(participant => participant.identity).map(participant => <ParticipantRow key={participant.identity} participant={participant} />)}</ul>{!connected && <p className="muted">Aguardando conexão com a sala.</p>}<div className="sidebar-note"><Icon name="lock" /><p>Voz e tela só entre quem entrou. Sem gravação pelo aplicativo.</p></div></aside>
      <section className="stage-column" aria-label="Área de compartilhamento"><div className="stage-heading"><div><p className="eyebrow">SALA DE VOZ</p><h1>Entre amigos</h1></div><span className="pill">Sem webcam</span></div>
        {error && <p className="error banner" role="alert">{error}</p>}
        {notice && <p className="notice banner" role="status">{notice}</p>}
        {!canPlayAudio && connected && <button className="audio-unlock" onClick={() => void startAudio().catch(() => setNotice('O navegador bloqueou o áudio. Tente liberar novamente.'))}>Clique para liberar o áudio da sala</button>}
        <ScreenViewer />
        <p className="capture-note">O áudio compartilhado depende do navegador, do sistema e da fonte escolhida. No Chrome ou Edge, uma aba pode oferecer áudio; nem toda janela ou jogo oferece essa opção.</p>
      </section><Chat connected={connected} /></div>
    <footer className="call-controls"><div className="microphone-controls"><button onClick={microphone} disabled={!connected || pending !== null} aria-pressed={isMicrophoneEnabled}><Icon name="mic" />{pending === 'mic' ? 'Aguarde…' : isMicrophoneEnabled ? 'Desligar microfone' : 'Ativar microfone'}</button><label className="device-select">Microfone<select aria-label="Selecionar microfone" value={activeDeviceId || 'default'} disabled={!connected} onChange={event => void setActiveMediaDevice(event.target.value).catch(() => setNotice('Não foi possível trocar o microfone.'))}><option value="default">Padrão do sistema</option>{devices.filter(device => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label></div>
      <div className="main-controls"><button aria-pressed={audioMuted} onClick={() => setAudioMuted(value => !value)}><Icon name="audio" />{audioMuted ? 'Ouvir áudio' : 'Silenciar áudio'}</button><button className={isScreenShareEnabled ? 'active' : 'primary'} onClick={share} disabled={!connected || pending !== null}><Icon name="screen" />{pending === 'screen' ? 'Aguarde…' : isScreenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}</button></div><button className="leave" onClick={onLeave}><Icon name="leave" />Sair da sala</button></footer>
    <RoomAudioRenderer volume={audioMuted ? 0 : 1} />
  </main>;
}

function ScreenViewer() {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const viewer = useRef<HTMLDivElement>(null);
  const current = tracks.find(track => track.publication.trackSid === selected) ?? tracks[0];
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await viewer.current?.requestFullscreen(); }
    catch { setError('Não foi possível abrir em tela cheia neste navegador.'); }
  }
  return <><div className="screen-viewer" ref={viewer}>{current ? <><div className="viewer-toolbar"><label>Tela de <select aria-label="Escolher tela compartilhada" value={current.publication.trackSid} onChange={event => setSelected(event.target.value)}>{tracks.map(track => <option value={track.publication.trackSid} key={track.publication.trackSid}>{track.participant.name || 'Participante'}{track.participant.isLocal ? ' (você)' : ''}</option>)}</select></label><button onClick={fullscreen} aria-label="Alternar tela cheia"><Icon name="expand" /><span>Tela cheia</span></button></div><VideoTrack trackRef={current} muted playsInline className="shared-video" /></> : <div className="viewer-empty"><span className="screen-outline" aria-hidden="true"><Icon name="screen" width="44" height="44" /></span><h2>O que vamos ver juntos?</h2><p>Quando alguém compartilhar a tela,<br />ela aparece aqui.</p><span className="empty-caption">A conversa por voz continua sem compartilhar.</span></div>}</div>{error && <p className="error" role="alert">{error}</p>}</>;
}
