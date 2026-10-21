'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AccountLogin } from './account-login';
import { AccountProfile, loadProfile } from './account-profile';
import { Brand, Icon } from './icons';
import { MAX_PARTICIPANTS, type ConnectionDetails } from '@/lib/room';
import type { ConfigurationStatus } from '@/lib/server/config';
import { configurePreferences } from '@/lib/client/preferences';
import { createCallRoom, closeCallRoom } from '@/lib/client/call-room';
import type { Room } from 'livekit-client';
import { MicrophoneCheck, type MicrophoneCheckHandle } from './microphone';

const ConnectedRoom = dynamic(() => import('./room'), { ssr: false, loading: () => <div className="loading" role="status">Preparando a sala…</div> });
const configurationLabels = { missing: 'ausente', placeholder: 'valor de exemplo', invalid: 'formato inválido' };
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function post(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000) }).catch(() => { throw new Error('Não foi possível acessar a sala. Confira sua conexão e tente novamente.'); });
  const result = await response.json().catch(() => { throw new Error('A sala não respondeu como esperado. Tente novamente em instantes.'); });
  if (!response.ok) throw new RequestError(result.error || 'Não foi possível concluir. Tente novamente.', response.status);
  return result;
}
export default function Entry({ configuration, initialNickname = null }: { configuration: ConfigurationStatus; initialNickname?: string | null }) {
  const configured = configuration.ready;
  const [authenticatedNickname, setAuthenticatedNickname] = useState(initialNickname);
  const [call, setCall] = useState<{ room: Room; details?: ConnectionDetails } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const microphoneCheck = useRef<MicrophoneCheckHandle>(null);
  const callRoom = useRef<Room | null>(null);
  const joining = useRef(false);
  const alive = useRef(false);
  const [profileReady, setProfileReady] = useState(false);
  async function recognized() { try { const profile = await loadProfile(); setAuthenticatedNickname(profile.name); setProfileReady(true); } catch { setAuthenticatedNickname(null); setProfileReady(false); } }
  useEffect(() => { if (initialNickname) void loadProfile().then(profile => { setAuthenticatedNickname(profile.name); setProfileReady(true); }).catch(() => setAuthenticatedNickname(null)); }, [initialNickname]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (callRoom.current) void closeCallRoom(callRoom.current); }; }, []);
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining.current || !configured) return;

    const chatOnly = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'chat';
    microphoneCheck.current?.stop();
    const room = createCallRoom(!chatOnly); callRoom.current = room; joining.current = true;
    setBusy(true); setError('');
    try {
      let details;
      if (!chatOnly) {
        try { details = await post('/api/token', {}); } catch (failure) {
          if (failure instanceof RequestError && failure.message.includes('transferir') && window.confirm(failure.message)) details = await post('/api/token', {takeover:true}); else throw failure;
        }
      }
      if (alive.current) setCall({ room, details }); else void closeCallRoom(room);
    } catch (failure) {
      void closeCallRoom(room); callRoom.current = null;
      if (alive.current) {
        if (failure instanceof RequestError && failure.status === 401) setAuthenticatedNickname(null);
        setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'A conexão demorou demais. Tente novamente.');
      }
    }
    finally { joining.current = false; if (alive.current) setBusy(false); }
  }
  function leave(message = '') {
    // ConnectedRoom has already disconnected media. Authentication is independent.
    setCall(null); callRoom.current = null; setError(message);
  }
  async function forget() {
    if (joining.current) return;
    joining.current = true; setBusy(true); setError(''); microphoneCheck.current?.stop();
    try {
      await post('/api/logout', {});
      configurePreferences('', {}); setProfileReady(false);
      if (alive.current) setAuthenticatedNickname(null);
    }
    catch { if (alive.current) setError('Não foi possível esquecer o acesso. Confira sua conexão e tente novamente.'); }
    finally { joining.current = false; if (alive.current) setBusy(false); }
  }
  if (call) return <ConnectedRoom room={call.room} details={call.details} onLeave={leave} />;
  return <main className="entry-page">
    <header className="entry-header"><Brand /><span className="small-label"><Icon name="lock" /> Espaço privado</span></header>
    <div className="entry-content">
      <section className="entry-form-section" aria-labelledby="entry-title">
        <h1 id="entry-title">Entrar na sala</h1>
        <p className="entry-description">Até {MAX_PARTICIPANTS} pessoas · Voz, chat e compartilhamento de tela</p>
        {!configured && <div className="notice configuration-notice">
          <strong role="status">Configuração necessária</strong>
          <p>A entrada fica disponível quando a configuração do servidor estiver válida.</p>
          <details><summary>Ver diagnóstico da configuração</summary>
            <ul>{configuration.issues.map(issue => <li key={issue.name}><code>{issue.name}</code><span>{configurationLabels[issue.status]}</span></li>)}</ul>
            <p>O responsável deve conferir as variáveis e o escopo do ambiente na Vercel. Após salvar, crie um novo deployment e abra o novo Preview. Não compartilhe valores secretos.</p>
          </details>
        </div>}
        {!authenticatedNickname ? <AccountLogin disabled={!configured} onAuthenticated={()=>void recognized()}/> : <>
          <p className="remembered-access">Olá, {authenticatedNickname}. Entre quando quiser; o microfone começa desligado.</p>
          <form onSubmit={join} method="post" aria-busy={busy}>
            <button className="primary join-button" disabled={busy||!configured||!profileReady}>{busy?'Entrando…':'Entrar na sala'}<span aria-hidden="true">→</span></button>
            <button className="chat-entry" name="destination" value="chat" disabled={busy||!configured||!profileReady}>Abrir chat</button>
          </form>
          <AccountProfile/><button className="forget-access" disabled={busy} onClick={forget}>Esquecer acesso neste dispositivo</button>
        </>}
        {error&&<p className="error" role="alert">{error}</p>}
        <MicrophoneCheck key={authenticatedNickname ?? 'guest'} ref={microphoneCheck} disabled={busy || !configured} />
        <p className="entry-note">Você entra com o microfone desligado. Permissões de áudio e tela são solicitadas ao ativar cada recurso.</p>
      </section>
    </div>
  </main>;
}
