'use client';
import { useEffect, useState } from 'react';
export function DesktopSettings() {
  const [settings, setSettings] = useState<{startup:boolean;profile:string;version:string}|null>(null);
  const [notice,setNotice] = useState('');
  useEffect(()=>{ if(window.blueprintDesktop)void window.blueprintDesktop.settings().then(setSettings).catch(()=>setNotice('Integração desktop indisponível. Saia da chamada e reabra o aplicativo.'));else if(/BlueprintRoom\//.test(navigator.userAgent))queueMicrotask(()=>setNotice('A ponte desktop não carregou. Reinstale a versão atual; não há atalhos globais disponíveis.')); },[]);
  if (!settings) return notice?<p role="alert">{notice}</p>:null;
  return <details><summary>Aplicativo Windows</summary><p className="muted">{settings.version} · {settings.profile} · Versão de teste sem assinatura. Atualizações manuais.</p><label className="checkbox-label"><input type="checkbox" checked={settings.startup} onChange={event=>{void window.blueprintDesktop?.startup(event.target.checked).then(startup=>setSettings({...settings,startup})).catch(()=>setNotice('Disponível no aplicativo instalado.'));}}/>Iniciar com o Windows</label><p className="muted">Fechar a janela mantém o aplicativo na bandeja. Use “Sair do aplicativo” para encerrar. Iniciar nunca conecta à mídia automaticamente.</p><p role="status">{notice}</p></details>;
}
