import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config';
import { validNickname } from '../room';

export const SESSION_SECONDS = 12 * 60 * 60;
export const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const COOKIE_NAME = 'blueprint-room-session';
export type Session = { identity: string; nickname: string };
function sessionKey(config: Config) {
  // Rotating either secret invalidates existing cookies without storing sessions.
  return createHmac('sha256', config.SESSION_SECRET).update(config.ROOM_PASSWORD).digest();
}
export function passwordMatches(input: string, config: Config) {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(input), hash(config.ROOM_PASSWORD));
}
export async function signSession(nickname: string, config: Config, remember = false) {
  const session = { identity: randomUUID(), nickname };
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ nickname, remember }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.identity).setIssuer('blueprint-room').setAudience(config.LIVEKIT_ROOM_NAME)
    .setIssuedAt(issuedAt).setExpirationTime(issuedAt + (remember ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS)).sign(sessionKey(config));
  return { token, session };
}
export async function verifySession(token: string | undefined, config: Config): Promise<Session | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(config), { algorithms: ['HS256'], issuer: 'blueprint-room', audience: config.LIVEKIT_ROOM_NAME, maxTokenAge: `${REMEMBERED_SESSION_SECONDS}s` });
    // Existing cookies without this claim retain their original 12-hour ceiling.
    if (payload.remember !== undefined && typeof payload.remember !== 'boolean') return null;
    const lifetime = payload.remember === true ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat || payload.exp - payload.iat > lifetime) return null;
    if (!payload.exp || !payload.sub || !/^[\da-f-]{36}$/.test(payload.sub) || typeof payload.nickname !== 'string' || !validNickname(payload.nickname)) return null;
    return { identity: payload.sub, nickname: payload.nickname };
  } catch { return null; }
}
export function cookieOptions(config: Config, remember = false) {
  return { httpOnly: true, secure: process.env.VERCEL === '1' || new URL(config.APP_ORIGIN).protocol === 'https:', sameSite: 'strict' as const, path: '/', ...(remember ? { maxAge: REMEMBERED_SESSION_SECONDS } : {}) };
}
