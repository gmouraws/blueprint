'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { readPreferences, savePreferences } from '@/lib/client/preferences';
import { shortcutAction, type Shortcuts } from '@/lib/client/shortcuts';
import type { AudioAction } from '@/lib/client/audio-controller';
import { KeybindingRecorder } from './keybinding-recorder';

export function useAudioShortcuts(dispatch: (action: AudioAction) => void, available = true, state = { microphone: false, muted: false, combined: false }) {
  const [bindings, setBindings] = useState(() => readPreferences().shortcuts);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const recording = useRef(false);
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (window.blueprintDesktop || recording.current || !document.hasFocus()) return;
    const action = shortcutAction(event, bindings);
    if (action) { event.preventDefault(); dispatch(action); }
  });
  const nativeAction = useEffectEvent((action: AudioAction) => { if (available && !recording.current) dispatch(action); });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    const record = (event: Event) => { recording.current = (event as CustomEvent<boolean>).detail; };
    window.addEventListener('keydown', listener); window.addEventListener('blueprint-recording', record);
    const conflictSubscription = window.blueprintDesktop?.onConflicts(setConflicts);
    const unsubscribe = window.blueprintDesktop?.onAction(action => nativeAction(action));
    return () => { conflictSubscription?.(); unsubscribe?.(); window.removeEventListener('keydown', listener); window.removeEventListener('blueprint-recording', record); void window.blueprintDesktop?.configure({ bindings: { microphone: '', listening: '', all: '' }, available: false, microphone: false, muted: false, combined: false }); };
  }, []);
  const { microphone, muted, combined } = state;
  useEffect(() => {
    let active = true;
    void window.blueprintDesktop?.configure({ bindings, available, microphone, muted, combined }).then(result => { if (active) setConflicts(result.conflicts); });
    return () => { active = false; };
  }, [bindings, available, microphone, muted, combined]); // Native state mirrors the SDK; never persists live mute.
  function change(value: Shortcuts) { setBindings(value); savePreferences({ shortcuts: value }); }
  return { bindings, change, conflicts };
}
export function AudioShortcuts({ bindings, change, conflicts }: ReturnType<typeof useAudioShortcuts>) {
  return <details data-shortcut-editor><summary>Atalhos de teclado</summary>
    <p className="muted">{typeof window !== 'undefined' && window.blueprintDesktop ? 'Atalhos globais funcionam com a janela minimizada ou na bandeja. Jogos em modo exclusivo podem interceptá-los.' : 'No navegador, a página precisa estar em foco. Atalhos não funcionam enquanto outro aplicativo está em foco.'}</p>
    <KeybindingRecorder bindings={bindings} change={change}/>{conflicts.length > 0 && <p role="status">Atalhos indisponíveis no Windows: {conflicts.join(', ')}. Escolha outra combinação.</p>}
  </details>;
}
