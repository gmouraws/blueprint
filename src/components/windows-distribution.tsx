'use client';
import { useState } from 'react';
type Distribution = { installer: { version: string; filename: string; size: number; sha256: string }; available: boolean; recipients: { id: string; email: string }[]; links: { id: string; recipient: string; expires: number; state: string }[] };
export function WindowsDistribution() {
  const [data, setData] = useState<Distribution | null>(null); const [recipient, setRecipient] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [created, setCreated] = useState<{ url: string; expires: number } | null>(null);
  async function request(body?: object) {
    const response = await fetch('/api/windows/distribution', { method: body ? 'POST' : 'GET', cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
  }
  async function load() { const result: Distribution = await request(); setData(result); return result; }
  async function run(action?: object) {
    if (busy) return; setBusy(true); setNotice('');
    try { if (action) { const result = await request(action); if (result.url) { setCreated(result); setNotice(result.emailAccepted === undefined ? 'Link criado. Copie agora; ele não será recuperável depois.' : result.emailAccepted ? 'Envio aceito pelo provedor. A entrega ainda depende do e-mail.' : 'Link criado, mas o envio não foi confirmado. Copie o link.'); } else { setCreated(null); setNotice(result.revoked ? 'Link revogado.' : 'Link expirado, utilizado ou já revogado.'); } } await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Distribuição indisponível.'); } finally { setBusy(false); }
  }
  return <details className="windows-distribution"><summary>Distribuição Windows</summary><button disabled={busy} onClick={() => void run()}>Atualizar distribuição</button>{data && <>
    <p>{data.installer.filename} · {data.installer.size.toLocaleString('pt-BR')} bytes</p><p>Versão {data.installer.version} · {data.available ? 'Instalador privado disponível' : 'Instalador privado indisponível'}</p><details><summary>SHA-256</summary><code>{data.installer.sha256}</code></details>
    <label>Destinatário autorizado<select value={recipient} disabled={busy} onChange={event => setRecipient(event.target.value)}><option value="">Selecione uma conta existente</option>{data.recipients.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
    <div className="distribution-actions"><button disabled={busy || !recipient || !data.available} onClick={() => void run({ action: 'issue', recipient })}>Gerar link por 24 horas</button><button disabled={busy || !recipient || !data.available} onClick={() => void run({ action: 'issue', recipient, send: true })}>Gerar e enviar por e-mail</button></div>
    {created && <div><p>Expira em {new Date(created.expires).toLocaleString('pt-BR')}.</p><button onClick={() => void navigator.clipboard.writeText(created.url).then(() => setNotice('Link copiado.')).catch(() => setNotice('Não foi possível copiar. Gere novamente em um navegador com acesso à área de transferência.'))}>Copiar link</button></div>}
    <p className="entry-note">O destinatário precisa entrar com a conta selecionada. Cada link permite uma tentativa de download; uma interrupção exige um novo link.</p>
    <ul>{data.links.map(link => <li key={link.id}>{data.recipients.find(item => item.id === link.recipient)?.email ?? 'Conta indisponível'} · {new Date(link.expires).toLocaleString('pt-BR')} · {link.state === 'expired' ? 'expirado' : link.state === 'unused' ? 'disponível' : link.state === 'claimed' ? 'utilizado' : 'revogado'}{link.state === 'unused' && <button disabled={busy} onClick={() => void run({ action: 'revoke', id: link.id })}>Revogar</button>}</li>)}</ul>
  </>}{notice && <p role="status">{notice}</p>}</details>;
}
