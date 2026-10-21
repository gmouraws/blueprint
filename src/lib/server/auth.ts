import 'server-only';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { createHmac } from 'node:crypto';
import { accountPool, accountTransaction } from './account-db';
import { allowedOrigins, getConfig } from './config';
import { validNickname } from '../room';

export const ACCOUNT_COOKIE = 'blueprint-account.session_token';
export const SESSION_SECONDS = 12 * 60 * 60;
export const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;
export async function eligibleEmail(email: string) {
  return accountTransaction(async db => {
    const member = await db.query('SELECT status FROM blueprint_user WHERE email = $1', [email]);
    if (member.rows.length) return member.rows[0].status === 'active';
    const invitation = await db.query('SELECT 1 FROM blueprint_invitation WHERE email = $1 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now()', [email]);
    return invitation.rows.length > 0;
  });
}
export function createAuth(remember = false) {
  const config = getConfig();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM) throw new Error('Account configuration required');
  return betterAuth({
    appName: 'Blueprint Room', baseURL: config.APP_ORIGIN, secret,
    database: accountPool(), trustedOrigins: allowedOrigins(config),
    user: { modelName: 'blueprint_user' }, account: { modelName: 'blueprint_account' },
    verification: { modelName: 'blueprint_verification' },
    session: { modelName: 'blueprint_session', expiresIn: remember ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS, disableSessionRefresh: true, cookieCache: { enabled: false } },
    advanced: { database: { generateId: 'uuid' }, useSecureCookies: false,
      cookies: { session_token: { name: ACCOUNT_COOKIE } },
      defaultCookieAttributes: { httpOnly: true, secure: config.APP_ORIGIN.startsWith('https:') || process.env.VERCEL === '1', sameSite: 'strict', path: '/' } },
    emailAndPassword: { enabled: false },
    // Only the bounded application endpoints expose this server-side API.
    rateLimit: { enabled: false }, logger: { disabled: true },
    databaseHooks: {
      user: { create: { before: async user => {
        if (!validNickname(user.name) || !await eligibleEmail(user.email.toLowerCase())) throw new APIError('UNAUTHORIZED', { message: 'Access unavailable' });
        return { data: { ...user, email: user.email.toLowerCase(), image: null } };
      } } },
      session: {
        create: { before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }) },
        // Retain expired rows until associated media has been revoked. The
        // application resolver still rejects them; cleanup owns physical deletion.
        delete: { before: async () => false },
      },
    },
    plugins: [emailOTP({ otpLength: 6, expiresIn: 300, allowedAttempts: 3,
      storeOTP: { hash: async otp => createHmac('sha256', secret).update(otp).digest('hex') },
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'sign-in' || !await eligibleEmail(email)) return;
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.RESEND_FROM, to: [email], subject: 'Seu código do Blueprint Room', text: `Seu código é ${otp}. Ele expira em 5 minutos. Se você não solicitou, ignore esta mensagem.` }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Email unavailable');
      },
    })],
  });
}
