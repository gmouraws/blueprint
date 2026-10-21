import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getConfig, allowedOrigins } from './config';
import { COOKIE_NAME, cookieOptions, verifySession } from './session';
import { rateLimit, LimitError } from './rate-limit';
import { createRoomToken, ensureRoom, roomService, RoomFullError } from './livekit';
import { ROOM_FULL_MESSAGE } from '../room';
import { issueMedia, revokeSessions } from './account-media';
import { livekitRoomName, screenRoomName } from './livekit';
import { admissionService, AdmissionBusy, TakeoverRequired } from './voice-admission';

export const services = { getConfig, rateLimit, ensureRoom, createRoomToken, roomService, admissionService };
type Services = typeof services;
export function json(value: object, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export async function readBody(request: NextRequest, maximum = 4096) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new Error('Body too large'); }
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
      if (action === 'login') return json({ error: 'Use o código enviado ao seu e-mail.' }, 410);
      const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
      if (action === 'logout') {
        // SDK disconnect releases devices; server removal also revokes the LiveKit token.
        const mediaRevoked = session ? !(await revokeSessions(session.identity, session.sessionId)).cleanupPending : true;
        // Forgetting browser access must remain possible during a media-service outage.
        const response = json({ ok: true, mediaRevoked });
        response.cookies.set(COOKIE_NAME, '', { ...cookieOptions(config), maxAge: 0 });
        return response;
      }
      if (!session) return json({ error: 'Sua sessão expirou. Entre novamente.' }, 401);
      const body = await readBody(request).catch(() => null);
      const parsed = z.object({ room: z.enum(['main', 'second']).default('main'), takeover: z.boolean().default(false) }).strict().safeParse(body);
      if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400);
      await deps.rateLimit(config, 'token', session.identity);
      return json(await issueMedia(session, () => deps.admissionService(config).join(session, parsed.data.room, parsed.data.takeover), result => [
        { identity: result.identity, room: livekitRoomName(config, parsed.data.room) },
        { identity: result.screens.identity, room: screenRoomName(config, parsed.data.room) },
      ]));
    } catch (error) {
      if (error instanceof TakeoverRequired) return json({ error: 'Sua conta está em outra chamada. Deseja transferir a chamada para este dispositivo?', takeoverRequired: true }, 409);
      if (error instanceof RoomFullError) return json({ error: ROOM_FULL_MESSAGE }, 409);
      if (error instanceof AdmissionBusy) return json({ error: 'Outra entrada está em andamento. Aguarde e tente novamente.' }, 409);
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
