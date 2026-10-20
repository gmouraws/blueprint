'use client';

import { createLocalAudioTrack, RoomEvent, Track, ConnectionState, type LocalAudioTrack, type Room } from 'livekit-client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { microphoneError, readPreferences, savePreferences } from '@/lib/client/preferences';
import { DeviceOptions, useAudioDevices } from './audio-devices';

type Operation = { cancelled: boolean; track?: LocalAudioTrack };
export function useMicrophone(room: Room) {
  const operation = useRef<Operation | null>(null);
  const alive = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [timing, setTiming] = useState<{ captureMs: number; publishMs: number; totalMs: number }>();
  const cancel = useCallback(() => {
    if (operation.current) { operation.current.cancelled = true; operation.current.track?.stop(); }
  }, []);
  useEffect(() => {
    alive.current = true;
    room.on(RoomEvent.Disconnected, cancel);
    return () => { alive.current = false; cancel(); room.off(RoomEvent.Disconnected, cancel); };
  }, [room, cancel]);
  async function toggle() {
    if (operation.current || room.state !== ConnectionState.Connected) return;
    const op: Operation = { cancelled: false }; operation.current = op;
    setPending(true); setNotice('');
    const started = performance.now(); let captureMs = 0; let publishMs = 0;
    const waiting = setTimeout(() => { if (alive.current && !op.cancelled) setNotice('A ativação ainda está pendente. Confira o pedido de permissão do navegador. Você pode cancelar e continuar ouvindo.'); }, 8000);
    const current = () => alive.current && !op.cancelled && room.state === ConnectionState.Connected;
    try {
      const existing = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (existing?.track && existing.track.mediaStreamTrack.readyState === 'live') {
        if (existing.isMuted) await existing.unmute(); else await existing.mute();
        if (!current()) await existing.mute();
      } else {
        if (existing?.track) await room.localParticipant.unpublishTrack(existing.track, true);
        op.track = await createLocalAudioTrack(room.options.audioCaptureDefaults);
        captureMs = performance.now() - started;
        if (!current()) { op.track.stop(); return; }
        const publishing = performance.now();
        await room.localParticipant.publishTrack(op.track, { source: Track.Source.Microphone, stopMicTrackOnMute: false });
        publishMs = performance.now() - publishing;
        if (!current()) { op.track.stop(); await room.localParticipant.unpublishTrack(op.track, true); }
      }
    } catch (failure) { op.track?.stop(); if (current()) setNotice(microphoneError(failure)); }
    finally {
      clearTimeout(waiting); operation.current = null;
      if (alive.current) { setPending(false); setTiming({ captureMs: Math.round(captureMs), publishMs: Math.round(publishMs), totalMs: Math.round(performance.now() - started) }); }
    }
  }
  function cancelPending() { cancel(); setNotice('Ativação cancelada. Se o pedido do navegador continuar aberto, feche-o. Uma captura concluída depois será liberada.'); }
  return { pending, notice, timing, toggle, cancel: cancelPending, stop: cancel };
}

export type MicrophoneCheckHandle = { stop: () => void };
export const MicrophoneCheck = forwardRef<MicrophoneCheckHandle, { disabled: boolean }>(function MicrophoneCheck({ disabled }, ref) {
  const { devices, refresh } = useAudioDevices();
  const [selected, setSelected] = useState('default');
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const alive = useRef(false);
  const acquiring = useRef(false);
  const pendingContext = useRef<AudioContext | null>(null);
  const resources = useRef<{ track: LocalAudioTrack; context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; timer: ReturnType<typeof setInterval> } | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    if (pendingContext.current && pendingContext.current.state !== 'closed') void pendingContext.current.close().catch(() => undefined);
    pendingContext.current = null;
    const current = resources.current; resources.current = null;
    if (current) { clearInterval(current.timer); current.source.disconnect(); current.analyser.disconnect(); current.track.stop(); void current.context.close().catch(() => undefined); }
    if (alive.current) { setTesting(false); setLevel(0); }
  }, []);
  useImperativeHandle(ref, () => ({ stop }), [stop]);
  useEffect(() => { alive.current = true; window.addEventListener('pagehide', stop); return () => { alive.current = false; stop(); window.removeEventListener('pagehide', stop); }; }, [stop]);
  useEffect(() => {
    let active = true;
    if (!devices.some(device => device.kind === 'audioinput' && device.deviceId === selected) && selected !== 'default' && devices.some(device => device.kind === 'audioinput' && device.label)) {
      queueMicrotask(() => { if (active) { stop(); setSelected('default'); savePreferences({ microphone: 'default' }); setNotice('O microfone ficou indisponível. Usando o padrão do sistema no próximo teste.'); } });
    }
    return () => { active = false; };
  }, [devices, selected, stop]);
  async function start() {
    if (acquiring.current || disabled) return;
    stop(); const version = generation.current; acquiring.current = true; setPending(true); setNotice('');
    let track: LocalAudioTrack | undefined; let context: AudioContext | undefined;
    const waiting = setTimeout(() => { if (alive.current && version === generation.current) setNotice('Confira o pedido de permissão do navegador. Você pode cancelar o teste.'); }, 8000);
    try {
      // Resume during the explicit gesture; this graph never connects to the speakers.
      context = new AudioContext(); pendingContext.current = context; void context.resume().catch(() => undefined);
      track = await createLocalAudioTrack({ deviceId: selected, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (!alive.current || version !== generation.current) { track.stop(); if (context.state !== 'closed') await context.close(); return; }
      pendingContext.current = null;
      const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      const analyser = context.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => { analyser.getFloatTimeDomainData(buffer); const rms = Math.sqrt(buffer.reduce((sum, sample) => sum + sample * sample, 0) / buffer.length); if (alive.current) setLevel(Math.min(100, Math.round(rms * 400))); }, 100);
      resources.current = { track, context, source, analyser, timer };
      track.mediaStreamTrack.addEventListener('ended', () => { stop(); if (alive.current) setNotice('O microfone ficou indisponível. Confira a conexão do dispositivo.'); }, { once: true });
      setTesting(true); void refresh();
    } catch (failure) { track?.stop(); if (context?.state !== 'closed') void context?.close().catch(() => undefined); if (alive.current && version === generation.current) setNotice(microphoneError(failure)); }
    finally { clearTimeout(waiting); pendingContext.current = null; acquiring.current = false; if (alive.current) setPending(false); }
  }
  return <details className="microphone-check" onToggle={event => { if (!event.currentTarget.open) stop(); else { setSelected(readPreferences().microphone); void refresh(); } }}><summary>Testar microfone (opcional)</summary>
    <label>Microfone<select aria-label="Microfone para teste" value={selected} disabled={disabled || pending || testing} onChange={event => { setSelected(event.target.value); savePreferences({ microphone: event.target.value }); }}><DeviceOptions devices={devices} kind="audioinput" /></select></label>
    <div className="test-actions"><button type="button" disabled={disabled || pending || testing} onClick={start}>{pending ? 'Ativando…' : 'Testar microfone'}</button>{(testing || pending) && <button type="button" onClick={() => { stop(); setNotice('Teste encerrado. Qualquer captura pendente será liberada ao concluir.'); }}>Parar teste</button>}</div>
    <label>Nível de entrada<meter aria-label="Nível do microfone" min={0} max={100} value={level} /></label><p className="muted">O teste usa o microfone sem reproduzir sua voz. Ao entrar, ele será desligado.</p>{notice && <p role="status">{notice}</p>}
  </details>;
});
