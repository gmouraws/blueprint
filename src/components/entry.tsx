'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand, Icon } from './icons';
import { MAX_PARTICIPANTS, normalizeNickname, validNickname, type ConnectionDetails } from '@/lib/room';
import type { ConfigurationStatus } from '@/lib/server/config';

const ConnectedRoom = dynamic(() => import('./room'), { ssr: false, loading: () => <div className="loading" role="status">Preparando a sala…</div> });
const configurationLabels = { missing: 'ausente', placeholder: 'valor de exemplo', invalid: 'formato inválido' };
async function post(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000) }).catch(() => { throw new Error('Não foi possível acessar a sala. Confira sua conexão e tente novamente.'); });
  const result = await response.json().catch(() => { throw new Error('A sala não respondeu como esperado. Tente novamente em instantes.'); });
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir. Tente novamente.');
  return result;
}
export default function Entry({ configuration }: { configuration: ConfigurationStatus }) {
  const configured = configuration.ready;
  const [details, setDetails] = useState<ConnectionDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nicknameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try { if (nicknameRef.current) nicknameRef.current.value = localStorage.getItem('blueprint.nickname') ?? ''; } catch { /* Storage is optional. */ }
  }, [details]);
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const nickname = normalizeNickname(String(fields.get('nickname') ?? ''));
    if (!validNickname(nickname)) { setError('Use um apelido de 2 a 24 caracteres: letras, números, espaços, ponto, hífen ou sublinhado.'); return; }
    const password = String(fields.get('password') ?? '');
    (form.elements.namedItem('password') as HTMLInputElement).value = '';
    setBusy(true); setError('');
    try {
      await post('/api/login', { nickname, password });
      try { localStorage.setItem('blueprint.nickname', nickname); } catch { /* Storage is optional. */ }
      setDetails(await post('/api/token', {}));
    } catch (failure) { setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'A conexão demorou demais. Tente novamente.'); }
    finally { setBusy(false); }
  }
  async function leave(message = '') {
    setDetails(null); setError(message);
    try { await post('/api/logout', {}); }
    catch { setError(message || 'Você saiu da chamada. Não foi possível encerrar a sessão no servidor; feche o navegador se estiver em um computador compartilhado.'); }
  }
  if (details) return <ConnectedRoom details={details} onLeave={leave} />;
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
        <form onSubmit={join} aria-busy={busy}>
          <label htmlFor="nickname">Seu apelido</label><input ref={nicknameRef} id="nickname" name="nickname" autoComplete="nickname" maxLength={24} minLength={2} required placeholder="Como você quer aparecer?" disabled={busy || !configured} />
          <label htmlFor="password">Senha da sala</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required placeholder="A senha compartilhada entre vocês" disabled={busy || !configured} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary join-button" disabled={busy || !configured}>{busy ? 'Entrando…' : 'Entrar na sala'}<span aria-hidden="true">→</span></button>
        </form>
        <p className="entry-note">Você entra com o microfone desligado. Permissões de áudio e tela são solicitadas ao ativar cada recurso.</p>
      </section>
    </div>
  </main>;
}
