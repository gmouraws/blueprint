'use client';

import { useDataChannel, useRoomContext } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_TOPIC, MAX_MESSAGES, MAX_MESSAGE_BYTES, decodeMessage, encodeMessage } from '@/lib/room';
import { Icon } from './icons';

type Message = { id: string; identity: string; name: string; text: string; timestamp: number; local: boolean };
export function Chat({ connected }: { connected: boolean }) {
  const room = useRoomContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const lastSend = useRef(0);
  const receiveTimes = useRef(new Map<string, number>());
  const { send, isSending } = useDataChannel(CHAT_TOPIC, message => {
    if (!message.from || message.from.isLocal) return;
    const value = decodeMessage(message.payload);
    if (!value) return;
    const now = Date.now();
    if (now - (receiveTimes.current.get(message.from.identity) ?? 0) < 250) return;
    if (receiveTimes.current.size > 100) receiveTimes.current.clear();
    receiveTimes.current.set(message.from.identity, now);
    // Identity and name come from LiveKit's authenticated participant, not the payload.
    setMessages(previous => [...previous, { id: crypto.randomUUID(), identity: message.from!.identity, name: message.from!.name || 'Participante', text: value, timestamp: now, local: false }].slice(-MAX_MESSAGES));
  });
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = encodeMessage(text);
    if (!payload) { setError(`Escreva uma mensagem de até ${MAX_MESSAGE_BYTES} bytes.`); return; }
    if (isSending || room.state !== ConnectionState.Connected) return;
    if (Date.now() - lastSend.current < 750) { setError('Espere um instante antes de enviar outra mensagem.'); return; }
    lastSend.current = Date.now(); setError('');
    try {
      await send(payload, { reliable: true });
      setMessages(previous => [...previous, { id: crypto.randomUUID(), identity: room.localParticipant.identity, name: room.localParticipant.name || 'Você', text: new TextDecoder().decode(payload), timestamp: Date.now(), local: true }].slice(-MAX_MESSAGES));
      setText('');
    } catch { setError('Não foi possível confirmar o envio. A mensagem pode não ter chegado; tente novamente.'); }
  }
  return <aside className="chat-panel" aria-labelledby="chat-heading"><div className="panel-heading"><h2 id="chat-heading">Conversa</h2><span className="pill">Único canal</span></div><p className="chat-disclosure">Mensagens só desta sessão. Quem chega depois não vê as anteriores. O envio não confirma leitura.</p>
    <div className="messages" role="log" aria-label="Mensagens da sala" aria-live="polite" tabIndex={0}>
      {!messages.length && <div className="chat-empty"><span aria-hidden="true">#</span><p>A conversa começa aqui.</p><p className="muted">Mande um oi para quem está na sala.</p></div>}
      {messages.map(message => <div className="message" key={message.id}><div className="message-meta"><strong title={`Identidade: ${message.identity.slice(0, 8)}`}>{message.name}{message.local ? ' (você)' : ''}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(message.timestamp)}</time></div><p>{message.text}</p></div>)}<div ref={bottom} />
    </div>
    <form className="chat-form" onSubmit={submit}><label htmlFor="message">Mensagem</label><textarea id="message" rows={2} maxLength={MAX_MESSAGE_BYTES} value={text} onChange={event => setText(event.target.value)} placeholder="Escreva para a sala…" disabled={!connected || isSending} /><div className="chat-send"><span className="muted">{new TextEncoder().encode(text).length}/{MAX_MESSAGE_BYTES} bytes</span><button className="primary" disabled={!connected || isSending || !text.trim()} aria-label="Enviar mensagem"><Icon name="send" />{isSending ? 'Enviando…' : 'Enviar'}</button></div>{error && <p className="error" role="alert">{error}</p>}</form>
  </aside>;
}
