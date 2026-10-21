'use client';

import { useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_TOPIC, MAX_MESSAGE_BYTES, encodeMessage } from '@/lib/room';
import { mergeMessages, reconcileDeletions, type ChatDeletion, type ChatMessage, type ChatPage } from '@/lib/chat';
import { Icon } from './icons';
import { ImageAttachmentButton, ImageComposer, MessageImage, useChatImage } from './chat-images';
import { messageParts } from '@/lib/client/message-links';
import { ControlMenu } from './control-menu';
import { MessageActions } from './message-actions';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'O histórico está indisponível. Tente novamente.');
  return result;
}
export function Chat({ active, onUnread }: { active: boolean; onUnread: (count: number) => void }) {
  const room = useRoomContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState('');
  const image = useChatImage();
  const records = useRef<ChatMessage[]>([]);
  const latest = useRef('0');
  const changeCursor = useRef('0');
  const deletions = useRef(new Map<string, ChatDeletion['kind']>());
  const earliest = useRef('');
  const initialized = useRef(false);
  const alive = useRef(false);
  const sending = useRef(false);
  const retry = useRef<{ body: string; requestId: string; imageId?: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const unread = useRef(0);
  const serverOffset = useRef(0);
  const refreshNow = useRef<() => void>(() => {});
  const resizeComposer = useCallback(() => {
    const field = composer.current;
    if (!field || !field.clientWidth) return;
    field.style.height = '0px';
    field.style.height = `${Math.min(128, Math.max(44, field.scrollHeight + 2))}px`;
    if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, []);
  useLayoutEffect(resizeComposer, [text, active, resizeComposer]);
  useEffect(() => {
    if (!composer.current) return;
    let width = 0;
    const observer = new ResizeObserver(entries => {
      const next = entries[0].contentRect.width;
      if (next !== width) { width = next; resizeComposer(); }
    });
    observer.observe(composer.current);
    return () => observer.disconnect();
  }, [resizeComposer]);
  const accept = useCallback((incoming: ChatMessage[]) => {
    const previous = records.current;
    records.current = reconcileDeletions(mergeMessages(records.current, incoming, Date.now() + serverOffset.current), deletions.current);
    if (previous.length !== records.current.length || incoming.length || records.current.some((record, index) => record !== previous[index])) setMessages(records.current);
  }, []);
  const receivePage = useEffectEvent((page: ChatPage, first: boolean) => {
    serverOffset.current = Date.parse(page.serverTime) - Date.now();
    if (page.changes) {
      changeCursor.current = page.changes.cursor;
      for (const change of page.changes.items) if (deletions.current.get(change.id) !== 'message') deletions.current.set(change.id, change.kind);
    }
    const unseen = page.messages.filter(message => !message.own && !records.current.some(record => record.id === message.id));
    if (!first && !active && unseen.length) { unread.current += unseen.length; onUnread(unread.current); }
    accept(page.messages);
  });
  const markRead = useEffectEvent(() => { unread.current = 0; onUnread(0); });
  useEffect(() => { if (active) markRead(); }, [active]);
  useEffect(() => {
    alive.current = true;
    let running = false; let queued = false; let stopped = false;
    async function refresh() {
      if (stopped || document.hidden) return;
      if (running) { queued = true; return; }
      running = true;
      try {
        for (let batch = 0; batch < 10; batch++) {
          const first = !initialized.current;
          const page: ChatPage = await request(`/api/chat${first ? '' : `?after=${latest.current}&changesAfter=${changeCursor.current}`}`);
          if (stopped) return;
          receivePage(page, first);
          if (first) { initialized.current = true; setHasOlder(page.hasMore); earliest.current = page.messages[0]?.id ?? ''; }
          if (page.messages.length) latest.current = page.messages.at(-1)!.id;
          setLoading(false); setError('');
          if (first || (!page.hasMore && !page.changes?.hasMore)) break;
          if (batch === 9) queued = true;
        }
      } catch (failure) { if (!stopped) { setLoading(false); setError(failure instanceof Error ? failure.message : 'Não foi possível carregar o histórico.'); } }
      finally { running = false; if (queued && !stopped) { queued = false; setTimeout(() => void refresh(), 1000); } }
    }
    // Packets carry refresh hints only; authenticated HTTP reads supply all content.
    let lastHint = 0;
    const hint = (_payload: Uint8Array, _participant: unknown, _kind: unknown, topic?: string) => {
      if (topic === CHAT_TOPIC && Date.now() - lastHint > 1000) { lastHint = Date.now(); void refresh(); }
    };
    const catchup = () => { void refresh(); };
    refreshNow.current = catchup;
    room.on(RoomEvent.DataReceived, hint).on(RoomEvent.Reconnected, catchup).on(RoomEvent.Connected, catchup);
    window.addEventListener('online', catchup); document.addEventListener('visibilitychange', catchup);
    const polling = setInterval(() => void refresh(), 10000);
    const expiry = setInterval(() => accept([]), 1000);
    void refresh();
    return () => {
      stopped = true; alive.current = false;
      clearInterval(polling); clearInterval(expiry);
      room.off(RoomEvent.DataReceived, hint).off(RoomEvent.Reconnected, catchup).off(RoomEvent.Connected, catchup);
      window.removeEventListener('online', catchup); document.removeEventListener('visibilitychange', catchup);
    };
  }, [room, accept]);
  useEffect(() => { if (active) refreshNow.current(); }, [active]);
  useEffect(() => { if (active && nearBottom.current && !older && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages, active, older]);
  async function loadOlder() {
    if (older || !earliest.current) return;
    setOlder(true);
    const element = scroll.current; const height = element?.scrollHeight ?? 0; const top = element?.scrollTop ?? 0;
    nearBottom.current = false;
    try {
      const page: ChatPage = await request(`/api/chat?before=${earliest.current}`);
      if (!alive.current) return;
      accept(page.messages); setHasOlder(page.hasMore); earliest.current = page.messages[0]?.id ?? earliest.current;
      requestAnimationFrame(() => { if (element) element.scrollTop = top + element.scrollHeight - height; });
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar mensagens anteriores.'); }
    finally { if (alive.current) setOlder(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const payload = encodeMessage(text);
    if ((!payload && !image.pending) || (text.trim() && !payload)) { setError(`Escreva uma mensagem de até ${MAX_MESSAGE_BYTES} bytes ou selecione uma imagem.`); return; }
    const body = payload ? new TextDecoder().decode(payload) : '';
    sending.current = true; setIsSending(true); setError(''); setSaved(false);
    try {
      const imageId = await image.upload();
      if (!retry.current || retry.current.body !== body || retry.current.imageId !== imageId) retry.current = { body, requestId: crypto.randomUUID(), ...(imageId ? { imageId } : {}) };
      const result: { message: ChatMessage } = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retry.current) });
      if (!alive.current) return;
      accept([result.message]); setText(''); image.remove(); retry.current = null; setSaved(true);
      // Hint failure cannot undo a durable save; polling catches up.
      if (room.state === ConnectionState.Connected) void room.localParticipant.publishData(new Uint8Array([1]), { reliable: true, topic: CHAT_TOPIC }).catch(() => undefined);
      refreshNow.current();
    } catch (failure) { if (alive.current) setError(`${failure instanceof Error ? failure.message : 'Não foi possível confirmar o salvamento.'} Seu texto foi mantido; reenviar o mesmo texto não duplica a mensagem.`); }
    finally { sending.current = false; if (alive.current) setIsSending(false); }
  }
  async function removeMessage(id: string, target: ChatDeletion['kind']) {
    const result: { change: ChatDeletion; cleanupPending: boolean } = await request('/api/chat', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, target }) });
    if (!alive.current) return;
    if (deletions.current.get(id) !== 'message') deletions.current.set(id, result.change.kind);
    records.current = reconcileDeletions(records.current, deletions.current); setMessages(records.current);
    setDeletionNotice(result.cleanupPending ? 'Conteúdo excluído. A limpeza dos arquivos ficou pendente para nova tentativa.' : 'Conteúdo excluído.');
    if (room.state === ConnectionState.Connected) void room.localParticipant.publishData(new Uint8Array([1]), { reliable: true, topic: CHAT_TOPIC }).catch(() => undefined);
    refreshNow.current();
  }
  return <section className="chat-panel" aria-labelledby="chat-heading"><div className="panel-heading"><h2 id="chat-heading"># geral</h2><ControlMenu label="Informações do chat"><p className="menu-title"># geral</p><p className="chat-disclosure">Mensagens visíveis a todos com acesso à sala e mantidas por 30 dias. Apelidos são nomes de exibição, não identidades verificadas. Você pode conversar sem entrar na sala.</p><p className="muted">Você pode excluir o que enviou com este acesso. Ao esquecer o acesso, entrar em outro dispositivo ou iniciar uma nova sessão após expirar, a autoria anterior não é recuperada pelo apelido.</p><p className="muted">Enter envia · Shift+Enter quebra a linha. Até {MAX_MESSAGE_BYTES} bytes e uma imagem JPEG, PNG ou WebP de até 5 MB por mensagem.</p></ControlMenu></div>
    {loading && <p className="chat-loading" role="status">Carregando histórico…</p>}
    {deletionNotice && <p className="deletion-notice" role="status">{deletionNotice}</p>}
    <div className="messages" ref={scroll} onScroll={() => { const element = scroll.current; if (element) nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }} role="log" aria-label="Mensagens da sala" aria-live={active ? 'polite' : 'off'} tabIndex={0}>
      {hasOlder && <button className="load-older" disabled={older} onClick={loadOlder}>{older ? 'Carregando…' : 'Carregar anteriores'}</button>}
      {!messages.length && !loading && !error && <div className="chat-empty"><span aria-hidden="true">#</span><p>Nenhuma mensagem nos últimos 30 dias.</p></div>}
      {messages.map(message => <div className="message" key={message.id} data-message-id={message.id}><div className="message-meta"><strong>{message.name}{message.own ? ' (você)' : ''}</strong><time dateTime={message.createdAt}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time>{message.own && (!!message.body || !message.image) && <MessageActions message={message} onDelete={removeMessage} />}</div>{message.body && <p>{messageParts(message.body).map((part, index) => part.href ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a> : part.text)}</p>}{message.image && <MessageImage image={message.image}>{message.own && <MessageActions message={message} onDelete={removeMessage} imageOnly />}</MessageImage>}</div>)}
    </div>
    <form className="chat-form" onSubmit={submit} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { if (!isSending) image.drop(event); }}>
      <ImageComposer image={image} disabled={isSending} />
      <div className="composer-row"><ImageAttachmentButton image={image} disabled={isSending} /><label htmlFor="message" className="sr-only">Mensagem</label><textarea ref={composer} id="message" rows={1} maxLength={MAX_MESSAGE_BYTES} value={text} onChange={event => { setText(event.target.value); setSaved(false); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} onPaste={image.paste} placeholder="Escreva para # geral…" aria-describedby="message-help" disabled={isSending} /><button className="primary icon-button" disabled={isSending || (!text.trim() && !image.pending)} aria-label="Enviar mensagem" aria-busy={isSending} title={isSending ? 'Salvando…' : 'Enviar mensagem'}><Icon name="send" /></button></div>
      <p id="message-help" className="sr-only">Enter envia; Shift+Enter quebra a linha. Até {MAX_MESSAGE_BYTES} bytes.</p>
      <div className="chat-send"><span className="muted">{text ? `${new TextEncoder().encode(text).length}/${MAX_MESSAGE_BYTES} bytes` : ''}</span><span role="status">{isSending ? 'Salvando…' : saved ? 'Salva no histórico' : ''}</span></div>{error && <div className="error" role="alert"><p>{error}</p><button type="button" onClick={() => refreshNow.current()}>Atualizar histórico</button></div>}</form>
  </section>;
}
