'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AccountLogin } from './account-login';
import { AccountProfile, loadProfile } from './account-profile';
import { Brand } from './icons';
import { configurePreferences } from '@/lib/client/preferences';
import type { ConfigurationStatus } from '@/lib/server/config';

// Administration never mounts the retired member room/chat or captures media.
export default function Entry({ configuration, initialNickname = null }: { configuration: ConfigurationStatus; initialNickname?: string | null }) {
  const [name, setName] = useState(initialNickname);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function recognized() {
    try { setName((await loadProfile()).name); } catch { setNotice('Não foi possível carregar sua conta.'); }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      if (!response.ok) throw Error();
      configurePreferences('', {}); setName(null);
    } catch { setNotice('Não foi possível sair. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className="entry-page"><header className="entry-header"><Brand/><Link href="/">Transmissões</Link></header>
    <section className="entry-content"><div className="entry-form-section"><h1>Administração</h1>
      <p className="muted">Conta e gerenciamento de convites privados.</p>
      {!configuration.ready && <p role="status">A configuração de acesso está indisponível. Consulte o responsável.</p>}
      {name ? <><p>Olá, {name}.</p><AccountProfile/><button disabled={busy} onClick={() => void logout()}>Esquecer acesso neste dispositivo</button></> : <AccountLogin disabled={!configuration.ready} onAuthenticated={() => void recognized()}/>}
      {notice && <p role="status">{notice}</p>}
    </div></section></main>;
}
