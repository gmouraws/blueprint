import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { admissionService, AdmissionBusy } from './voice-admission';

export async function voiceHandler(request: NextRequest, leave = false) {
  try {
    const config = getConfig();
    const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || ((leave || origin) && !allowedOrigins(config).includes(origin ?? ''))) return json({ error: 'Origem não permitida.' }, 403);
    const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
    if (!session) return json({ error: 'Seu acesso expirou. Volte à entrada.' }, 401);
    await rateLimit(config, leave ? 'token' : 'voice-read', session.identity);
    const service = admissionService(config);
    if (!leave) return json({ rooms: await service.roster() });
    const parsed = z.object({ identity: z.string().min(1).max(100) }).strict().safeParse(await readBody(request).catch(() => null));
    if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400);
    await service.leave(session, parsed.data.identity);
    return json({ ok: true });
  } catch (failure) {
    if (failure instanceof AdmissionBusy) return json({ error: 'Outra entrada está em andamento. Tente novamente.' }, 409);
    if (failure instanceof LimitError) return json({ error: 'Aguarde antes de atualizar as salas.' }, failure.status);
    return json({ error: 'Não foi possível atualizar a voz. Tente novamente.' }, 503);
  }
}
