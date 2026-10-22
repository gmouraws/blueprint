'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RoomContext, useTracks } from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track, type LocalTrack, type Room } from 'livekit-client';
import { Brand } from './icons';
import { createScreenRoom } from './screen-connection';
import { connectRoom } from '@/lib/client/connect-room';
import { ScreenViewer } from './screen-viewer';
import { IncomingAudio, type VolumeSetting } from './incoming-audio';
import { SCREEN_QUALITIES } from './screen-quality';
import type {} from '@/lib/desktop';
import { StreamMetrics } from './stream-metrics';
import { streamRequest as post, StreamRequestError } from '@/lib/client/stream-request';
import { WindowsDownload } from './windows-download';
import { streamDesktopScheme, streamDesktopUrl } from '@/lib/client/stream-desktop';

export default function StreamSpace() {
  const [connection, setConnection] = useState<{ room: Room; share: boolean; intent: string; desktop: boolean; expires: number } | null>(null);
  const [notice, setNotice] = useState('Validando convite…'); const [retry, setRetry] = useState(0); const [left, setLeft] = useState(false);
  const lifetime = useRef<() => Promise<void>>(() => Promise.resolve());
  const previous = useRef(Promise.resolve());
  const invite = useRef<string | null>(null);
  const [openingApp, setOpeningApp] = useState(false);
  const [appChoice, setAppChoice] = useState(false);
  const preparedHandoff = useRef<{ credential: string; expires: number } | null>(null);
  const [handoffStage, setHandoffStage] = useState('');
  const nativeDiagnostic = (stage: 'ticket_redeemed' | 'ticket_rejected' | 'media_connected' | 'media_failed') => { void window.blueprintStreamDesktop?.diagnostic?.(stage).catch(() => undefined); };
  const automaticAttempted = useRef(false), browserChosen = useRef(false), intendedAction = useRef('watch');
  useEffect(() => {
    if (left) return;
    let cancelled = false; let authorized = false; let expiry = 0; let pollBusy = false;
    const room = createScreenRoom(); const before = previous.current;

    const work = (async () => {
      try {
        await before; if (cancelled) return;
        const params = new URLSearchParams(location.hash.slice(1));
        if (params.has('invite')) invite.current = params.get('invite');
        const nativeStream = window.blueprintStreamDesktop?.version === 1;
        if (nativeStream) { const received = await window.blueprintStreamDesktop!.consumeInvite(); if (received) invite.current = received; }
        const intent = new URLSearchParams(location.search).get('intent') === 'share' ? 'share' : 'watch';
        intendedAction.current = intent;
        // Strip the capability before any media, provider or guest-session request.
        history.replaceState(null, '', `/stream?intent=${intent}`);
        const desktop = !!window.blueprintDesktop || nativeStream;
        if (desktop && !nativeStream) void window.blueprintDesktop!.configure({ available: false, microphone: false, muted: true, combined: false, bindings: { microphone: '', listening: '', all: '' } }).catch(() => undefined);
        setNotice('Validando convite…');
        if (invite.current) {
          try { await post({ action: 'exchange', credential: invite.current }); nativeDiagnostic('ticket_redeemed'); }
          catch (error) { nativeDiagnostic('ticket_rejected'); throw error; }
          invite.current = null;
        }
        if (cancelled) return;
        if (!desktop && !nativeStream && /Win/i.test(navigator.platform) && !browserChosen.current && desktopScheme()) {
          setAppChoice(true);
          if (!automaticAttempted.current) {
            automaticAttempted.current = true; setOpeningApp(true);
            try {
              setHandoffStage('Solicitando código temporário…');
              const handoff = await post({ action: 'handoff' });
              preparedHandoff.current = { credential: handoff.credential, expires: Date.now() + 50000 };
              setHandoffStage('Código criado. Abertura solicitada ao Windows; recebimento pelo aplicativo ainda não confirmado.');
              if (!cancelled) { setNotice('Confirme a abertura no Windows. Não é possível detectar se o aplicativo está instalado. Você pode tentar novamente ou continuar no navegador.'); launchDesktop(handoff.credential, intent); }
            } catch { if (!cancelled) setNotice('A abertura automática não foi concluída. Use Abrir no aplicativo ou continue no navegador.'); }
            finally { setOpeningApp(false); }
          }
          return;
        }
        const result = await post({ action: 'status' }); expiry = result.expires; authorized = true;
        if (cancelled) return;
        setConnection({ room, share: result.role === 'share', intent, desktop, expires: expiry });
        setNotice('');
      } catch (error) { nativeDiagnostic('media_failed'); if (!cancelled) setNotice(error instanceof StreamRequestError ? error.message : 'Não foi possível conectar. Confira sua conexão e tente novamente.'); }
    })();
    let closing: Promise<void> | undefined;
    const close = () => {
      if (closing) return closing;
      cancelled = true;
      closing = (async () => {
        await room.disconnect(true); await work.catch(() => undefined); await room.disconnect(true);

      })();
      return closing;
    };
    lifetime.current = close;
    const poll = setInterval(() => {
      if (cancelled || !authorized || pollBusy) return;
      if (expiry && expiry <= Date.now()) { setNotice('Seu acesso expirou. Peça um novo convite.'); setConnection(null); void close(); return; }
      pollBusy = true;
      void post({ action: 'status' }).catch(error => {
        if (cancelled) return;
        // Lock contention is not a lost authorization; the absolute expiry still applies.
        if (error instanceof StreamRequestError && error.status === 409) return;
        // Fail closed on loss of authorization or prolonged server availability.
        setNotice(error instanceof StreamRequestError ? error.message : 'Não foi possível validar o acesso. Reabra o espaço.'); setConnection(null); void close();
      }).finally(() => { pollBusy = false; });
    }, 15000);
    window.addEventListener('pagehide', close);
    return () => { clearInterval(poll); window.removeEventListener('pagehide', close); previous.current = close(); };
  }, [retry, left]);
  async function leave() { setLeft(true); await lifetime.current(); setConnection(null); setNotice('Você saiu do espaço.'); }
  async function openApp() {
    if (openingApp || window.blueprintDesktop) return;
    const scheme = desktopScheme();
    if (!scheme) { setNotice('A abertura no aplicativo está disponível pelo convite no domínio de Production. Continue no navegador neste Preview.'); return; }
    // A fresh prepared ticket lets the explicit click navigate synchronously, preserving user activation.
    if (!connection && preparedHandoff.current && preparedHandoff.current.expires > Date.now()) {
      try { launchDesktop(preparedHandoff.current.credential, intendedAction.current); setHandoffStage('Abertura solicitada ao Windows; recebimento pelo aplicativo ainda não confirmado.'); }
      catch { setHandoffStage('O navegador bloqueou a abertura. Continue no navegador ou atualize o aplicativo.'); }
      preparedHandoff.current = null; return;
    }
    setOpeningApp(true); setHandoffStage('Solicitando código temporário…');
    try {
      const result = await post({ action: 'handoff' });
      if (!/^[A-Za-z0-9_-]{43}$/.test(result.credential)) throw Error('invalid');
      await leave();
      setAppChoice(true); automaticAttempted.current = true;
      setNotice('Confirme a abertura no Windows. Não é possível detectar se o aplicativo está instalado. Continue no navegador se preferir.');
      preparedHandoff.current = { credential: result.credential, expires: Date.now() + 50000 };
      setHandoffStage('Código criado. Clique novamente em Abrir no aplicativo para confirmar a abertura no Windows.');
    } catch { setNotice('Não foi possível abrir no aplicativo. Continue no navegador ou tente novamente.'); }
    finally { setOpeningApp(false); }
  }
  return <main className="stream-space"><header className="stream-header"><Brand/><span className="muted">Transmissão privada · até 8 pessoas</span><Link href="/" className="muted">Início</Link>{!left && <button onClick={() => void leave()}>Sair</button>}</header>
    {(appChoice || (connection && !connection.desktop && !left)) && <div className="stream-actions"><button disabled={openingApp} onClick={() => void openApp()}>Abrir no aplicativo</button>{appChoice && <button onClick={() => { browserChosen.current = true; setAppChoice(false); setLeft(false); setRetry(value => value + 1); }}>Continuar no navegador</button>}<span className="muted">Windows 0.1.6 ou posterior para corrigir a abertura. A seleção e confirmação da tela continuam obrigatórias.</span></div>}
    {appChoice && <WindowsDownload/>}
    {handoffStage && <p aria-live="polite" className="muted">{handoffStage}</p>}
    {notice && <p role="status">{notice}</p>}
    {connection && !left && <RoomContext.Provider value={connection.room}><StreamContent {...connection} onNotice={setNotice}/></RoomContext.Provider>}
    {notice && !appChoice && <button onClick={() => { browserChosen.current = true; setLeft(false); setRetry(value => value + 1); }}>{left ? 'Continuar no navegador' : 'Reabrir espaço'}</button>}
    <p className="stream-disclosure">Somente telas e o áudio escolhido por quem transmite. Nenhum microfone ou chat. Os rótulos de visitantes não verificam identidades.</p>
  </main>;
}
function desktopScheme() {
  return streamDesktopScheme(location.origin);
}
function launchDesktop(credential: unknown, intent: string) {
  const url = streamDesktopUrl(location.origin, credential, intent);
  // Only the server's one-use 60-second ticket enters the OS protocol, never the invitation.
  location.assign(url);
}
type AvailableStream = { identity: string; sid: string; label: number };
function StreamContent({ room, share, intent, desktop, expires, onNotice }: { room: Room; share: boolean; intent: string; desktop: boolean; expires: number; onNotice: (value: string) => void }) {
  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const audio = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true });
  const [available, setAvailable] = useState<AvailableStream[]>([]);
  const [selection, setSelection] = useState<number | null>(null);
  const selectedLabel = useRef<number | null>(null);
  const [fps, setFps] = useState<30 | 60>(30);
  const [setting, setSetting] = useState<VolumeSetting>({ volume: 80, muted: true });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false), alive = useRef(false), publishing = useRef(false);
  const admission = useRef('');
  const cleanup = useRef(Promise.resolve());
  const pending = useRef<LocalTrack[]>([]);
  const targetIdentity = useRef('');
  const nativeStream = typeof window !== 'undefined' && window.blueprintStreamDesktop?.version === 1;
  const [nativeReady, setNativeReady] = useState(false);
  const own = screens.find(track => track.participant.isLocal);
  const current = selection === null ? own : screens.find(track => track.participant.identity === available.find(item => item.label === selection)?.identity);

  // Selected video/audio only, including tracks announced during connection or source replacement.
  function subscriptions() {
    for (const participant of room.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) {
      publication.setSubscribed(participant.identity === targetIdentity.current && [Track.Source.ScreenShare, Track.Source.ScreenShareAudio].includes(publication.source));
    }
  }
  async function disconnect() {
    const connectionId = admission.current; admission.current = '';
    await room.disconnect(true);
    if (connectionId) await post({ action: 'leave', connectionId }, true).catch(() => undefined);
  }
  async function connect() {
    await cleanup.current;
    if (!alive.current) throw Error('cancelled');
    if (room.state === ConnectionState.Connected) return;
    const result = await post({ action: 'join' }); admission.current = result.connectionId;
    if (!alive.current) { await disconnect(); throw Error('cancelled'); }
    await connectRoom(room, result.serverUrl, result.token, 35000, false);
    if (!alive.current) { await disconnect(); throw Error('cancelled'); }
    subscriptions();
    void window.blueprintStreamDesktop?.diagnostic?.('media_connected').catch(() => undefined);
  }
  useEffect(() => {
    alive.current = true;
    let polling = false, absentSince = 0;
    const tracks = pending.current;
    const updateSubscriptions = () => subscriptions();
    const stopped = () => {
      if (!alive.current || busyRef.current || !publishing.current || room.localParticipant.isScreenShareEnabled) return;
      publishing.current = false;
      // The source ending must also release its audio while watching another screen.
      cleanup.current = (async () => {
        await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
        void post({ action: 'stopped' }).catch(() => undefined);
        if (selectedLabel.current === null) await disconnect();
      })();
    };
    const disconnected = () => {
      if (alive.current && !busyRef.current && (publishing.current || selectedLabel.current !== null)) onNotice('A conexão de mídia foi encerrada. Selecione a transmissão para tentar novamente.');
      publishing.current = false;
      const connectionId = admission.current; admission.current = '';
      if (connectionId) void post({ action: 'leave', connectionId }, true).catch(() => undefined);
    };
    room.on(RoomEvent.TrackPublished, updateSubscriptions);
    room.on(RoomEvent.LocalTrackUnpublished, stopped);
    room.on(RoomEvent.Disconnected, disconnected);
    async function discover() {
      if (polling || !alive.current) return;
      polling = true;
      try {
        const result = await post({ action: 'discover' });
        if (!alive.current) return;
        const next: AvailableStream[] = result.streams;
        setAvailable(next);
        const selected = next.find(item => item.label === selectedLabel.current);
        if (selectedLabel.current !== null && !selected) {
          absentSince ||= Date.now();
          if (Date.now() - absentSince >= 20000 && !busyRef.current) {
            selectedLabel.current = null; targetIdentity.current = ''; setSelection(null); subscriptions();
            if (!publishing.current) cleanup.current = disconnect();
            onNotice('A transmissão terminou. Você foi desconectado da mídia.');
          }
        } else {
          absentSince = 0;
          if (selected && targetIdentity.current !== selected.identity) { targetIdentity.current = selected.identity; subscriptions(); }
        }
      } catch { /* The parent authorization heartbeat fails closed; discovery failure is not proof of ending. */ }
      finally { polling = false; }
    }
    const pagehide = () => {
      alive.current = false;
      for (const track of tracks) track.stop();
      cleanup.current = disconnect();
    };
    window.addEventListener('pagehide', pagehide);
    void discover(); const timer = setInterval(() => void discover(), 10000);
    return () => {
      alive.current = false; clearInterval(timer);
      window.removeEventListener('pagehide', pagehide);
      room.off(RoomEvent.TrackPublished, updateSubscriptions).off(RoomEvent.LocalTrackUnpublished, stopped).off(RoomEvent.Disconnected, disconnected);
      for (const track of tracks) track.stop();
      cleanup.current = disconnect();
    };
    // The room owns a single lifetime; callbacks read operation state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  useEffect(() => {
    if (!nativeStream) return;
    let active = true;
    // Capture may be selected while idle. Authorization, explicit gesture and the native picker remain required.
    const sync = () => { void window.blueprintStreamDesktop!.configure({ available: share, expires }).then(() => { if (active) setNativeReady(true); }).catch(() => { if (active) { setNativeReady(false); onNotice('Integração Windows indisponível. Reabra o convite.'); void room.disconnect(true); } }); };
    sync(); const timer = setInterval(sync, 5000);
    return () => { active = false; clearInterval(timer); void window.blueprintStreamDesktop!.configure({ available: false, expires: 0 }).catch(() => undefined); };
  }, [nativeStream, share, expires, room, onNotice]);
  async function publish() {
    if (busyRef.current || !share || (desktop && !nativeReady)) return;
    busyRef.current = true; setBusy(true); onNotice('');
    let phase = 'capture';
    try {
      if (publishing.current) {
        await room.localParticipant.setScreenShareEnabled(false); publishing.current = false;
        await post({ action: 'stopped' }).catch(() => undefined);
        if (selectedLabel.current === null) { cleanup.current = disconnect(); await cleanup.current; }
      } else {
        const target = SCREEN_QUALITIES[fps === 60 ? 'detail' : 'balanced'];
        // Capture first: cancelled selection consumes no media admission or participant minutes.
        const tracks = await room.localParticipant.createScreenTracks({ audio: true, resolution: { width: target.width, height: target.height, frameRate: fps } });
        pending.current.push(...tracks);
        if (!alive.current || tracks.some(track => track.mediaStreamTrack.readyState !== 'live')) throw Error('cancelled');
        phase = 'connect'; await connect();
        phase = 'publish';
        for (const track of tracks) {
          if (!alive.current || track.mediaStreamTrack.readyState !== 'live') throw Error('cancelled');
          await room.localParticipant.publishTrack(track, { source: track.kind === Track.Kind.Video ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio, screenShareEncoding: { maxBitrate: target.bitrate, maxFramerate: fps }, degradationPreference: 'balanced' });
        }
        if (!alive.current || room.state !== ConnectionState.Connected || tracks.some(track => track.mediaStreamTrack.readyState !== 'live')) throw Error('cancelled');
        pending.current.splice(0); publishing.current = true;
        void post({ action: 'announce', attempt: crypto.randomUUID() }).catch(() => undefined);
      }
    } catch (error) {
      const category = error instanceof Error && ['NotAllowedError','NotFoundError','TrackInvalidError','PublishTrackError','PublishPermissionError','ConnectionError','TypeError','Error'].includes(error.name) ? error.name : 'unknown';
      console.warn('stream_publish_failed', phase, category);
      for (const track of pending.current.splice(0)) track.stop();
      await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined); publishing.current = false;
      if (selectedLabel.current === null) { cleanup.current = disconnect(); await cleanup.current; }
      if (alive.current) onNotice('Compartilhamento cancelado ou indisponível. Tente novamente.');
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function watch(stream: AvailableStream) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); onNotice('');
    try {
      selectedLabel.current = stream.label; targetIdentity.current = stream.identity; setSelection(stream.label); setSetting(value => ({ ...value, muted: true }));
      await connect(); subscriptions();
    } catch {
      selectedLabel.current = null; targetIdentity.current = ''; setSelection(null); subscriptions();
      if (!publishing.current) { cleanup.current = disconnect(); await cleanup.current; }
      if (alive.current) onNotice('Não foi possível assistir. Atualize a lista e tente novamente.');
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function stopWatching() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      selectedLabel.current = null; targetIdentity.current = ''; setSelection(null); subscriptions();
      if (!publishing.current) { cleanup.current = disconnect(); await cleanup.current; }
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  function select(sid: string) { if (sid === own?.publication.trackSid) { void stopWatching(); return; } const stream = available.find(item => item.sid === sid); if (stream) void watch(stream); }
  function adjust(value: VolumeSetting) { setSetting(value); if (!value.muted) void room.startAudio().catch(() => onNotice('Clique em Ouvir novamente para liberar a reprodução.')); }
  return <><div className="stream-actions"><h1>{intent === 'share' && share ? 'Transmitir' : 'Assistir'}</h1>
    {share && <><label>Fluidez<select value={fps} onChange={event => setFps(Number(event.target.value) as 30 | 60)} disabled={busy || !!own}><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><button className="primary" disabled={busy || (desktop && !nativeReady)} onClick={() => void publish()}>{busy ? 'Aguarde…' : own ? 'Parar transmissão' : 'Selecionar tela'}</button></>}
    {selection !== null && <button disabled={busy} onClick={() => void stopWatching()}>Parar de assistir</button>}
    </div>
    {share && <p className="muted">Escolha uma tela e confirme o áudio no seletor. Áudio do sistema pode incluir Discord. No Windows, áudio exclusivo do aplicativo continua experimental.</p>}
    <div className="stream-list" role="group" aria-label="Transmissões disponíveis">{available.filter(stream => stream.identity !== room.localParticipant.identity).map(stream => <button disabled={busy} key={stream.label} aria-pressed={selection === stream.label} onClick={() => void watch(stream)}>Assistir · Transmissão {stream.label}</button>)}</div>
    {current ? <ScreenViewer current={current} screens={screens} mini={false} hasAudio={audio.some(track => track.participant.identity === current.participant.identity)} setting={setting} onSetting={adjust} onSelect={select} onExpand={() => undefined} onHide={() => undefined} onNotice={onNotice}/> : <div className="stream-empty"><p>{available.length ? 'Escolha uma transmissão para assistir.' : 'Nenhuma transmissão ativa.'}</p><p className="muted">A lista não mantém conexão de mídia. Você conecta somente ao transmitir ou assistir.</p></div>}
    <StreamMetrics room={room}/>
    <IncomingAudio volumes={{}} screenOnly screenIdentity={current?.participant.identity} screenSetting={setting} globalMuted={!current || setting.muted}/>
  </>;
}
