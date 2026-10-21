'use client';
import { useState } from 'react';
import { PersistentStreamInvitation } from './stream-persistent-invitation';
type Invite = { id: string; role: 'share' | 'watch'; expires: number; revoked: boolean };
export function StreamInvitations() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<'share' | 'watch'>('watch');
  const [hours, setHours] = useState(24);
  const [url, setUrl] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function action(body: object) {
    setBusy(true); setNotice(''); setUrl('');
    try {
      const response = await fetch('/api/stream/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setInvites(result.invitations); setUrl(result.url ?? '');
      if (result.cleanupPending) setNotice('Acesso revogado; desconexão de mídia pendente. Atualize para tentar novamente.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  return <details className="stream-invitations"><summary>Convites para transmissão sem conta</summary>
    <p>Um espaço separado, sem voz ou chat, para até 8 visitantes. Qualquer pessoa com o link pode acessar até expirar ou ser revogado. Compartilhe somente em particular.</p>
    <PersistentStreamInvitation/>
    <h3>Convites com prazo</h3>
    <label>Permissão<select value={role} onChange={event => setRole(event.target.value as 'share' | 'watch')}><option value="watch">Somente assistir</option><option value="share">Transmitir e assistir</option></select></label>
    <label>Validade<select value={hours} onChange={event => setHours(Number(event.target.value))}><option value={1}>1 hora</option><option value={24}>24 horas</option><option value={168}>7 dias</option></select></label>
    <div className="stream-actions"><button disabled={busy} onClick={() => void action({ action: 'create', role, hours })}>Criar link privado</button><button disabled={busy} onClick={() => void action({ action: 'list' })}>Atualizar convites</button></div>
    {url && <div><label>Link criado (copie antes de fechar)<input readOnly value={url} onFocus={event => event.target.select()} /></label><button onClick={() => void navigator.clipboard.writeText(url).then(() => setNotice('Link copiado. Quem o receber terá acesso ao espaço.')).catch(() => setNotice('Selecione e copie o link acima.'))}>Copiar link</button><a href={url} target="_blank" rel="noopener noreferrer">Abrir transmissão</a></div>}
    <ul>{invites.map((invite, index) => <li key={invite.id}>Convite {index + 1} · {invite.role === 'share' ? 'transmitir' : 'assistir'} · {invite.revoked ? 'revogado' : new Date(invite.expires).toLocaleString('pt-BR')}{!invite.revoked && <button disabled={busy} onClick={() => void action({ action: 'revoke', id: invite.id })}>Revogar</button>}</li>)}</ul>
    <p className="muted">Os links só são exibidos na criação. Revogar também invalida as sessões e os links de visualização derivados. Os anúncios automáticos usam somente links de visualização.</p>
    {notice && <p role="status">{notice}</p>}
  </details>;
}
