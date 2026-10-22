import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { STREAM_COOKIE, StreamError, streamService, validCredential } from './stream-space';
import { invitationUrl } from './stream-discord';
export { invitationUrl, discordTarget } from './stream-discord';

export const streamServices = { getConfig, verifySession, rateLimit, streamService, fetch: globalThis.fetch };
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('exchange'), credential: z.string().refine(validCredential) }).strict(),
  z.object({ action: z.enum(['join', 'status', 'discover', 'stopped', 'handoff']) }).strict(),
  z.object({ action: z.literal('leave'), connectionId: z.uuid() }).strict(),
  z.object({ action: z.literal('announce'), attempt: z.uuid() }).strict(),
]);
const management = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('persistent'), operation: z.enum(['status', 'create', 'copy', 'rotate', 'revoke']) }).strict(),
  z.object({ action: z.literal('create'), role: z.enum(['share', 'watch']), hours: z.union([z.literal(1), z.literal(24), z.literal(168)]) }).strict(),
  z.object({ action: z.literal('revoke'), id: z.uuid() }).strict(),
]);
export async function streamHandler(request: NextRequest, owner = false, deps = streamServices) {
  try {
    const config = deps.getConfig();
    const origin = request.headers.get('origin') ?? '';
    if (request.headers.get('sec-fetch-site') === 'cross-site' || !allowedOrigins(config).includes(origin)) return json({ error: 'Origem não permitida.' }, 403);
    const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') ?? 'unknown' : 'local';
    await deps.rateLimit(config, 'stream-request', ip);
    const body = await readBody(request).catch(() => null);
    const service = deps.streamService(config);
    if (owner) {
      const session = await deps.verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
      if (!session) return json({ error: 'Entre com sua conta de responsável.' }, 401);
      if (session.role !== 'owner') return json({ error: 'Acesso restrito ao responsável.' }, 403);
      await deps.rateLimit(config, 'stream-owner', session.identity);
      const parsed = management.safeParse(body);
      if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400);
      if (parsed.data.action === 'persistent') {
        const result = await service.persistent(parsed.data.operation);
        return json({ active: result.active, cleanupPending: result.cleanupPending, urls: result.links ? { share: invitationUrl(config.APP_ORIGIN, result.links.share, 'share'), watch: invitationUrl(config.APP_ORIGIN, result.links.watch, 'watch') } : undefined });
      }
      const result = await service.manage(parsed.data.action, parsed.data.action === 'list' ? undefined : parsed.data);
      return json({ invitations: result.invitations, cleanupPending: result.cleanupPending, url: result.created ? invitationUrl(origin, result.created.secret, result.created.role) : undefined });
    }
    const parsed = input.safeParse(body);
    if (!parsed.success) return json({ error: 'Convite ou solicitação inválida.' }, 400);
    const secret = request.cookies.get(STREAM_COOKIE)?.value ?? '';
    const cookie = { httpOnly: true, secure: process.env.VERCEL === '1' || config.APP_ORIGIN.startsWith('https:'), sameSite: 'strict' as const, path: '/api/stream' };
    if (parsed.data.action === 'exchange') {
      await deps.rateLimit(config, 'stream-exchange', ip);
      const result = await service.exchange(parsed.data.credential, secret);
      const response = json({ expires: result.expires, role: result.role });
      response.cookies.set(STREAM_COOKIE, result.secret, cookie);
      return response;
    }
    if (!validCredential(secret)) return json({ error: 'Abra um convite privado válido para acessar este espaço.' }, 401);
    await deps.rateLimit(config, parsed.data.action === 'join' ? 'stream-join' : 'stream-session', secret);
    if (parsed.data.action === 'leave') {
      return json(await service.leave(secret, parsed.data.connectionId));
    }
    if (parsed.data.action === 'announce') {
      await service.status(secret);
      // Actual publication and notification delivery are reconciled independently by the route/events.
      return json({ ok: true, announcement: 'checked' });
    }
    if (parsed.data.action === 'status' || parsed.data.action === 'discover') return json(await service[parsed.data.action](secret), 200, { 'X-Blueprint-Media-Read': '1' });
    return json(await service[parsed.data.action](secret));
  } catch (error) {
    if (error instanceof StreamError) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status, error.code === 'STREAM_BUSY' ? { 'Retry-After': '1' } : undefined);
    if (error instanceof LimitError) return json({ error: 'Muitas solicitações ou proteção indisponível. Aguarde e tente novamente.' }, error.status, { 'Retry-After': String(error.retryAfter) });
    return json({ error: 'Espaço indisponível. Tente novamente em instantes.' }, 503);
  }
}
