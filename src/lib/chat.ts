export const CHAT_PAGE_SIZE = 50;
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export type ChatMessage = { id: string; channel: 'geral'; senderId: string; name: string; body: string; createdAt: string; own: boolean; image?: ChatImage };
export type ChatDeletion = { id: string; kind: 'message' | 'image' };
export type ChatPage = { messages: ChatMessage[]; hasMore: boolean; serverTime: string; changes?: { cursor: string; items: ChatDeletion[]; hasMore: boolean } };
export function reconcileDeletions(messages: ChatMessage[], deleted: ReadonlyMap<string, ChatDeletion['kind']>) {
  return messages.filter(message => deleted.get(message.id) !== 'message').map(message => {
    if (deleted.get(message.id) !== 'image' || !message.image) return message;
    return { ...message, image: undefined };
  });
}
export function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[], now = Date.now()) {
  return [...new Map([...previous, ...incoming].map(message => [message.id, message])).values()]
    .filter(message => Date.parse(message.createdAt) > now - CHAT_RETENTION_MS)
    .sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
}
import type { ChatImage } from './images';
