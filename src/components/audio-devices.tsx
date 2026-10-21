'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, type Room } from 'livekit-client';
import { readPreferences, savePreferences } from '@/lib/client/preferences';
import { setSoundsOutput } from '@/lib/client/call-sounds';

export function useAudioDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const alive = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      if (alive.current && version === request.current) { setDevices(list.filter(device => device.kind !== 'videoinput' && device.deviceId)); setError(''); }
    } catch { if (alive.current) setError('Não foi possível listar os dispositivos. Confira as configurações do navegador.'); }
  }, []);
  useEffect(() => {
    alive.current = true;
    let permission: PermissionStatus | undefined;
    let active = true;
    void Promise.resolve().then(() => { if (active) return refresh(); });
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    window.addEventListener('focus', refresh);
    void navigator.permissions?.query({ name: 'microphone' as PermissionName }).then(result => {
      if (!active) return;
      permission = result; permission.addEventListener('change', refresh);
    }).catch(() => undefined);
    return () => { active = false; alive.current = false; navigator.mediaDevices?.removeEventListener('devicechange', refresh); window.removeEventListener('focus', refresh); permission?.removeEventListener('change', refresh); };
  }, [refresh]);
  return { devices, refresh, error };
}

export function DeviceOptions({ devices, kind }: { devices: MediaDeviceInfo[]; kind: 'audioinput' | 'audiooutput' }) {
  const list = devices.filter(device => device.kind === kind);
  return <><option value="default">{list.find(device => device.deviceId === 'default')?.label || 'Padrão do sistema'}</option>{list.filter(device => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${kind === 'audioinput' ? 'Microfone' : 'Saída'} ${index + 1} (nome indisponível)`}</option>)}</>;
}

type OutputPicker = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
export function AudioDevices({ room, microphoneBusy, processing }: { room: Room; microphoneBusy: boolean; processing: ReturnType<typeof import('./microphone-processing').useMicrophoneProcessing> }) {
  const { devices, refresh, error } = useAudioDevices();
  const [input, setInput] = useState(() => room.getActiveDevice('audioinput') || readPreferences().microphone);
  const [output, setOutput] = useState(room.getActiveDevice('audiooutput') || 'default');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const fallbackAttempts = useRef(new Set<string>());
  const alive = useRef(true);
  const supported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const pickerSupported = typeof navigator !== 'undefined' && !!(navigator.mediaDevices as OutputPicker)?.selectAudioOutput;
  useEffect(() => {
    alive.current = true;
    const changed = (kind: MediaDeviceKind, id: string) => {
      if (kind === 'audioinput') { setInput(id || 'default'); savePreferences({ microphone: id || 'default' }); }
      if (kind === 'audiooutput') { setOutput(id || 'default'); void setSoundsOutput(room, id || 'default'); }
    };
    room.on(RoomEvent.LocalTrackPublished, refresh).on(RoomEvent.ActiveDeviceChanged, changed);
    return () => { alive.current = false; room.off(RoomEvent.LocalTrackPublished, refresh).off(RoomEvent.ActiveDeviceChanged, changed); };
  }, [room, refresh]);
  const select = useCallback(async (kind: 'audioinput' | 'audiooutput', id: string, fallback = false) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setNotice('');
    const inputTracks = kind === 'audioinput' ? [...room.localParticipant.audioTrackPublications.values()].map(publication => publication.track) : [];
    try {
      if (!await room.switchActiveDevice(kind, id)) throw new Error('Device unavailable');
      if (!alive.current) return;
      if (kind === 'audioinput') { setInput(id); savePreferences({ microphone: id }); } else setOutput(id);
      if (fallback) setNotice('O dispositivo foi desconectado. Usando o padrão do sistema.');
    } catch { if (alive.current) setNotice('Não foi possível trocar o dispositivo. Selecione o padrão do sistema ou confira as permissões de saída do navegador.'); }
    finally { lock.current = false; if (alive.current) setPending(false); else inputTracks.forEach(track => track?.stop()); }
  }, [room]);
  useEffect(() => {
    if (pending || microphoneBusy) return;
    let active = true;
    // A permission-filtered list is not evidence that a saved device was unplugged.
    const labeled = (kind: MediaDeviceKind) => devices.some(device => device.kind === kind && device.label);
    const fallback = (kind: 'audioinput' | 'audiooutput', id: string) => {
      const key = `${kind}:${id}`;
      if (id === 'default' || !labeled(kind) || devices.some(device => device.kind === kind && device.deviceId === id)) { fallbackAttempts.current.delete(key); return; }
      if (fallbackAttempts.current.has(key)) return;
      queueMicrotask(() => { if (active && !lock.current) { fallbackAttempts.current.add(key); void select(kind, 'default', true); } });
    };
    fallback('audioinput', input);
    if (supported) fallback('audiooutput', output);
    return () => { active = false; };
  }, [devices, input, output, pending, microphoneBusy, select, supported]);
  async function pickOutput() {
    if (lock.current) return;
    lock.current = true; setPending(true);
    try {
      const device = await (navigator.mediaDevices as OutputPicker).selectAudioOutput?.();
      lock.current = false;
      if (device && alive.current) { await refresh(); await select('audiooutput', device.deviceId); }
    } catch { if (alive.current) setNotice('Seleção de saída cancelada ou indisponível. O áudio continua na saída atual.'); }
    finally { lock.current = false; if (alive.current) setPending(false); }
  }
  return <div className="audio-device-settings">
    <label>Microfone<select aria-label="Selecionar microfone" value={input} disabled={pending || microphoneBusy} onChange={event => void select('audioinput', event.target.value)}><DeviceOptions devices={devices} kind="audioinput" /></select></label>
    {supported ? <label>Saída de áudio<select aria-label="Selecionar saída de áudio" value={output} disabled={pending} onChange={event => void select('audiooutput', event.target.value)}><DeviceOptions devices={devices} kind="audiooutput" /></select></label> : <p>A seleção de saída não é suportada neste navegador. O áudio segue o padrão do sistema operacional.</p>}
    {supported && pickerSupported && <button onClick={pickOutput} disabled={pending}>Escolher saída de áudio</button>}
    <label className="checkbox-label"><input type="checkbox" checked={processing.enabled} disabled={!processing.supported || pending || microphoneBusy} onChange={event => void processing.change(event.target.checked)} />Supressão de ruído</label>
    <p className="muted" role="status">{processing.status}</p>
    <p className="muted">Os nomes disponíveis são informados pelo navegador. Após permitir o microfone, a lista é atualizada. Você não precisa permitir o microfone para ouvir.</p>
    {(notice || error) && <p role="status">{notice || error}</p>}
  </div>;
}
