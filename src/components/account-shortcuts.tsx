'use client';
import { useEffect, useState } from 'react';
import { legacyLocalShortcuts, readPreferences, saveAccountShortcuts, shortcutPlatform } from '@/lib/client/preferences';
import type { Shortcuts } from '@/lib/client/shortcuts';
import { KeybindingRecorder } from './keybinding-recorder';
export function useAccountBindings() {
  const [bindings,setBindings]=useState(()=>readPreferences().shortcuts);
  useEffect(()=>{const update=()=>setBindings(readPreferences().shortcuts);window.addEventListener('blueprint-preferences',update);return()=>window.removeEventListener('blueprint-preferences',update);},[]);
  async function change(value:Shortcuts){await saveAccountShortcuts(value);}
  return {bindings,change};
}
export function AccountShortcutSettings({onSaved}: {onSaved?:()=>Promise<void>}) {
  const {bindings,change}=useAccountBindings();const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  async function save(value:Shortcuts){await change(value);await onSaved?.();}
  return <><p className="muted">Atalhos salvos na conta para {shortcutPlatform()==='windowsDesktop'?'Windows desktop':'navegador'}. Atalhos locais antigos não têm prioridade.</p><KeybindingRecorder bindings={bindings} change={save}/>
    {legacyLocalShortcuts()&&<button disabled={busy} onClick={()=>{const old=legacyLocalShortcuts();if(!old)return;setBusy(true);void save(old).then(()=>setNotice('Atalhos locais importados para a conta.')).catch(error=>setNotice(error.message)).finally(()=>setBusy(false));}}>Importar atalhos locais antigos</button>}{notice&&<p role="status">{notice}</p>}</>;
}
