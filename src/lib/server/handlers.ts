import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getConfig, allowedOrigins } from './config';
import { COOKIE_NAME, cookieOptions, passwordMatches, signSession, verifySession } from './session';
import { rateLimit, LimitError } from './rate-limit';
import { createRoomToken, ensureRoom, roomService, RoomFullError } from './livekit';
import { normalizeNickname, validNickname, ROOM_FULL_MESSAGE } from '../room';

export const services = { getConfig, rateLimit, ensureRoom, createRoomToken, roomService };
type Services = typeof services;
const credentials = z.object({ nickname: z.string().max(96).transform(normalizeNickname).refine(validNickname), password: z.string().min(1).max(256), remember: z.boolean().default(false) }).strict();
function json(value: object, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
async function readBody(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function handlers(deps: Services = services) {
  async function handle(request: NextRequest, action: 'login' | 'token' | 'logout') {
    try {
      const config = deps.getConfig();
      if (!allowedOrigins(config).includes(request.headers.get('origin') ?? '') || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Origem não permitida.' }, 403);
      if (action === 'login') {
        const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') ?? 'unknown' : 'local';
        await deps.rateLimit(config, 'login', ip);
        const parsed = credentials.safeParse(await readBody(request).catch(() => null));
        if (!parsed.success) return json({ error: 'Use um apelido de 2 a 24 caracteres (letras, números, espaços, ponto, hífen ou sublinhado) e informe a senha.' }, 400);
        if (!passwordMatches(parsed.data.password, config)) return json({ error: 'Senha incorreta.' }, 401);
        const { token, session } = await signSession(parsed.data.nickname, config, parsed.data.remember);
        const response = json({ nickname: session.nickname });
        response.cookies.set(COOKIE_NAME, token, cookieOptions(config, parsed.data.remember));
        return response;
      }
      const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
      if (action === 'logout') {
        // SDK disconnect releases devices; server removal also revokes the LiveKit token.
        if (session) await deps.roomService(config).removeParticipant(config.LIVEKIT_ROOM_NAME, session.identity).catch(() => undefined);
        const response = json({ ok: true });
        response.cookies.set(COOKIE_NAME, '', { ...cookieOptions(config), maxAge: 0 });
        return response;
      }
      if (!session) return json({ error: 'Sua sessão expirou. Entre novamente.' }, 401);
      const body = await readBody(request).catch(() => null);
      if (!z.object({}).strict().safeParse(body).success) return json({ error: 'Solicitação inválida.' }, 400);
      await deps.rateLimit(config, 'token', session.identity);
      await deps.ensureRoom(config);
      const token = await deps.createRoomToken(config, session);
      return json({ token, serverUrl: config.LIVEKIT_URL, identity: session.identity, nickname: session.nickname });
    } catch (error) {
      if (error instanceof RoomFullError) return json({ error: ROOM_FULL_MESSAGE }, 409);
      if (error instanceof LimitError) return json({ error: error.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'A proteção de acesso está indisponível. Tente novamente mais tarde.' }, error.status, { 'Retry-After': String(error.retryAfter) });
      return json({ error: 'Sala indisponível. A configuração dos serviços precisa ser verificada pelo responsável.' }, 503);
    }
  }
  return {
    login: (request: NextRequest) => handle(request, 'login'),
    token: (request: NextRequest) => handle(request, 'token'),
    logout: (request: NextRequest) => handle(request, 'logout'),
  };
}
