import { Icon } from './icons';

export type CallAudioControlsProps = {
  enabled: boolean; pending: boolean; disabled: boolean; muted: boolean;
  combined: boolean; combinedBusy: boolean;
  onMicrophone: () => void; onCancel: () => void; onListening: () => void; onAll: () => void;
};
export function CallAudioControls({ enabled, pending, disabled, muted, combined, combinedBusy, onMicrophone, onCancel, onListening, onAll }: CallAudioControlsProps) {
  const microphoneLabel = pending ? 'Alterando microfone…' : enabled ? 'Desligar microfone' : 'Ativar microfone';
  const listeningLabel = muted ? 'Restaurar áudio' : 'Silenciar todo o áudio';
  return <div className="audio-toggles" role="group" aria-label="Microfone e áudio recebido">
    <button className="icon-button microphone-toggle" onClick={onMicrophone} disabled={disabled || pending} aria-label={microphoneLabel} title={microphoneLabel} aria-pressed={enabled} aria-busy={pending}>
      <Icon name={enabled ? 'mic' : 'micOff'} className={enabled ? '' : 'mic-off'} />{pending && <span className="pending-mark" aria-hidden="true">…</span>}
    </button>
    <button className={`icon-button listening-toggle ${muted ? 'listening-muted' : ''}`} aria-label={listeningLabel} title={`${listeningLabel} · não altera seu microfone`} aria-pressed={muted} onClick={onListening}><Icon name={muted ? 'headphonesOff' : 'headphones'} /></button>
    <button className={`icon-button ${combined ? 'listening-muted' : ''}`} aria-label={combined ? 'Restaurar estados anteriores' : 'Silenciar tudo'} title={combined ? 'Restaurar estados anteriores' : 'Silenciar tudo · microfone e áudio recebido'} aria-pressed={combined} disabled={combined && combinedBusy} onClick={onAll}><Icon name="audioOff" /></button>
    {pending && <button className="icon-button" onClick={onCancel} aria-label="Cancelar ativação" title="Cancelar ativação"><Icon name="close" /></button>}
    <span className="sr-only" role="status">{pending ? 'Alteração do microfone pendente.' : ''}</span>
  </div>;
}
