import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createAuth, eligibleEmail, ACCOUNT_COOKIE } from './auth';
import { allowedOrigins, getConfig } from './config';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { normalizeNickname, validNickname } from '../room';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const codeSchema = z.object({ email: emailSchema }).strict();
const verifySchema = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/), name: z.string().max(96).transform(normalizeNickname).refine(validNickname), remember: z.boolean() }).strict();
export const accountAuthServices = { rateLimit };
export async function accountAuthHandler(request: NextRequest, verify = false) {
  try {
    const config = getConfig();
    if (request.headers.get('sec-fetch-site') === 'cross-site' || !allowedOrigins(config).includes(request.headers.get('origin') ?? '')) return json({ error: 'Origem não permitida.' }, 403);
    const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') ?? 'unknown' : 'local';
    await accountAuthServices.rateLimit(config, 'login', ip);
    const body = await readBody(request).catch(() => null);
    const parsed = (verify ? verifySchema : codeSchema).safeParse(body);
    if (!parsed.success) return json({ error: 'Confira os campos informados.' }, 400);
    await accountAuthServices.rateLimit(config, verify ? 'otp-attempt' : 'otp-send', parsed.data.email);
    const eligible = await eligibleEmail(parsed.data.email);
    if (!verify) {
      if (eligible) {
        try { await createAuth().api.sendVerificationOTP({ body: { email: parsed.data.email, type: 'sign-in' } }); }
        catch { /* Delivery failure must not disclose whether this address is a member. */ }
      }
      return json({ ok: true, message: 'Se este e-mail tem acesso, você receberá um código. Confira também o spam.' });
    }
    if (!eligible) return json({ error: 'Código inválido ou expirado. Solicite outro código.' }, 401);
    const input = verifySchema.parse(body);
    const result = await createAuth(input.remember).api.signInEmailOTP({ body: { email: input.email, otp: input.otp, name: input.name }, asResponse: true });
    if (!result.ok) return json({ error: 'Código inválido ou expirado. Solicite outro código.' }, 401);
    const response = json({ ok: true });
    response.cookies.set('blueprint-room-session', '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'strict', secure: config.APP_ORIGIN.startsWith('https:') });
    // Tokens stay server-side; forward only the HttpOnly cookie.
    for (let cookie of result.headers.getSetCookie()) {
      if (!cookie.startsWith(ACCOUNT_COOKIE + '=')) continue;
      if (!input.remember) cookie = cookie.replace(/;\s*(?:Max-Age|Expires)=[^;]+/gi, '');
      response.headers.append('Set-Cookie', cookie);
    }
    return response;
  } catch (error) {
    if (error instanceof LimitError) return json({ error: 'Aguarde antes de tentar novamente.' }, error.status, { 'Retry-After': String(error.retryAfter) });
    return json({ error: 'Acesso indisponível. Confira a configuração com o responsável.' }, 503);
  }
}
