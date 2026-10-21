'use client';
import { useState } from 'react';
export function PersistentStreamInvitation() {
  const [active, setActive] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [urls, setUrls] = useState<{ share: string; watch: string } | null>(null);
  async function run(operation: 'status' | 'create' | 'copy' | 'rotate' | 'revoke') {
    if (busy) return;
    if (['rotate', 'revoke'].includes(operation) && !window.confirm(operation === 'rotate' ? 'Trocar o link revoga o anterior e desconecta seus visitantes antes de criar outro. Continuar?' : 'Revogar o link e desconectar seus visitantes?')) return;
    setBusy(true); setNotice(''); setUrls(null);
    try {
      const response = await fetch('/api/stream/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'persistent', operation }), cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw Error(result.error);
      setActive(result.active); setUrls(result.urls ?? null);
      if (result.cleanupPending) setNotice('Acesso revogado; desconexão de mídia pendente. Atualize para tentar novamente. Nenhum link substituto foi criado.');
      else if (operation === 'revoke') setNotice('Link revogado.');
      else if (operation === 'copy' && result.urls) await navigator.clipboard.writeText(result.urls.share).then(() => setNotice('Link de transmissão copiado. Compartilhe somente em particular.')).catch(() => setNotice('Selecione e copie o link abaixo.'));
      else if (!result.active) setNotice('Nenhum link persistente ativo.');
    } catch { setNotice('Não foi possível concluir. Atualize o estado antes de tentar novamente.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Convite persistente"><h3>Link persistente · Discord</h3>
    <p>Sem expiração automática. Quem receber o link pode acessar o espaço. Sessões continuam temporárias; revogar ou trocar encerra o acesso. Convites com prazo não são alterados.</p>
    <p>{active === null ? 'Consulte o estado antes de criar ou copiar.' : active ? 'Link persistente ativo.' : 'Sem link persistente ativo.'}</p>
    <div className="stream-actions"><button disabled={busy} onClick={() => void run('status')}>Atualizar link persistente</button>
      {active === false && <button disabled={busy} onClick={() => void run('create')}>Criar link sem expiração</button>}
      {active && <><button disabled={busy} onClick={() => void run('copy')}>Copiar link</button><button disabled={busy} onClick={() => void run('rotate')}>Trocar link</button><button disabled={busy} onClick={() => void run('revoke')}>Revogar</button></>}
    </div>
    {urls && <><label>Link para transmitir e assistir<input readOnly value={urls.share} onFocus={event => event.target.select()}/></label><label>Link somente para assistir<input readOnly value={urls.watch} onFocus={event => event.target.select()}/></label></>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
