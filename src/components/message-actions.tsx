'use client';

import { useRef, useState } from 'react';
import type { ChatDeletion, ChatMessage } from '@/lib/chat';
import { ControlMenu } from './control-menu';

export function MessageActions({ message, onDelete }: { message: ChatMessage; onDelete: (id: string, target: ChatDeletion['kind']) => Promise<void> }) {
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
  return <div className="message-actions">
    <ControlMenu label="Opções da sua mensagem"><button onClick={() => confirm('message')}>Excluir mensagem</button>{message.image && <button onClick={() => confirm('image')}>Excluir imagem</button>}</ControlMenu>
    <dialog ref={dialog} className="delete-dialog" aria-label="Confirmar exclusão" onCancel={event => { if (pending) event.preventDefault(); }}>
      <h2>{target === 'message' ? 'Excluir esta mensagem?' : 'Excluir esta imagem?'}</h2>
      <p>{target === 'image' && message.body ? 'O texto será mantido.' : 'O conteúdo será removido para todos.'} Esta ação não pode ser desfeita.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div><button autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</button><button disabled={pending} aria-busy={pending} onClick={remove}>{pending ? 'Excluindo…' : 'Excluir'}</button></div>
    </dialog>
  </div>;
}
