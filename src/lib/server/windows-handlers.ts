import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { distributionService, downloadRecipients, installer, installerAvailable, privateInstaller, registeredRecipient } from './windows-distribution';
const input = z.discriminatedUnion('action', [z.object({ action: z.literal('issue'), recipient: z.uuid(), send: z.boolean().default(false) }).strict(), z.object({ action: z.literal('revoke'), id: z.uuid() }).strict()]);
export const windowsServices = { getConfig, verifySession, rateLimit, distributionService, downloadRecipients, registeredRecipient, installerAvailable, privateInstaller, fetch: globalThis.fetch };
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
export async function windowsHandler(request: NextRequest, management = false, deps = windowsServices) {
  try {
    const config = deps.getConfig(); const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || ((request.method !== 'GET' || origin) && !allowedOrigins(config).includes(origin ?? ''))) return json({ error: 'Origem não permitida.' }, 403, headers);
    const session = await deps.verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
    if (!session) return json({ error: 'Entre com sua conta autorizada.' }, 401, headers);
    if (management && session.role !== 'owner') return json({ error: 'Acesso restrito ao responsável.' }, 403, headers);
    if (!await deps.registeredRecipient(session.identity)) return json({ error: 'Acesso não autorizado.' }, 403, headers);
    await deps.rateLimit(config, 'windows-download', session.identity);
    const service = deps.distributionService();
    if (management) {
      if (request.method === 'GET') return json({ installer, available: await deps.installerAvailable(), recipients: await deps.downloadRecipients(), links: (await service.list()).map(({ id, recipient, expires, state }) => ({ id, recipient, expires, state: expires <= Date.now() ? 'expired' : state })) }, 200, headers);
      const parsed = input.safeParse(await readBody(request).catch(() => null));
      if (!parsed.success) return json({ error: 'Solicitação inválida.' }, 400, headers);
      if (parsed.data.action === 'revoke') return json({ revoked: await service.revoke(parsed.data.id) }, 200, headers);
      const recipient = await deps.registeredRecipient(parsed.data.recipient);
      if (!recipient) return json({ error: 'Destinatário não autorizado.' }, 403, headers);
      if (!await deps.installerAvailable()) return json({ error: 'Instalador privado indisponível.' }, 503, headers);
      const link = await service.issue(recipient.id); const url = `${config.APP_ORIGIN}/download#access=${link.token}`;
      let emailAccepted: boolean | undefined;
      if (parsed.data.send) {
        emailAccepted = false;
        if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
          try { const result = await deps.fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.RESEND_FROM, to: [recipient.email], subject: 'Your Blueprint Room for Windows download', text: `Your private Blueprint Room for Windows download is ready.\n\nSign in with your authorized account, then use the secure link below to download version 0.1.7.\n\n${url}\n\nThis link expires in 24 hours and can only be used once.\n\nIf you did not request this download, you can ignore this email.` }) }); emailAccepted = result.ok; } catch { /* Never log recipients or bearer links. */ }
        }
      }
      return json({ id: link.id, url, expires: link.expires, emailAccepted }, 200, headers);
    }
    const parsed = z.object({ credential: z.string().max(100) }).strict().safeParse(await readBody(request).catch(() => null));
    if (!parsed.success) return json({ error: 'Link inválido ou indisponível.' }, 410, headers);
    const row = await service.inspect(parsed.data.credential, session.identity);
    if (!row) return json({ error: 'Link inválido, expirado, revogado ou já utilizado.' }, 410, headers);
    const stream = await deps.privateInstaller();
    let claimed: boolean;
    try { claimed = await service.claim(row); } catch (error) { await stream.cancel(); throw error; }
    if (!claimed) { await stream.cancel(); return json({ error: 'Link já utilizado ou indisponível.' }, 410, headers); }
    return new Response(stream, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${installer.filename}"` } });
  } catch (error) {
    if (error instanceof LimitError) return json({ error: 'Aguarde antes de tentar novamente.' }, error.status, { ...headers, 'Retry-After': String(error.retryAfter) });
    return json({ error: 'Distribuição privada indisponível. Consulte o responsável.' }, 503, headers);
  }
}
