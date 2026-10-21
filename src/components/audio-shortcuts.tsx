'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { shortcutAction } from '@/lib/client/shortcuts';
import type { AudioAction } from '@/lib/client/audio-controller';
import { AccountShortcutSettings, useAccountBindings } from './account-shortcuts';
import { currentPreferenceAccount } from '@/lib/client/preferences';

export function useAudioShortcuts(dispatch: (action: AudioAction) => void, available = true, state = { microphone: false, muted: false, combined: false }) {
  const {bindings}=useAccountBindings();
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [bridgeNotice,setBridgeNotice]=useState('');
  const recording = useRef(false);
  const controllable=available&&!!currentPreferenceAccount();
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (window.blueprintDesktop || recording.current || !document.hasFocus()) return;
    const action = shortcutAction(event, bindings);
    if (action) { event.preventDefault(); dispatch(action); }
  });
  const nativeAction = useEffectEvent((action: AudioAction) => { if (controllable && !recording.current) dispatch(action); });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    const record = (event: Event) => { recording.current = (event as CustomEvent<boolean>).detail; };
    window.addEventListener('keydown', listener); window.addEventListener('blueprint-recording', record);
    const conflictSubscription = window.blueprintDesktop?.onConflicts(setConflicts);
    const unsubscribe = window.blueprintDesktop?.onAction(action => nativeAction(action));
    return () => { conflictSubscription?.(); unsubscribe?.(); window.removeEventListener('keydown', listener); window.removeEventListener('blueprint-recording', record); void window.blueprintDesktop?.configure({ bindings: { microphone: '', listening: '', all: '' }, available: false, microphone: false, muted: false, combined: false }).catch(()=>undefined); };
  }, []);
  const { microphone, muted, combined } = state;
  useEffect(() => {
    let active = true;
    const sync=()=>{void window.blueprintDesktop?.configure({ bindings, available:controllable, microphone, muted, combined }).then(result => { if (active) {setConflicts(result.conflicts);setBridgeNotice('');} }).catch(()=>{if(active)setBridgeNotice('Não foi possível sincronizar os controles desktop. Saia da chamada e reabra o aplicativo.');});};
    sync();const timer=setInterval(sync,5000);
    return () => { active = false;clearInterval(timer); };
  }, [bindings, controllable, microphone, muted, combined]); // Native state mirrors the SDK; never persists live mute.
  return { conflicts, bridgeNotice };
}
export function AudioShortcuts({ conflicts, bridgeNotice }: ReturnType<typeof useAudioShortcuts>) {
  return <details data-shortcut-editor><summary>Atalhos de teclado</summary>
    <p className="muted">{typeof window !== 'undefined' && window.blueprintDesktop ? 'Atalhos globais funcionam com a janela minimizada ou na bandeja. Jogos em modo exclusivo podem interceptá-los.' : 'No navegador, a página precisa estar em foco. Atalhos não funcionam enquanto outro aplicativo está em foco.'}</p>
    <AccountShortcutSettings/>{bridgeNotice&&<p role="alert">{bridgeNotice}</p>}{conflicts.length > 0 && <p role="status">Atalhos indisponíveis no Windows: {conflicts.join(', ')}. Escolha outra combinação.</p>}
  </details>;
}
