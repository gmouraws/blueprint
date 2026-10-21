'use client';
import { useEffect, useRef, useState } from 'react';
import { actionLabels, audioActions, bindingFromEvent, emptyShortcuts, type Shortcuts } from '@/lib/client/shortcuts';
import type { AudioAction } from '@/lib/client/audio-controller';

export function KeybindingRecorder({ bindings, change }: { bindings: Shortcuts; change: (value: Shortcuts) => void | Promise<void> }) {
  const [editing, setEditing] = useState<AudioAction | null>(null);
  const [candidate, setCandidate] = useState('');
  const [notice, setNotice] = useState('');
  const [busy,setBusy]=useState(false);
  async function save(value:Shortcuts,message:string){setBusy(true);setNotice('');try{await change(value);setEditing(null);setNotice(message);}catch(error){setNotice(error instanceof Error?error.message:'Não foi possível salvar.');}finally{setBusy(false);}}
  const capture = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!editing) return;
    capture.current?.focus();
    window.dispatchEvent(new CustomEvent('blueprint-recording', { detail: true }));
    function record(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setEditing(null); return; }
      // Tab preserves keyboard access to Save/Cancel; modified Tab can be recorded.
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) return;
      if (document.activeElement !== capture.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat || event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')) return;
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      const binding = bindingFromEvent(event);
      setCandidate(binding);
      setNotice(!binding ? 'Combinação reservada ou não suportada. Use modificadores ou uma tecla de função.' : audioActions.some(action => action !== editing && bindings[action] === binding) ? 'Esse atalho já está atribuído a outro controle.' : '');
    }
    window.addEventListener('keydown', record, true);
    return () => { window.removeEventListener('keydown', record, true); window.dispatchEvent(new CustomEvent('blueprint-recording', { detail: false })); };
  }, [editing, bindings]);
  const duplicate = audioActions.some(action => action !== editing && bindings[action] === candidate);
  return <fieldset disabled={busy} data-shortcut-editor className="shortcut-settings" style={{border:0,padding:0,margin:0,minWidth:0}}>
    {audioActions.map(action => <div className="shortcut-item" key={action}><div className="shortcut-row"><span>{actionLabels[action]}<small className="muted">{bindings[action] || 'Sem atalho'}</small></span><button type="button" aria-label={`Definir atalho: ${actionLabels[action]}`} onClick={() => { setCandidate(''); setNotice(''); setEditing(action); }}>{bindings[action] ? 'Alterar' : 'Definir atalho'}</button></div>
      {editing === action && <div className="shortcut-recording"><button type="button" ref={capture} aria-label="Gravar combinação">{candidate || 'Pressione as teclas desejadas…'}</button><div className="shortcut-actions"><button type="button" disabled={!candidate || duplicate} onClick={() => void save({ ...bindings, [action]: candidate },'Atalho salvo na conta.')}>Salvar</button><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" onClick={() => void save({ ...bindings, [action]: '' },'Atalho removido.')}>Remover atalho</button></div></div>}
    </div>)}
    <div className="settings-actions"><button type="button" onClick={() => void save({ ...emptyShortcuts },'Todos os atalhos foram removidos.')}>Redefinir atalhos</button></div>
    <p className="muted">Escape cancela. Algumas combinações são reservadas pelo navegador ou Windows; nem todos os conflitos podem ser detectados.</p><p role="status" className="muted">{notice}</p>
  </fieldset>;
}
