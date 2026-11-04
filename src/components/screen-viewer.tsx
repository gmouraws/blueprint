'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { VideoTrack, type TrackReference } from '@livekit/components-react';
import { Icon } from './icons';
import { ControlMenu } from './control-menu';
import { ScreenMeasurements } from './screen-quality';
import { type VolumeSetting } from './incoming-audio';
import { CallAudioControls, type CallAudioControlsProps } from './call-audio-controls';

export function ScreenViewer({ current, screens, mini, hasAudio, setting, onSetting, onSelect, onExpand, onHide, onNotice, audioControls, listening, viewers }: {
  current: TrackReference; screens: TrackReference[]; mini: boolean; hasAudio: boolean;
  setting: VolumeSetting; onSetting: (setting: VolumeSetting) => void; onSelect: (sid: string) => void;
  onExpand: () => void; onHide: () => void; onNotice: (notice: string) => void; audioControls?: CallAudioControlsProps;
  listening?: { enabled: boolean; toggle: () => void };
  viewers?: number;
}) {
  const viewer = useRef<HTMLDivElement>(null);
  const optionsName = useId();
  const owner = current.participant.name || 'Participante';
  const audible = (!listening || listening.enabled) && !setting.muted;
  function toggleAudio() {
    onSetting({ ...setting, muted: audible });
    if (!audible && listening && !listening.enabled) listening.toggle();
  }
  const [fit, setFit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [displayError, setDisplayError] = useState('');
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === viewer.current);
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('fullscreenchange', changed); };
  }, []);
  useEffect(() => {
    const element = viewer.current;
    if (!fullscreen || !element) return;
    let timer: ReturnType<typeof setTimeout>;
    const hide = () => {
      if (element.querySelector(':popover-open') || element.querySelector('.viewer-toolbar:focus-within')) {
        timer = setTimeout(hide, 2400); return;
      }
      setControlsVisible(false);
    };
    const reveal = () => { clearTimeout(timer); setControlsVisible(true); timer = setTimeout(hide, 2400); };
    timer = setTimeout(hide, 2400);
    element.addEventListener('pointermove', reveal);
    element.addEventListener('pointerdown', reveal);
    element.addEventListener('focusin', reveal);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('pointermove', reveal);
      element.removeEventListener('pointerdown', reveal);
      element.removeEventListener('focusin', reveal);
    };
  }, [fullscreen]);
  async function toggleFullscreen() {
    setDisplayError(''); setControlsVisible(true);
    try {
      if (document.fullscreenElement === viewer.current) await document.exitFullscreen();
      else {
        if (!viewer.current?.requestFullscreen || !document.fullscreenEnabled) throw new Error('fullscreen-unavailable');
        await viewer.current.requestFullscreen();
      }
    } catch {
      const message = 'Não foi possível alternar a tela cheia. Verifique a permissão do aplicativo ou navegador e tente novamente.';
      setDisplayError(message); onNotice(message);
    }
  }
  return <div className={`screen-viewer ${fit ? 'viewer-fit' : 'viewer-original'}${fullscreen && !controlsVisible ? ' viewer-idle' : ''}`} ref={viewer} tabIndex={0} role="group" aria-label={`Tela compartilhada por ${current.participant.name || 'Participante'}`} onKeyDown={event => {
    if (event.key === 'Escape' && document.fullscreenElement === event.currentTarget && !event.currentTarget.querySelector(':popover-open')) {
      event.preventDefault(); void toggleFullscreen();
    }
  }}>
    {/* Keep the element at the available viewing size for LiveKit's adaptive observer.
        scale-down bounds the actual decoded image without trapping a low layer after mini-player use. */}
    <div className="viewer-stage"><VideoTrack trackRef={current} muted playsInline className="shared-video" /></div>
    <div className="viewer-toolbar">
      {viewers !== undefined && <span className="stream-viewer-count muted" aria-live="polite">👁 {viewers} assistindo</span>}
      <ControlMenu label="Escolher tela compartilhada" className="screen-selection-menu" triggerClassName="screen-selector" triggerContent={<><span>{owner}{current.participant.isLocal ? ' (você)' : ''}</span><Icon name="chevron" /></>}>
        <div role="radiogroup" aria-label="Telas disponíveis">{screens.map(track => <label className="screen-option" key={track.publication.trackSid}><input className="sr-only" type="radio" name={optionsName} value={track.publication.trackSid} checked={current.publication.trackSid === track.publication.trackSid} onChange={() => onSelect(track.publication.trackSid)} />{track.participant.name || 'Participante'}{track.participant.isLocal ? ' (você)' : ''}</label>)}</div>
      </ControlMenu>
      {!current.participant.isLocal && hasAudio ? <div className="stream-volume" role="group" aria-label={`Áudio da tela de ${owner}`}>
        <button className="icon-button" aria-label={`${audible ? 'Silenciar' : 'Ouvir'} áudio da tela de ${owner}`} title={audible ? `Silenciar tela de ${owner}` : `Ouvir tela de ${owner}${listening && !listening.enabled ? ' · desligado por padrão' : ''}`} aria-pressed={!audible} onClick={toggleAudio}><Icon name={audible ? 'audio' : 'audioOff'} /></button>
        <input type="range" min="0" max="100" step="5" value={setting.volume} aria-label={`Volume da tela de ${owner}`} aria-valuetext={`${setting.volume}%`} title={`Volume da tela: ${setting.volume}%`} onChange={event => onSetting({ ...setting, volume: Number(event.target.value) })} />
      </div> : <span className="stream-no-audio">{current.participant.isLocal ? 'Prévia sem áudio' : 'Sem áudio'}</span>}
      {mini && <button className="icon-button" onClick={onExpand} title="Voltar à sala" aria-label="Expandir tela e voltar à sala"><Icon name="expand" /></button>}
      <ControlMenu label="Opções de visualização" className="viewer-options">
        <p className="menu-title">Exibição</p>
        <button aria-pressed={!fit} onClick={event => { setFit(false); event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); }}>Tamanho original</button>
        <button aria-pressed={fit} onClick={event => { setFit(true); event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); }}>Ajustar à área</button>
        <button onClick={toggleFullscreen} aria-label="Alternar tela cheia"><Icon name="expand" />{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
        <p className="muted">Original não amplia além da resolução recebida. Ajustar preenche a área sem cortes. Os modos podem parecer iguais quando a imagem já precisa ser reduzida.</p>
        <ScreenMeasurements track={current} />
      </ControlMenu>
      {mini && <button className="icon-button" onClick={onHide} title="Ocultar mini-player" aria-label="Ocultar mini-player sem desligar áudio"><Icon name="close" /></button>}
    </div>
    {displayError && <p className="viewer-error" role="alert">{displayError}</p>}
    {fullscreen && audioControls && <div className="fullscreen-audio"><CallAudioControls {...audioControls} /></div>}
  </div>;
}
