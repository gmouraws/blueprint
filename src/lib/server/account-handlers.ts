import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { accountTransaction } from './account-db';
import { lockMember, revokeSessions, cleanRevokedMedia } from './account-media';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { normalizeNickname, validNickname } from '../room';
import { accountPreferencesSchema } from '../account-preferences';

export const accountServices = { rateLimit };
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile'), name: z.string().max(96).transform(normalizeNickname).refine(validNickname) }).strict(),
  z.object({ action: z.literal('preferences'), version: z.number().int().nonnegative(), preferences: accountPreferencesSchema }).strict(),
  z.object({ action: z.literal('invite'), email: z.string().trim().toLowerCase().email().max(254) }).strict(),
  z.object({ action: z.literal('revoke-invite'), id: z.uuid() }).strict(),
  z.object({ action: z.enum(['disable', 'reactivate', 'revoke']), id: z.uuid() }).strict(),
  z.object({ action: z.literal('retry-cleanup') }).strict(),
]);
export async function accountHandler(request: NextRequest) {
  try {
    const config = getConfig();
    const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || ((request.method !== 'GET' || origin) && !allowedOrigins(config).includes(origin ?? ''))) return json({ error: 'Origem não permitida.' }, 403);
    const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
    if (!session) {
      if (request.cookies.has(COOKIE_NAME)) {
        await accountServices.rateLimit(config, 'login', request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown');
        await cleanRevokedMedia();
      }
      return json({ error: 'Sua sessão expirou. Entre novamente; seu rascunho continua nesta página.' }, 401);
    }
    await accountServices.rateLimit(config, request.method === 'GET' ? 'chat-read' : 'chat-write', session.identity);
    if (request.method === 'GET') {
      // Retry persisted revocations/expired sessions while the application is in use.
      await cleanRevokedMedia();
      const data = await accountTransaction(async db => {
        const { rows } = await db.query('SELECT id, name, role, avatar_id, preferences, preference_version FROM blueprint_user WHERE id = $1', [session.identity]);
        const owner = session.role === 'owner' ? {
          members: (await db.query('SELECT id, name, email, role, status FROM blueprint_user ORDER BY "createdAt"')).rows,
          invitations: (await db.query('SELECT id, email, expires_at, revoked_at, accepted_at FROM blueprint_invitation ORDER BY created_at DESC LIMIT 100')).rows,
          cleanupPending: (await db.query('SELECT 1 FROM blueprint_media_lease WHERE revoked_at IS NOT NULL AND cleaned_at IS NULL LIMIT 1')).rows.length > 0,
        } : {};
        return { ...rows[0], ...owner };
      });
      return json(data);
    }
    const parsed = inputSchema.safeParse(await readBody(request).catch(() => null));
    if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400);
    const input = parsed.data;
    const ownerAction = !['profile','preferences'].includes(input.action);
    if (ownerAction && session.role !== 'owner') return json({ error: 'Acesso restrito ao responsável.' }, 403);
    const result = await accountTransaction(async db => {
      // Global owner lock precedes row locks in bootstrap, signup and management.
      await db.query('SELECT pg_advisory_xact_lock(148296241,4)');
      await lockMember(db, session);
      if (input.action === 'profile') await db.query('UPDATE blueprint_user SET name = $1, "updatedAt" = now() WHERE id = $2', [input.name, session.identity]);
      if (input.action === 'preferences') {
        const changed = await db.query('UPDATE blueprint_user SET preferences = $1, preference_version = preference_version + 1 WHERE id = $2 AND preference_version = $3 RETURNING preference_version', [JSON.stringify(input.preferences), session.identity, input.version]);
        if (!changed.rows.length) return false;
      }
      if (input.action === 'invite') {
        await db.query('UPDATE blueprint_invitation SET revoked_at = now() WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [input.email]);
        await db.query("INSERT INTO blueprint_invitation(id,email,created_by,expires_at) VALUES($1,$2,$3,now() + interval '7 days')", [randomUUID(),input.email,session.identity]);
      }
      if (input.action === 'revoke-invite') await db.query('UPDATE blueprint_invitation SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL', [input.id]);
      if (input.action === 'disable' || input.action === 'reactivate') await db.query('UPDATE blueprint_user SET status = $1 WHERE id = $2', [input.action === 'disable' ? 'disabled' : 'active', input.id]);
      return true;
    });
    if (!result) return json({ error: 'As preferências mudaram em outro dispositivo. Reabra o perfil antes de salvar.' }, 409);
    if (input.action === 'disable' || input.action === 'revoke') return json({ ok: true, ...await revokeSessions(input.id) });
    if (input.action === 'retry-cleanup') return json({ ok: true, ...await cleanRevokedMedia() });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof LimitError) return json({ error: 'Aguarde antes de tentar novamente.' }, error.status);
    return json({ error: 'Não foi possível concluir. O único responsável não pode ser desativado. Tente novamente.' }, 503);
  }
}
