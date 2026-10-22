'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountLogin } from './account-login';
import { Brand } from './icons';
export function PrivateDownload({ authenticated }: { authenticated: boolean }) {
  const [signedIn, setSignedIn] = useState(authenticated); const [credential, setCredential] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [consumed, setConsumed] = useState(false);
  useEffect(() => { const value = new URLSearchParams(location.hash.slice(1)).get('access') ?? ''; history.replaceState(null, '', '/download'); queueMicrotask(() => setCredential(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value) ? value : '')); }, []);
  async function download() {
    if (busy || consumed) return; setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/windows/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }), cache: 'no-store' });
      if (!response.ok) { const result = await response.json(); if (response.status === 401) setSignedIn(false); throw Error(result.error); }
      setConsumed(true);
      const file = await response.blob(); const url = URL.createObjectURL(file); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Blueprint-Room-production-0.1.7-x64-setup.exe'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); setNotice('Download recebido. Confira o SHA-256 fornecido pelo responsável.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Download interrompido. Peça um novo link ao responsável.'); } finally { setBusy(false); }
  }
  return <main className="entry-page"><header className="entry-header"><Brand/><Link href="/">Blueprint Room</Link></header><section className="entry-content"><div className="entry-form-section"><h1>Download privado</h1><p className="muted">Windows x64 · 0.1.7 · Versão de teste sem assinatura</p>{!credential ? <p role="status">Abra o link privado enviado pelo responsável.</p> : !signedIn ? <><p>Entre com a conta autorizada que recebeu este link.</p><AccountLogin onAuthenticated={() => setSignedIn(true)}/></> : <button className="primary" disabled={busy || consumed} onClick={() => void download()}>{busy ? 'Recebendo instalador…' : 'Baixar para Windows'}</button>}{notice && <p role="status">{notice}</p>}</div></section></main>;
}
