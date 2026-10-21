import 'server-only';
import type { PoolClient } from 'pg';
import { accountTransaction } from './account-db';
import { getConfig } from './config';
import { roomService } from './livekit';
import type { Session } from './session';

export class AccountExpired extends Error {}
export async function lockMember(db: PoolClient, session: Session) {
  const result = await db.query(`SELECT u.id FROM blueprint_user u JOIN blueprint_session s ON s."userId" = u.id
    WHERE u.id = $1 AND s.id = $2 AND u.status = 'active' AND s.revoked_at IS NULL AND s."expiresAt" > now() FOR UPDATE OF u, s`, [session.identity, session.sessionId]);
  if (!result.rows.length) throw new AccountExpired();
}
export async function issueMedia<T>(session: Session, issue: () => Promise<T>, leases: (value: T) => { identity: string; room: string }[]) {
  return accountTransaction(async db => {
    await lockMember(db, session);
    const result = await issue();
    for (const lease of leases(result)) await db.query('INSERT INTO blueprint_media_lease(identity,user_id,session_id,room) VALUES($1,$2,$3,$4)', [lease.identity, session.identity, session.sessionId, lease.room]);
    return result;
  });
}
export async function revokeSessions(userId: string, sessionId?: string) {
  await accountTransaction(async db => {
    await db.query('SELECT id FROM blueprint_user WHERE id = $1 FOR UPDATE', [userId]);
    await db.query('UPDATE blueprint_session SET revoked_at = now() WHERE "userId" = $1 AND ($2::uuid IS NULL OR id = $2)', [userId, sessionId ?? null]);
    await db.query('UPDATE blueprint_media_lease SET revoked_at = now() WHERE user_id = $1 AND ($2::uuid IS NULL OR session_id = $2) AND cleaned_at IS NULL', [userId, sessionId ?? null]);
  });
  return cleanRevokedMedia();
}
export async function cleanRevokedMedia() {
  const leases = await accountTransaction(async db => {
    await db.query(`UPDATE blueprint_media_lease l SET revoked_at = COALESCE(l.revoked_at, now()) FROM blueprint_session s, blueprint_user u
      WHERE l.session_id = s.id AND l.user_id = u.id AND l.cleaned_at IS NULL AND (s.revoked_at IS NOT NULL OR s."expiresAt" <= now() OR u.status <> 'active')`);
    return (await db.query('SELECT identity, room FROM blueprint_media_lease WHERE revoked_at IS NOT NULL AND cleaned_at IS NULL LIMIT 100')).rows;
  });
  let pending = false;
  const client = roomService(getConfig());
  for (const lease of leases) {
    try {
      await client.removeParticipant(lease.room, lease.identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 30) });
      await accountTransaction(db => db.query('UPDATE blueprint_media_lease SET cleaned_at = now() WHERE identity = $1', [lease.identity]));
    } catch { pending = true; }
  }
  await accountTransaction(async db => {
    await db.query("DELETE FROM blueprint_media_lease WHERE cleaned_at < now() - interval '1 day'");
    await db.query(`DELETE FROM blueprint_session s WHERE (s."expiresAt" < now() - interval '1 day' OR s.revoked_at < now() - interval '1 day') AND NOT EXISTS(SELECT 1 FROM blueprint_media_lease l WHERE l.session_id=s.id)`);
    await db.query('DELETE FROM blueprint_verification WHERE "expiresAt" < now()');
  });
  return { cleanupPending: pending || leases.length === 100 };
}
