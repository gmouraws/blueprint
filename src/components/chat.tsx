'use client';

import { useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent, type RemoteParticipant } from 'livekit-client';
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
  const sending = useRef(false);
  const alive = useRef(false);
  const [isSending, setIsSending] = useState(false);
  useEffect(() => {
    alive.current = true;
    const receive = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
    if (topic !== CHAT_TOPIC || !participant || participant.isLocal) return;
    const value = decodeMessage(payload);
    if (!value) return;
    const now = Date.now();
    if (now - (receiveTimes.current.get(participant.identity) ?? 0) < 250) return;
    if (receiveTimes.current.size > 100) receiveTimes.current.clear();
    receiveTimes.current.set(participant.identity, now);
    // Identity and name come from LiveKit's authenticated participant, not the payload.
    setMessages(previous => [...previous, { id: crypto.randomUUID(), identity: participant.identity, name: participant.name || 'Participante', text: value, timestamp: now, local: false }].slice(-MAX_MESSAGES));
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { alive.current = false; room.off(RoomEvent.DataReceived, receive); };
  }, [room]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = encodeMessage(text);
    if (!payload) { setError(`Escreva uma mensagem de até ${MAX_MESSAGE_BYTES} bytes.`); return; }
    if (sending.current || room.state !== ConnectionState.Connected) return;
    if (Date.now() - lastSend.current < 750) { setError('Espere um instante antes de enviar outra mensagem.'); return; }
    lastSend.current = Date.now(); sending.current = true; setIsSending(true); setError('');
    try {
      await room.localParticipant.publishData(payload, { reliable: true, topic: CHAT_TOPIC });
      if (!alive.current) return;
      setMessages(previous => [...previous, { id: crypto.randomUUID(), identity: room.localParticipant.identity, name: room.localParticipant.name || 'Você', text: new TextDecoder().decode(payload), timestamp: Date.now(), local: true }].slice(-MAX_MESSAGES));
      setText('');
    } catch { if (alive.current) setError('O envio falhou. Seu texto foi mantido. Confira a conexão e tente novamente; a mensagem pode ter chegado a alguém.'); }
    finally { sending.current = false; if (alive.current) setIsSending(false); }
  }
  return <aside className="chat-panel" aria-labelledby="chat-heading"><div className="panel-heading"><h2 id="chat-heading">Conversa</h2><span className="pill">Único canal</span></div><p className="chat-disclosure">Mensagens só desta sessão. Quem chega depois não vê as anteriores. Envio aceito não confirma entrega ou leitura por todos.</p>
    <div className="messages" role="log" aria-label="Mensagens da sala" aria-live="polite" tabIndex={0}>
      {!messages.length && <div className="chat-empty"><span aria-hidden="true">#</span><p>A conversa começa aqui.</p><p className="muted">Mande um oi para quem está na sala.</p></div>}
      {messages.map(message => <div className="message" key={message.id}><div className="message-meta"><strong title={`Identidade: ${message.identity.slice(0, 8)}`}>{message.name}{message.local ? ' (você)' : ''}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(message.timestamp)}</time></div><p>{message.text}</p></div>)}<div ref={bottom} />
    </div>
    <form className="chat-form" onSubmit={submit}><label htmlFor="message">Mensagem</label><textarea id="message" rows={2} maxLength={MAX_MESSAGE_BYTES} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Escreva para a sala…" disabled={!connected || isSending} /><p className="chat-keyboard muted">Enter envia · Shift+Enter quebra a linha</p><div className="chat-send"><span className="muted">{new TextEncoder().encode(text).length}/{MAX_MESSAGE_BYTES} bytes</span><button className="primary" disabled={!connected || isSending || !text.trim()} aria-label="Enviar mensagem"><Icon name="send" />{isSending ? 'Enviando…' : 'Enviar'}</button></div>{error && <p className="error" role="alert">{error}</p>}</form>
  </aside>;
}
