import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ServerError } from 'livekit-server-sdk';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { createScreenToken, roomService, screenRoomName } from './livekit';

const defaults = { getConfig, rateLimit, createScreenToken, roomService };
export async function viewHandler(request: NextRequest, deps = defaults, leave = false) {
  try {
    const config = deps.getConfig();
    if (request.headers.get('sec-fetch-site') === 'cross-site' || !allowedOrigins(config).includes(request.headers.get('origin') ?? '')) return json({ error: 'Origem não permitida.' }, 403);
    const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
    if (!session) return json({ error: 'Seu acesso expirou. Volte à entrada.' }, 401);
    const body = await readBody(request).catch(() => null);
    if (leave) {
      const parsed = z.object({ room: z.enum(['main', 'second']), identity: z.string().max(100) }).strict().safeParse(body);
      if (!parsed.success || !parsed.data.identity.startsWith(session.identity + ':view:') || !z.uuid().safeParse(parsed.data.identity.slice(session.identity.length + 6)).success) return json({ error: 'Solicitação inválida.' }, 400);
      await deps.rateLimit(config, 'view-leave', session.identity);
      try {
        await deps.roomService(config).removeParticipant(screenRoomName(config, parsed.data.room), parsed.data.identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 30) });
      } catch (failure) {
        // An already absent observer needs no disconnect; other failures remain retryable.
        if (!(failure instanceof ServerError && failure.code === 'not_found')) throw failure;
      }
      return json({ ok: true });
    }
    const parsed = z.object({ room: z.enum(['main', 'second']) }).strict().safeParse(body);
    if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400);
    await deps.rateLimit(config, 'view-token', session.identity);
    const identity = `${session.identity}:view:${randomUUID()}`;
    const token = await deps.createScreenToken(config, { ...session, identity }, parsed.data.room, false);
    return json({ token, identity, nickname: session.nickname, serverUrl: config.LIVEKIT_URL, voiceRoom: parsed.data.room });
  } catch (failure) {
    if (failure instanceof LimitError) return json({ error: 'Aguarde antes de abrir outra sala.' }, failure.status);
    return json({ error: 'Visualização indisponível. Tente novamente.' }, 503);
  }
}
