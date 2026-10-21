'use client';
import { useEffect, useState } from 'react';
export function DesktopSettings() {
  const [settings, setSettings] = useState<{startup:boolean;profile:string;version:string}|null>(null);
  const [notice,setNotice] = useState('');
  useEffect(()=>{ void window.blueprintDesktop?.settings().then(setSettings); },[]);
  if (!settings) return null;
  return <details><summary>Aplicativo Windows</summary><p className="muted">{settings.version} · {settings.profile} · Versão de teste sem assinatura. Atualizações manuais.</p><label className="checkbox-label"><input type="checkbox" checked={settings.startup} onChange={event=>{void window.blueprintDesktop?.startup(event.target.checked).then(startup=>setSettings({...settings,startup})).catch(()=>setNotice('Disponível no aplicativo instalado.'));}}/>Iniciar com o Windows</label><p className="muted">Fechar a janela mantém a chamada na bandeja. Use “Sair do aplicativo” para encerrar. Iniciar nunca entra em chamadas automaticamente.</p><p role="status">{notice}</p></details>;
}
