'use client';
import { Icon } from './icons';
import { useState, useRef, useEffect } from 'react';
import { configurePreferences, canImportPreferences, importPreferences, readPreferences } from '@/lib/client/preferences';
import type { AccountPreferences } from '@/lib/account-preferences';
import { AccountShortcutSettings } from './account-shortcuts';
import { StreamInvitations } from './stream-invitations';

export type Profile = { id:string; name:string; role:'owner'|'member'; avatar_id:string|null; preferences:AccountPreferences; preference_version:number;
  members?:{id:string;name:string;email:string;role:string;status:string}[]; invitations?:{id:string;email:string;expires_at:string;accepted_at:string|null;revoked_at:string|null}[]; cleanupPending?:boolean };
export async function loadProfile():Promise<Profile> {
  const response=await fetch('/api/account',{cache:'no-store'}); if(!response.ok)throw new Error(response.status===401?'Sua sessão expirou. Entre novamente.':'Perfil indisponível.');
  const profile=await response.json(); configurePreferences(profile.id,profile.preferences); return profile;
}
export function AccountProfile() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile,setProfile]=useState<Profile|null>(null); const [open,setOpen]=useState(false); const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [preferences,setPreferences]=useState<AccountPreferences>({});
  useEffect(()=>{ if(open) dialog.current?.showModal(); },[open]);
  async function refresh() { const next=await loadProfile();setProfile(next);setName(next.name);setPreferences(next.preferences); }
  async function action(body:object) { setBusy(true);setNotice('');try { const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error); await refresh();setNotice(result.cleanupPending?'Acesso revogado. A desconexão da mídia está pendente; tente novamente.':'Salvo.'); }catch(error){setNotice(error instanceof Error?error.message:'Não foi possível salvar.');}finally{setBusy(false);} }
  async function avatar(file?:File) { if(file && file.size>2*1024*1024){setNotice('Use uma imagem de até 2 MB.');return;}setBusy(true);try{const response=await fetch('/api/account/avatar',{method:file?'PUT':'DELETE',headers:file?{'Content-Type':file.type}:{},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();window.dispatchEvent(new Event('blueprint-avatar-updated'));setNotice(result.cleanupPending?'Foto atualizada; limpeza anterior pendente.':'Foto atualizada.');}catch(error){setNotice(error instanceof Error?error.message:'Falha ao atualizar a foto.');}finally{setBusy(false);} }

  return <><button className="profile-trigger" aria-label="Meu perfil" title="Meu perfil" onClick={()=>{setOpen(true);void refresh().catch(error=>setNotice(error.message));}}><Icon name="person"/><span>Meu perfil</span></button>{open&&<dialog ref={dialog} onCancel={()=>setOpen(false)} className="profile-dialog" aria-labelledby="profile-title"><div className="profile-heading"><h2 id="profile-title">Meu perfil</h2><button onClick={()=>setOpen(false)} aria-label="Fechar perfil">Fechar</button></div>
    {profile&&<><label>Nome<input value={name} maxLength={24} onChange={event=>setName(event.target.value)}/></label><button disabled={busy} onClick={()=>void action({action:'profile',name})}>Salvar nome</button>
      <label>Foto (JPEG, PNG ou WebP; até 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void avatar(file);event.target.value='';}}/></label>
      {profile.avatar_id&&<button disabled={busy} onClick={()=>void avatar()}>Remover foto</button>}
      <details><summary>Preferências da conta</summary><p className="muted">Sons e volume: suas escolhas locais têm prioridade. Atalhos são salvos separadamente na conta. Alterações de outro dispositivo são verificadas ao salvar.</p>
        <label className="checkbox-label"><input type="checkbox" checked={preferences.sounds??true} onChange={event=>setPreferences({...preferences,sounds:event.target.checked})}/>Sons de entrada e saída</label>
        <label>Volume das telas<input type="range" min={0} max={100} value={preferences.screenVolume??80} onChange={event=>setPreferences({...preferences,screenVolume:Number(event.target.value)})}/></label>
        <h3>Atalhos de teclado</h3><AccountShortcutSettings onSaved={refresh}/>
        <button disabled={busy} onClick={()=>void action({action:'preferences',version:profile.preference_version,preferences})}>Salvar padrões</button>
        {canImportPreferences()&&<button disabled={busy} onClick={()=>{importPreferences();setNotice('Preferências antigas importadas somente neste dispositivo.');}}>Importar preferências antigas neste dispositivo</button>}
        <button onClick={()=>{const local=readPreferences();setPreferences({...preferences,sounds:local.sounds,screenVolume:local.screenVolume});setNotice('Confira e salve os padrões. Dispositivos de áudio não serão enviados.');}}>Copiar escolhas locais para revisão</button>
      </details>
      {profile.role==='owner'&&<StreamInvitations/>}
      {profile.role==='owner'&&<details><summary>Gerenciar acesso</summary><label>E-mail do convite<input type="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><button disabled={busy} onClick={()=>void action({action:'invite',email})}>Autorizar convite por 7 dias</button><p className="muted">O convidado acessa a sala e solicita seu código. Este botão não envia e-mail.</p>
        <ul>{profile.invitations?.map(invite=><li key={invite.id}>{invite.email} · {invite.accepted_at?'aceito':invite.revoked_at?'revogado':new Date(invite.expires_at)<new Date()?'expirado':'pendente'}{!invite.accepted_at&&!invite.revoked_at&&<button disabled={busy} onClick={()=>void action({action:'revoke-invite',id:invite.id})}>Revogar convite</button>}</li>)}</ul>
        <ul>{profile.members?.map(member=><li key={member.id}>{member.name} · {member.email} · {member.role==='owner'?'responsável':member.status==='active'?'ativo':'desativado'}<button disabled={busy||member.role==='owner'} onClick={()=>void action({action:member.status==='active'?'disable':'reactivate',id:member.id})}>{member.status==='active'?'Desativar':'Reativar'}</button><button disabled={busy} onClick={()=>void action({action:'revoke',id:member.id})}>Revogar sessões</button></li>)}</ul>
        {profile.cleanupPending&&<button disabled={busy} onClick={()=>void action({action:'retry-cleanup'})}>Tentar desconexões pendentes</button>}
      </details>}
    </>}{notice&&<p role="status">{notice}</p>}
  </dialog>}</>;
}
