'use client';

import { useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { CHAT_TOPIC, MAX_MESSAGE_BYTES, encodeMessage } from '@/lib/room';
import { mergeMessages, type ChatMessage, type ChatPage } from '@/lib/chat';
import { Icon } from './icons';

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
  const records = useRef<ChatMessage[]>([]);
  const latest = useRef('0');
  const earliest = useRef('');
  const initialized = useRef(false);
  const alive = useRef(false);
  const sending = useRef(false);
  const retry = useRef<{ body: string; requestId: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const unread = useRef(0);
  const serverOffset = useRef(0);
  const refreshNow = useRef<() => void>(() => {});
  const accept = useCallback((incoming: ChatMessage[]) => {
    const previous = records.current;
    records.current = mergeMessages(records.current, incoming, Date.now() + serverOffset.current);
    if (previous.length !== records.current.length || incoming.length) setMessages(records.current);
  }, []);
  const receivePage = useEffectEvent((page: ChatPage, first: boolean) => {
    serverOffset.current = Date.parse(page.serverTime) - Date.now();
    const unseen = page.messages.filter(message => !message.own && !records.current.some(record => record.id === message.id));
    if (!first && !active && unseen.length) { unread.current += unseen.length; onUnread(unread.current); }
    accept(page.messages);
  });
  const isActive = useEffectEvent(() => active);
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
          const page: ChatPage = await request(`/api/chat${first ? '' : `?after=${latest.current}`}`);
          if (stopped) return;
          receivePage(page, first);
          if (first) { initialized.current = true; setHasOlder(page.hasMore); earliest.current = page.messages[0]?.id ?? ''; }
          if (page.messages.length) latest.current = page.messages.at(-1)!.id;
          setLoading(false); setError('');
          if (first || !page.hasMore) break;
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
    const polling = setInterval(() => { if (isActive() || room.state === ConnectionState.Connected) void refresh(); }, 10000);
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
    if (!payload) { setError(`Escreva uma mensagem de até ${MAX_MESSAGE_BYTES} bytes.`); return; }
    const body = new TextDecoder().decode(payload);
    if (!retry.current || retry.current.body !== body) retry.current = { body, requestId: crypto.randomUUID() };
    sending.current = true; setIsSending(true); setError(''); setSaved(false);
    try {
      const result: { message: ChatMessage } = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retry.current) });
      if (!alive.current) return;
      accept([result.message]); setText(''); retry.current = null; setSaved(true);
      // Hint failure cannot undo a durable save; polling catches up.
      if (room.state === ConnectionState.Connected) void room.localParticipant.publishData(new Uint8Array([1]), { reliable: true, topic: CHAT_TOPIC }).catch(() => undefined);
      refreshNow.current();
    } catch (failure) { if (alive.current) setError(`${failure instanceof Error ? failure.message : 'Não foi possível confirmar o salvamento.'} Seu texto foi mantido; reenviar o mesmo texto não duplica a mensagem.`); }
    finally { sending.current = false; if (alive.current) setIsSending(false); }
  }
  return <section className="chat-panel" aria-labelledby="chat-heading"><div className="panel-heading"><h2 id="chat-heading"># geral</h2><span className="pill">Histórico de 30 dias</span></div><p className="chat-disclosure">Mensagens visíveis a todos com acesso à sala e mantidas por 30 dias. Apelidos são nomes de exibição, não identidades verificadas. Você pode conversar sem entrar na voz.</p>
    {loading && <p className="chat-loading" role="status">Carregando histórico…</p>}
    <div className="messages" ref={scroll} onScroll={() => { const element = scroll.current; if (element) nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }} role="log" aria-label="Mensagens da sala" aria-live={active ? 'polite' : 'off'} tabIndex={0}>
      {hasOlder && <button className="load-older" disabled={older} onClick={loadOlder}>{older ? 'Carregando…' : 'Carregar anteriores'}</button>}
      {!messages.length && !loading && !error && <div className="chat-empty"><span aria-hidden="true">#</span><p>Nenhuma mensagem nos últimos 30 dias.</p></div>}
      {messages.map(message => <div className="message" key={message.id} data-message-id={message.id}><div className="message-meta"><strong>{message.name}{message.own ? ' (você)' : ''}</strong><time dateTime={message.createdAt}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time></div><p>{message.body}</p></div>)}
    </div>
    <form className="chat-form" onSubmit={submit}><label htmlFor="message">Mensagem</label><textarea id="message" rows={2} maxLength={MAX_MESSAGE_BYTES} value={text} onChange={event => { setText(event.target.value); setSaved(false); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Escreva para # geral…" disabled={isSending} /><p className="chat-keyboard muted">Enter envia · Shift+Enter quebra a linha</p><div className="chat-send"><span className="muted">{new TextEncoder().encode(text).length}/{MAX_MESSAGE_BYTES} bytes</span><span role="status">{saved ? 'Salva no histórico' : ''}</span><button className="primary" disabled={isSending || !text.trim()} aria-label="Enviar mensagem"><Icon name="send" />{isSending ? 'Salvando…' : 'Enviar'}</button></div>{error && <div className="error" role="alert"><p>{error}</p><button type="button" onClick={() => refreshNow.current()}>Atualizar histórico</button></div>}</form>
  </section>;
}
