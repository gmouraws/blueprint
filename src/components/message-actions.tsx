'use client';

import { useRef, useState } from 'react';
import type { ChatDeletion, ChatMessage } from '@/lib/chat';
import { ControlMenu } from './control-menu';
import { Icon } from './icons';

export function MessageActions({ message, onDelete, imageOnly = false }: { message: ChatMessage; onDelete: (id: string, target: ChatDeletion['kind']) => Promise<void>; imageOnly?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<ChatDeletion['kind']>('message');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  function confirm(value: ChatDeletion['kind']) { setTarget(value); setError(''); dialog.current?.showModal(); }
  async function remove() {
    if (pending) return;
    setPending(true); setError('');
    try { await onDelete(message.id, target); dialog.current?.close(); }
    catch { setError('Não foi possível confirmar a exclusão. Tente novamente.'); }
    finally { setPending(false); }
  }
  return <div className={imageOnly ? 'image-delete-action' : 'message-actions'}>
    {imageOnly ? <button type="button" className="icon-button image-delete" aria-label="Excluir imagem" title="Excluir imagem" onClick={() => confirm('image')}><Icon name="trash" width="17" height="17" /></button> : <ControlMenu label="Opções da sua mensagem"><button onClick={() => confirm('message')}>Excluir mensagem</button></ControlMenu>}
    <dialog ref={dialog} className="delete-dialog" aria-label="Confirmar exclusão" onCancel={event => { if (pending) event.preventDefault(); }}>
      <h2>{target === 'message' ? 'Excluir esta mensagem?' : 'Excluir esta imagem?'}</h2>
      <p>{target === 'image' && message.body ? 'O texto será mantido.' : 'O conteúdo será removido para todos.'} Esta ação não pode ser desfeita.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div><button autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</button><button disabled={pending} aria-busy={pending} onClick={remove}>{pending ? 'Excluindo…' : 'Excluir'}</button></div>
    </dialog>
  </div>;
}
