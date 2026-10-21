'use client';
import { useEffect, useRef, useState } from 'react';
import { RoomContext, useTracks } from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track, type RemoteTrackPublication, type Room } from 'livekit-client';
import { Brand } from './icons';
import { createScreenRoom } from './screen-connection';
import { connectRoom } from '@/lib/client/connect-room';
import { ScreenViewer } from './screen-viewer';
import { IncomingAudio, type VolumeSetting } from './incoming-audio';
import { SCREEN_QUALITIES, type ScreenQuality } from './screen-quality';
import type {} from '@/lib/desktop';

class StreamRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function post(body: object, keepalive = false) {
  const response = await fetch('/api/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', keepalive, signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new StreamRequestError(result.error || 'Espaço indisponível.', response.status);
  return result;
}
export default function StreamSpace() {
  const [connection, setConnection] = useState<{ room: Room; share: boolean; intent: string; desktop: boolean; expires: number } | null>(null);
  const [notice, setNotice] = useState('Validando convite…'); const [retry, setRetry] = useState(0); const [left, setLeft] = useState(false);
  const lifetime = useRef<() => Promise<void>>(() => Promise.resolve());
  const previous = useRef(Promise.resolve());
  const invite = useRef<string | null>(null);
  useEffect(() => {
    if (left) return;
    let cancelled = false; let connectionId = ''; let expiry = 0; let pollBusy = false;
    const room = createScreenRoom(); const before = previous.current;
    const subscribe = (publication: RemoteTrackPublication) => publication.setSubscribed([Track.Source.ScreenShare, Track.Source.ScreenShareAudio].includes(publication.source));
    room.on(RoomEvent.TrackPublished, subscribe);
    const disconnected = () => { if (!cancelled) setNotice('Conexão encerrada. Reabra o espaço para tentar novamente.'); };
    room.on(RoomEvent.Disconnected, disconnected);
    const work = (async () => {
      try {
        await before; if (cancelled) return;
        const params = new URLSearchParams(location.hash.slice(1));
        if (params.has('invite')) invite.current = params.get('invite');
        const intent = new URLSearchParams(location.search).get('intent') === 'share' ? 'share' : 'watch';
        // Strip the capability before any media, provider or guest-session request.
        history.replaceState(null, '', `/stream?intent=${intent}`);
        const desktop = !!window.blueprintDesktop;
        if (desktop) void window.blueprintDesktop!.configure({ available: false, microphone: false, muted: true, combined: false, bindings: { microphone: '', listening: '', all: '' } });
        setNotice('Validando convite…');
        if (invite.current) { await post({ action: 'exchange', credential: invite.current }); invite.current = null; }
        if (cancelled) return;
        const result = await post({ action: 'join' }); connectionId = result.connectionId; expiry = result.expires;
        if (cancelled) return;
        setConnection({ room, share: result.role === 'share', intent, desktop, expires: expiry });
        setNotice('Conectando ao espaço…');
        await connectRoom(room, result.serverUrl, result.token, 35000, false);
        if (cancelled) { await room.disconnect(true); return; }
        for (const participant of room.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) subscribe(publication);
        setNotice('');
      } catch (error) { if (!cancelled) setNotice(error instanceof StreamRequestError ? error.message : 'Não foi possível conectar. Confira sua conexão e tente novamente.'); }
    })();
    let closing: Promise<void> | undefined;
    const close = () => {
      if (closing) return closing;
      cancelled = true;
      room.off(RoomEvent.TrackPublished, subscribe).off(RoomEvent.Disconnected, disconnected);
      closing = (async () => {
        await room.disconnect(true); await work.catch(() => undefined); await room.disconnect(true);
        if (connectionId) await post({ action: 'leave', connectionId }, true).catch(() => undefined);
      })();
      return closing;
    };
    lifetime.current = close;
    const poll = setInterval(() => {
      if (cancelled || !connectionId || pollBusy) return;
      if (expiry && expiry <= Date.now()) { setNotice('Seu acesso expirou. Peça um novo convite.'); void close(); return; }
      pollBusy = true;
      void post({ action: 'status' }).catch(error => {
        if (cancelled) return;
        // Lock contention is not a lost authorization; the absolute expiry still applies.
        if (error instanceof StreamRequestError && error.status === 409) return;
        // Fail closed on loss of authorization or prolonged server availability.
        setNotice(error instanceof StreamRequestError ? error.message : 'Não foi possível validar o acesso. Reabra o espaço.'); void close();
      }).finally(() => { pollBusy = false; });
    }, 15000);
    window.addEventListener('pagehide', close);
    return () => { clearInterval(poll); window.removeEventListener('pagehide', close); previous.current = close(); };
  }, [retry, left]);
  async function leave() { setLeft(true); await lifetime.current(); setConnection(null); setNotice('Você saiu do espaço.'); }
  return <main className="stream-space"><header className="stream-header"><Brand/><span className="muted">Transmissão privada · até 8 pessoas</span>{!left && <button onClick={() => void leave()}>Sair</button>}</header>
    {notice && <p role="status">{notice}</p>}
    {connection && !left && <RoomContext.Provider value={connection.room}><StreamContent {...connection} onNotice={setNotice}/></RoomContext.Provider>}
    {notice && <button onClick={() => { setLeft(false); setRetry(value => value + 1); }}>Reabrir espaço</button>}
    <p className="stream-disclosure">Somente telas e o áudio escolhido por quem transmite. Nenhum microfone ou chat. Os rótulos de visitantes não verificam identidades.</p>
  </main>;
}
function StreamContent({ room, share, intent, desktop, onNotice }: { room: Room; share: boolean; intent: string; desktop: boolean; onNotice: (value: string) => void }) {
  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const audio = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true });
  const [selected, setSelected] = useState(''); const [quality, setQuality] = useState<ScreenQuality>('balanced');
  const [setting, setSetting] = useState<VolumeSetting>({ volume: 80, muted: true });
  const [connected, setConnected] = useState(room.state === ConnectionState.Connected);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false); const alive = useRef(false);
  const current = screens.find(track => track.publication.trackSid === selected);
  const own = screens.some(track => track.participant.isLocal);
  useEffect(() => {
    alive.current = true;
    const update = () => setConnected(room.state === ConnectionState.Connected);
    room.on(RoomEvent.ConnectionStateChanged, update);
    let stopped: ReturnType<typeof setTimeout> | undefined;
    const unpublished = (publication: { source: Track.Source }) => {
      if (publication.source === Track.Source.ScreenShare && room.state === ConnectionState.Connected) {
        clearTimeout(stopped);
        stopped = setTimeout(() => { if (alive.current && !room.localParticipant.isScreenShareEnabled) void post({ action: 'stopped' }).catch(() => undefined); }, 1500);
      }
    };
    room.on(RoomEvent.LocalTrackUnpublished, unpublished);
    return () => { alive.current = false; clearTimeout(stopped); room.off(RoomEvent.ConnectionStateChanged, update).off(RoomEvent.LocalTrackUnpublished, unpublished); };
  }, [room]);
  async function publish() {
    if (busyRef.current || room.state !== ConnectionState.Connected || !share || desktop) return;
    busyRef.current = true; setBusy(true); onNotice('');
    const stopping = room.localParticipant.isScreenShareEnabled;
    try {
      const target = SCREEN_QUALITIES[quality];
      await room.localParticipant.setScreenShareEnabled(!stopping, { audio: true, resolution: { width: target.width, height: target.height, frameRate: target.frameRate } }, { screenShareEncoding: { maxBitrate: target.bitrate, maxFramerate: target.frameRate }, degradationPreference: 'balanced' });
      if (!alive.current || room.state !== ConnectionState.Connected) { await room.localParticipant.setScreenShareEnabled(false); return; }
      if (stopping) await post({ action: 'stopped' }).catch(() => undefined);
      else {
        const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (publication) {
          setSelected(publication.trackSid);
          void post({ action: 'announce', attempt: crypto.randomUUID() }).then(result => { if (result.announcement === 'failed') onNotice('Transmitindo. O aviso ao Discord não foi enviado.'); }).catch(() => undefined);
        }
      }
    } catch { onNotice('Compartilhamento cancelado ou indisponível. Nenhum áudio alternativo foi selecionado.'); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  function select(sid: string) { setSelected(sid); setSetting(value => ({ ...value, muted: true })); }
  function adjust(value: VolumeSetting) { setSetting(value); if (!value.muted) void room.startAudio().catch(() => onNotice('Clique em Ouvir novamente para liberar a reprodução.')); }
  return <><div className="stream-actions"><h1>{intent === 'share' && share ? 'Transmitir' : 'Assistir'}</h1>
    {share && <><label>Qualidade<select value={quality} onChange={event => setQuality(event.target.value as ScreenQuality)} disabled={busy || own}>{Object.entries(SCREEN_QUALITIES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><button className="primary" disabled={!connected || busy || desktop} onClick={() => void publish()}>{busy ? 'Aguarde…' : own ? 'Parar transmissão' : intent === 'share' ? 'Selecionar tela' : 'Transmitir'}</button></>}
    </div>
    {share && <p className="muted">{desktop ? 'Nesta versão, abra o convite no Chrome ou Edge para transmitir. O aplicativo instalado ainda não recebe links de convidados.' : 'Confirme a tela e o áudio no seletor do navegador. Áudio do aplicativo isolado é exclusivo do aplicativo Windows nas salas autenticadas; não é prometido pelo navegador. Áudio do sistema pode incluir Discord e outras aplicações.'}</p>}
    <div className="stream-list" aria-label="Transmissões disponíveis">{screens.map((track, index) => <button key={track.publication.trackSid} aria-pressed={selected === track.publication.trackSid} onClick={() => select(track.publication.trackSid)}>Assistir · Transmissão {index + 1}{track.participant.isLocal ? ' (sua)' : ''}</button>)}</div>
    {current ? <ScreenViewer current={current} screens={screens} mini={false} hasAudio={audio.some(track => track.participant.identity === current.participant.identity)} setting={setting} onSetting={adjust} onSelect={select} onExpand={() => undefined} onHide={() => undefined} onNotice={onNotice}/> : <div className="stream-empty"><p>{screens.length ? 'Escolha uma transmissão para assistir.' : 'Nenhuma transmissão ativa. Quando alguém compartilhar, ela aparecerá aqui.'}</p>{selected && <p>A transmissão selecionada terminou.</p>}</div>}
    <IncomingAudio volumes={{}} screenOnly screenIdentity={current?.participant.identity} screenSetting={setting} globalMuted={!current || setting.muted}/>
  </>;
}
