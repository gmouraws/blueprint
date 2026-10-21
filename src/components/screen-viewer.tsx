'use client';

import { useEffect, useRef, useState } from 'react';
import { VideoTrack, type TrackReference } from '@livekit/components-react';
import { Icon } from './icons';
import { ControlMenu } from './control-menu';
import { ScreenMeasurements } from './screen-quality';
import { VolumeControl, type VolumeSetting } from './incoming-audio';
import { CallAudioControls, type CallAudioControlsProps } from './call-audio-controls';

export function ScreenViewer({ current, screens, mini, hasAudio, setting, onSetting, onSelect, onExpand, onHide, onNotice, audioControls }: {
  current: TrackReference; screens: TrackReference[]; mini: boolean; hasAudio: boolean;
  setting: VolumeSetting; onSetting: (setting: VolumeSetting) => void; onSelect: (sid: string) => void;
  onExpand: () => void; onHide: () => void; onNotice: (notice: string) => void; audioControls: CallAudioControlsProps;
}) {
  const viewer = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState(true);
  const [fit, setFit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === viewer.current);
    document.addEventListener('fullscreenchange', changed);
    return () => { clearTimeout(timer.current); document.removeEventListener('fullscreenchange', changed); };
  }, []);
  function reveal() {
    setActive(true); clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), 2200);
  }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await viewer.current?.requestFullscreen(); }
    catch { onNotice('Não foi possível abrir em tela cheia neste navegador.'); }
  }
  return <div className={`screen-viewer ${fit ? 'viewer-fit' : 'viewer-original'}`} ref={viewer} data-controls-visible={active} tabIndex={0} role="group" aria-label={`Tela compartilhada por ${current.participant.name || 'Participante'}`} onPointerMove={reveal} onPointerDown={reveal} onFocusCapture={reveal}>
    {/* Keep the element at the available viewing size for LiveKit's adaptive observer.
        scale-down bounds the actual decoded image without trapping a low layer after mini-player use. */}
    <VideoTrack trackRef={current} muted playsInline className="shared-video" />
    <div className="viewer-toolbar">
      <select aria-label="Escolher tela compartilhada" value={current.publication.trackSid} onChange={event => onSelect(event.target.value)}>{screens.map(track => <option value={track.publication.trackSid} key={track.publication.trackSid}>{track.participant.name || 'Participante'}{track.participant.isLocal ? ' (você)' : ''}</option>)}</select>
      {mini && <button className="icon-button" onClick={onExpand} title="Voltar à sala" aria-label="Expandir tela e voltar à sala"><Icon name="expand" /></button>}
      <ControlMenu label="Opções de visualização" className="viewer-options">
        <p className="menu-title">Exibição</p>
        <button aria-pressed={!fit} onClick={() => setFit(false)}>Tamanho original</button>
        <button aria-pressed={fit} onClick={() => setFit(true)}>Ajustar à área</button>
        <button onClick={toggleFullscreen} aria-label="Alternar tela cheia"><Icon name="expand" />{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
        <p className="muted">O tamanho original limita a imagem à resolução recebida. Ampliar pode reduzir a nitidez.</p>
        <div className="screen-audio-controls">{current.participant.isLocal ? <p>Sua prévia fica sem som para evitar eco.</p> : hasAudio ? <VolumeControl label="Áudio da tela selecionada" setting={setting} onChange={onSetting} /> : <p>Esta tela não tem áudio disponível.</p>}</div>
        <ScreenMeasurements track={current} />
      </ControlMenu>
      {mini && <button className="icon-button" onClick={onHide} title="Ocultar mini-player" aria-label="Ocultar mini-player sem desligar áudio"><Icon name="close" /></button>}
    </div>
    {fullscreen && <div className="fullscreen-audio"><CallAudioControls {...audioControls} /></div>}
  </div>;
}
