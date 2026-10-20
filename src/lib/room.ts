export const MAX_PARTICIPANTS = 5;
export const CHAT_TOPIC = 'blueprint.chat';
export const MAX_MESSAGE_BYTES = 2000;
export const MAX_MESSAGES = 200;

export function normalizeNickname(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function validNickname(value: string) {
  return value.length >= 2 && value.length <= 24 && /^[\p{L}\p{N} _.-]+$/u.test(value);
}

export function encodeMessage(text: string): Uint8Array | null {
  const value = text.trim();
  const bytes = new TextEncoder().encode(value);
  return value && bytes.length <= MAX_MESSAGE_BYTES ? bytes : null;
}

export function decodeMessage(bytes: Uint8Array): string | null {
  if (!bytes.length || bytes.length > MAX_MESSAGE_BYTES) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.trim() ? text : null;
  } catch { return null; }
}

export type ConnectionDetails = { token: string; serverUrl: string; identity: string; nickname: string };
