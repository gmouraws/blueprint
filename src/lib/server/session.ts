import 'server-only';
import type { Config } from './config';
import { createAuth, ACCOUNT_COOKIE } from './auth';
import { accountTransaction } from './account-db';
export { SESSION_SECONDS, REMEMBERED_SESSION_SECONDS } from './auth';
export const COOKIE_NAME = ACCOUNT_COOKIE;
export type Session = { identity: string; nickname: string; sessionId: string; role: 'owner' | 'member' };
export function cookieOptions(config: Config) {
  return { httpOnly: true, secure: process.env.VERCEL === '1' || config.APP_ORIGIN.startsWith('https:'), sameSite: 'strict' as const, path: '/' };
}
export async function verifySession(token: string | undefined, _config?: Config): Promise<Session | null> {
  void _config;
  if (!token || token.length > 2048 || /[;\r\n]/.test(token)) return null;
  const found = await createAuth().api.getSession({ headers: new Headers({ cookie: `${COOKIE_NAME}=${token}` }) });
  if (!found) return null;
  return accountTransaction(async db => {
    const result = await db.query(`SELECT u.id, u.name, u.role, s.id AS session_id FROM blueprint_user u JOIN blueprint_session s ON s."userId" = u.id
      WHERE s.id = $1 AND u.status = 'active' AND s.revoked_at IS NULL AND s."expiresAt" > now()`, [found.session.id]);
    const row = result.rows[0];
    return row ? { identity: row.id, nickname: row.name, sessionId: row.session_id, role: row.role } : null;
  });
}
