'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand, Icon } from './icons';
import { MAX_PARTICIPANTS, normalizeNickname, validNickname, type ConnectionDetails } from '@/lib/room';
import type { ConfigurationStatus } from '@/lib/server/config';
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
  const nicknameRef = useRef<HTMLInputElement>(null);
  const microphoneCheck = useRef<MicrophoneCheckHandle>(null);
  const callRoom = useRef<Room | null>(null);
  const joining = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    if (authenticatedNickname) return;
    try { const nickname = normalizeNickname(localStorage.getItem('blueprint.nickname') ?? ''); if (nicknameRef.current && validNickname(nickname)) nicknameRef.current.value = nickname; } catch { /* Storage is optional. */ }
  }, [call, authenticatedNickname]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (callRoom.current) void closeCallRoom(callRoom.current); }; }, []);
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining.current || !configured) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const chatOnly = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'chat';
    const nickname = authenticatedNickname ?? normalizeNickname(String(fields.get('nickname') ?? ''));
    if (!validNickname(nickname)) { setError('Use um apelido de 2 a 24 caracteres: letras, números, espaços, ponto, hífen ou sublinhado.'); return; }
    const password = String(fields.get('password') ?? '');
    microphoneCheck.current?.stop();
    const room = createCallRoom(!chatOnly); callRoom.current = room; joining.current = true;
    setBusy(true); setError('');
    try {
      if (!authenticatedNickname) {
        await post('/api/login', { nickname, password, remember: fields.get('remember') === 'on' });
        if (alive.current) setAuthenticatedNickname(nickname);
        try { localStorage.setItem('blueprint.nickname', nickname); } catch { /* Storage is optional. */ }
      }
      const details = chatOnly ? undefined : await post('/api/token', {});
      if (alive.current) setCall({ room, details }); else void closeCallRoom(room);
    } catch (failure) {
      void closeCallRoom(room); callRoom.current = null;
      const passwordInput = form.elements.namedItem('password');
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
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
        <form onSubmit={join} autoComplete="on" method="post" aria-busy={busy}>
          <label htmlFor="nickname">Seu apelido</label><input key={authenticatedNickname ?? 'credentials'} defaultValue={authenticatedNickname ?? ''} ref={nicknameRef} id="nickname" name="nickname" autoComplete="username" readOnly={!!authenticatedNickname} maxLength={24} minLength={2} required placeholder="Como você quer aparecer?" disabled={busy || !configured} />
          {authenticatedNickname ? <p className="remembered-access" role="status">Acesso reconhecido neste dispositivo. Clique para entrar na sala.</p> : <>
            <label htmlFor="password">Senha da sala</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required placeholder="A senha compartilhada entre vocês" disabled={busy || !configured} />
            <label className="checkbox-label remember-access"><input name="remember" type="checkbox" defaultChecked={false} aria-describedby="remember-help" disabled={busy || !configured} />Manter conectado neste dispositivo</label>
            <p className="entry-note remember-help" id="remember-help">Por 30 dias. Use apenas em um dispositivo de confiança.</p>
          </>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary join-button" disabled={busy || !configured}>{busy ? 'Entrando…' : 'Entrar na sala'}<span aria-hidden="true">→</span></button>
          <button className="chat-entry" name="destination" value="chat" disabled={busy || !configured}>Abrir chat sem entrar na voz</button>
        </form>
        {authenticatedNickname && <button className="forget-access" disabled={busy} onClick={forget}>Esquecer acesso neste dispositivo</button>}
        <MicrophoneCheck ref={microphoneCheck} disabled={busy || !configured} />
        <p className="entry-note">Você entra com o microfone desligado. Permissões de áudio e tela são solicitadas ao ativar cada recurso.</p>
      </section>
    </div>
  </main>;
}
