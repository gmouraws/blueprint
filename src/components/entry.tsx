'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AccountLogin } from './account-login';
import { AccountProfile, loadProfile } from './account-profile';
import { Brand } from './icons';
import { configurePreferences } from '@/lib/client/preferences';
import type { ConfigurationStatus } from '@/lib/server/config';

// Administration never mounts the retired member room/chat or captures media.
export default function Entry({ configuration, initialNickname = null, initialRole = null, locale = 'pt-BR' }: { configuration: ConfigurationStatus; initialNickname?: string | null; initialRole?: 'owner' | 'member' | null; locale?: 'en' | 'pt-BR' }) {
  const [name, setName] = useState(initialNickname);
  const [role, setRole] = useState(initialRole);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function recognized() {
    try { const profile = await loadProfile(); setName(profile.name); setRole(profile.role); } catch { setNotice('Não foi possível carregar sua conta.'); }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      if (!response.ok) throw Error();
      configurePreferences('', {}); setName(null); setRole(null);
    } catch { setNotice('Não foi possível sair. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className="entry-page" lang={locale}><header className="entry-header"><Brand/><Link href="/">Blueprint Room</Link></header>
    <section className="entry-content"><div className="entry-form-section"><h1>{role === 'owner' ? 'Administração' : locale === 'en' ? 'Private access' : 'Acesso privado'}</h1>
      <p className="muted">{role === 'owner' ? 'Conta e gerenciamento de convites privados.' : locale === 'en' ? 'Sign in with your existing authorized email account.' : 'Entre com sua conta de e-mail já autorizada.'}</p>
      {!configuration.ready && <p role="status">A configuração de acesso está indisponível. Consulte o responsável.</p>}
      {name ? <div lang="pt-BR"><p>Olá, {name}.</p><AccountProfile/><button disabled={busy} onClick={() => void logout()}>Esquecer acesso neste dispositivo</button></div> : <AccountLogin locale={locale} disabled={!configuration.ready} onAuthenticated={() => void recognized()}/>}
      {notice && <p role="status">{notice}</p>}
    </div></section></main>;
}
