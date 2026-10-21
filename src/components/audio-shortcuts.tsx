'use client';
import { useEffect, useEffectEvent, useState } from 'react';
import { readPreferences, savePreferences } from '@/lib/client/preferences';
import { actionLabels, audioActions, bindingFromEvent, emptyShortcuts, shortcutAction, type Shortcuts } from '@/lib/client/shortcuts';
import type { AudioAction } from '@/lib/client/audio-controller';

export function useAudioShortcuts(dispatch: (action: AudioAction) => void) {
  const [bindings, setBindings] = useState(() => readPreferences().shortcuts);
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (!document.hasFocus()) return;
    const action = shortcutAction(event, bindings);
    if (action) { event.preventDefault(); dispatch(action); }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  function change(value: Shortcuts) { setBindings(value); savePreferences({ shortcuts: value }); }
  return { bindings, change };
}
export function AudioShortcuts({ bindings, change }: ReturnType<typeof useAudioShortcuts>) {
  const [notice, setNotice] = useState('');
  return <details className="shortcut-settings" data-shortcut-editor><summary>Atalhos de teclado</summary>
    <p className="muted">Funcionam com o aplicativo em foco, fora dos campos de digitação. Não funcionam enquanto um jogo está em foco.</p>
    <p className="muted">Selecione um campo e pressione Ctrl + Shift + uma letra. Algumas combinações são reservadas pelo navegador ou sistema.</p>
    {audioActions.map(action => <div className="shortcut-row" key={action}><label>{actionLabels[action]}<input readOnly aria-label={`Atalho: ${actionLabels[action]}`} value={bindings[action] || 'Não definido'} onKeyDown={event => {
      if (event.key === 'Tab' || event.key === 'Escape') return;
      event.preventDefault();
      if (event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      const binding = bindingFromEvent(event.nativeEvent);
      if (!binding) { setNotice('Combinação indisponível. Use Ctrl + Shift + outra letra.'); return; }
      if (audioActions.some(other => other !== action && bindings[other] === binding)) { setNotice('Esse atalho já está atribuído a outro controle.'); return; }
      change({ ...bindings, [action]: binding }); setNotice('Atalho salvo neste navegador.');
    }} /></label><button type="button" aria-label={`Limpar atalho: ${actionLabels[action]}`} onClick={() => { change({ ...bindings, [action]: '' }); setNotice('Atalho removido.'); }}>Limpar</button></div>)}
    <button type="button" onClick={() => { change({ ...emptyShortcuts }); setNotice('Todos os atalhos foram removidos.'); }}>Redefinir atalhos</button>
    <p role="status" className="muted">{notice}</p>
  </details>;
}
