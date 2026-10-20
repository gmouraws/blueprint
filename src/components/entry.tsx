'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand, Icon } from './icons';
import { MAX_PARTICIPANTS, normalizeNickname, validNickname, type ConnectionDetails } from '@/lib/room';

const ConnectedRoom = dynamic(() => import('./room'), { ssr: false, loading: () => <div className="loading" role="status">Preparando a sala…</div> });
async function post(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000) }).catch(() => { throw new Error('Não foi possível acessar a sala. Confira sua conexão e tente novamente.'); });
  const result = await response.json().catch(() => { throw new Error('A sala não respondeu como esperado. Tente novamente em instantes.'); });
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir. Tente novamente.');
  return result;
}
export default function Entry({ configured }: { configured: boolean }) {
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
      <section className="entry-intro"><p className="eyebrow">UMA SALA. ATÉ {MAX_PARTICIPANTS} PESSOAS.</p><h1>Boa companhia.<br /><span>Uma tela em comum.</span></h1><p>Converse por voz, compartilhe a tela e fique por perto. Tudo aqui, direto no navegador.</p><ul className="entry-features"><li><Icon name="mic" /> Voz sem webcam</li><li><Icon name="screen" /> Tela e áudio compartilhados</li><li><Icon name="lock" /> Acesso com senha</li></ul></section>
      <section className="entry-form-section" aria-labelledby="entry-title"><p className="eyebrow">BLUEPRINT ROOM</p><h2 id="entry-title">Entre, a sala é nossa.</h2><p className="muted">Use seu apelido e a senha combinada.</p>
        {!configured && <div className="notice" role="status"><strong>Configuração necessária</strong><p>O responsável precisa configurar LiveKit e a proteção de acesso antes de abrir a sala. Nenhuma chamada será iniciada agora.</p></div>}
        <form onSubmit={join} aria-busy={busy}>
          <label htmlFor="nickname">Seu apelido</label><input ref={nicknameRef} id="nickname" name="nickname" autoComplete="nickname" maxLength={24} minLength={2} required placeholder="Como você quer aparecer?" disabled={busy || !configured} />
          <label htmlFor="password">Senha da sala</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required placeholder="A senha compartilhada entre vocês" disabled={busy || !configured} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary join-button" disabled={busy || !configured}>{busy ? 'Entrando…' : 'Entrar na sala'}<span aria-hidden="true">→</span></button>
        </form>
        <p className="entry-note">Você entra com o microfone desligado. Ao ativá-lo, o navegador pedirá permissão. A tela só é capturada quando você escolher compartilhar.</p>
      </section>
    </div>
    <footer className="entry-footer"><span>Feito para estar junto.</span><span>Sem gravações. Sem histórico de mensagens.</span></footer>
  </main>;
}
