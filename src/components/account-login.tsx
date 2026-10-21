'use client';
import { useState, type FormEvent } from 'react';
export function AccountLogin({ disabled = false, onAuthenticated }: { disabled?: boolean; onAuthenticated: () => void }) {
  const [sent,setSent] = useState(false); const [email,setEmail] = useState('');
  const [busy,setBusy] = useState(false); const [notice,setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget); setBusy(true); setNotice('');
    try {
      const response = await fetch(sent ? '/api/account/verify' : '/api/account/code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sent ? { email, otp:fields.get('otp'), name:fields.get('name'), remember:fields.get('remember') === 'on' } : {email}),signal:AbortSignal.timeout(20000)});
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (sent) onAuthenticated(); else { setSent(true); setNotice(result.message); }
    } catch (error) { setNotice(error instanceof Error && !['TimeoutError','TypeError'].includes(error.name) ? error.message : 'Não foi possível acessar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} method="post" autoComplete="on" aria-busy={busy}>
    <label htmlFor="account-email">E-mail</label><input id="account-email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={event=>{setEmail(event.target.value);setSent(false);}} disabled={disabled||busy}/>
    {sent && <><label htmlFor="account-name">Seu nome</label><input id="account-name" name="name" autoComplete="nickname" required minLength={2} maxLength={24} disabled={busy}/><p className="entry-note">Usado no primeiro acesso. Depois, altere em Meu perfil.</p>
      <label htmlFor="account-otp">Código do e-mail</label><input id="account-otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} disabled={busy}/>
      <label className="checkbox-label"><input name="remember" type="checkbox" defaultChecked={false} disabled={busy}/>Manter conectado neste dispositivo</label><p className="entry-note">Por 30 dias. Sem marcar, o acesso expira em até 12 horas.</p></>}
    {notice && <p role="status">{notice}</p>}
    <button className="primary join-button" disabled={disabled||busy}>{busy?'Aguarde…':sent?'Confirmar código':'Receber código'}</button>
    {sent && <button type="button" disabled={busy} onClick={()=>{setSent(false);setNotice('Aguarde um minuto entre envios.');}}>Solicitar outro código</button>}
    <p className="entry-note">Acesso somente por convite. Confirmar o código não entra na chamada nem ativa o microfone.</p>
  </form>;
}
