import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { ChatConflict, readChat, saveChat, cleanChat } from './chat-store';
import { encodeMessage } from '../room';

const cursor = z.string().refine(value => /^(?:0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n);
const querySchema = z.object({ before: cursor.optional(), after: cursor.optional() }).strict().refine(value => !(value.before && value.after));
const writeSchema = z.object({ body: z.string().max(2000).transform(value => value.trim()).refine(value => !value.includes('\0') && (!value || !!encodeMessage(value))), requestId: z.uuid(), imageId: z.uuid().optional() }).strict().refine(value => !!value.body || !!value.imageId);
export const chatServices = { getConfig, rateLimit, readChat, saveChat, cleanChat };
export function chatHandlers(deps = chatServices) {
  async function handle(request: NextRequest, write: boolean) {
    try {
      const config = deps.getConfig();
      const origin = request.headers.get('origin');
      if (request.headers.get('sec-fetch-site') === 'cross-site' || ((write || origin) && !allowedOrigins(config).includes(origin ?? ''))) return json({ error: 'Origem não permitida.' }, 403);
      const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
      if (!session) return json({ error: 'Seu acesso expirou. Volte à entrada e entre novamente.' }, 401);
      await deps.rateLimit(config, write ? 'chat-write' : 'chat-read', session.identity);
      if (write) {
        const parsed = writeSchema.safeParse(await readBody(request, 16384).catch(() => null));
        if (!parsed.success) return json({ error: 'Mensagem inválida. Use texto de até 2000 bytes.' }, 400);
        return json({ message: await deps.saveChat(session, parsed.data.body, parsed.data.requestId, parsed.data.imageId) });
      }
      const params = request.nextUrl.searchParams;
      const parsed = querySchema.safeParse(Object.fromEntries(params));
      if (!parsed.success || new Set(params.keys()).size !== [...params].length) return json({ error: 'Página inválida.' }, 400);
      return json(await deps.readChat(session, parsed.data));
    } catch (error) {
      if (error instanceof ChatConflict) return json({ error: 'Essa tentativa já foi usada para outro texto. Confira o histórico antes de enviar uma nova mensagem.' }, 409);
      if (error instanceof LimitError) return json({ error: error.status === 429 ? 'Muitas solicitações. Aguarde antes de tentar novamente.' : 'A proteção do chat está indisponível. Tente novamente.' }, error.status, { 'Retry-After': String(error.retryAfter) });
      return json({ error: write ? 'Não foi possível confirmar o salvamento no histórico. Tente novamente.' : 'O histórico está indisponível. Tente novamente mais tarde.' }, 503);
    }
  }
  return { GET: (request: NextRequest) => handle(request, false), POST: (request: NextRequest) => handle(request, true) };
}
export async function cleanupHandler(request: NextRequest, clean = cleanChat, secret = process.env.CRON_SECRET) {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!secret || secret.length < 32 || !timingSafeEqual(hash(request.headers.get('authorization') ?? ''), hash(`Bearer ${secret}`))) return json({ error: 'Não autorizado.' }, 401);
  try { await clean(); return json({ ok: true }); }
  catch { return json({ error: 'Limpeza indisponível.' }, 503); }
}
