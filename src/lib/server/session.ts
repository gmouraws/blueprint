import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config';
import { validNickname } from '../room';

export const SESSION_SECONDS = 12 * 60 * 60;
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
export async function signSession(nickname: string, config: Config) {
  const session = { identity: randomUUID(), nickname };
  const token = await new SignJWT({ nickname }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.identity).setIssuer('blueprint-room').setAudience(config.LIVEKIT_ROOM_NAME)
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(sessionKey(config));
  return { token, session };
}
export async function verifySession(token: string | undefined, config: Config): Promise<Session | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(config), { algorithms: ['HS256'], issuer: 'blueprint-room', audience: config.LIVEKIT_ROOM_NAME, maxTokenAge: `${SESSION_SECONDS}s` });
    if (!payload.exp || !payload.sub || !/^[\da-f-]{36}$/.test(payload.sub) || typeof payload.nickname !== 'string' || !validNickname(payload.nickname)) return null;
    return { identity: payload.sub, nickname: payload.nickname };
  } catch { return null; }
}
export function cookieOptions(config: Config) {
  return { httpOnly: true, secure: process.env.VERCEL === '1' || new URL(config.APP_ORIGIN).protocol === 'https:', sameSite: 'strict' as const, path: '/', maxAge: SESSION_SECONDS };
}
