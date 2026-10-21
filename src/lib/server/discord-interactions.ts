import 'server-only';
import { createPublicKey, verify } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { getConfig, type Config } from './config';
import { rateLimit } from './rate-limit';
import { streamService } from './stream-space';
import { invitationUrl } from './stream-handlers';

const snowflake = z.string().regex(/^\d{17,20}$/);
const command = z.object({ id: snowflake, application_id: snowflake, type: z.literal(2), guild_id: snowflake, channel_id: snowflake, token: z.string().regex(/^[A-Za-z0-9_.-]{10,512}$/), member: z.object({ user: z.object({ id: snowflake }) }), data: z.object({ name: z.literal('blueprint'), type: z.literal(1) }) });
const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const response = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export function discordConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const application = snowflake.safeParse(env.DISCORD_APPLICATION_ID);
  const publicKey = /^[a-fA-F0-9]{64}$/.test(env.DISCORD_PUBLIC_KEY ?? '') ? env.DISCORD_PUBLIC_KEY! : null;
  const guild = snowflake.safeParse(env.DISCORD_GUILD_ID);
  const channels = (env.DISCORD_ALLOWED_CHANNEL_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  return { application: application.success ? application.data : null, publicKey, guild: guild.success ? guild.data : null, channels: channels.length > 0 && channels.length <= 20 && channels.every(value => snowflake.safeParse(value).success) ? channels : [] };
}
async function rawBody(request: Request) {
  if (Number(request.headers.get('content-length')) > 65536 || !request.body) throw Error('Body limit');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0, expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel(); }, 1000);
  try { while (true) { const { value, done } = await reader.read(); if (expired) throw Error('Body timeout'); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw Error('Body limit'); } chunks.push(value); } return Buffer.concat(chunks); }
  finally { clearTimeout(timeout); reader.releaseLock(); }
}
export function verifyDiscordSignature(raw: Buffer, timestamp: string | null, signature: string | null, publicKey: string, now = Date.now()) {
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^[a-fA-F0-9]{128}$/.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), type: 'spki', format: 'der' });
    return verify(null, Buffer.concat([Buffer.from(timestamp), raw]), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}
async function claim(config: Config, id: string) {
  const redis = new Redis({ url: config.UPSTASH_REDIS_REST_URL, token: config.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 }, signal: () => AbortSignal.timeout(2000) });
  return await redis.set(`blueprint:${config.LIVEKIT_ROOM_NAME}:discord:interaction:${id}`, 'claimed', { nx: true, ex: 600 }) === 'OK';
}
export const discordServices = { getConfig, rateLimit, streamService, claim, fetch: globalThis.fetch, env: () => process.env, now: Date.now };
export async function discordHandler(request: Request, schedule: (work: () => Promise<void>) => void, deps = discordServices) {
  const config = discordConfiguration(deps.env());
  if (!config.publicKey || !config.application) return response({ error: 'Discord configuration unavailable' }, 503);
  let raw: Buffer;
  try { raw = await rawBody(request); } catch { return response({ error: 'Invalid request' }, 400); }
  if (!verifyDiscordSignature(raw, request.headers.get('x-signature-timestamp'), request.headers.get('x-signature-ed25519'), config.publicKey, deps.now())) return response({ error: 'Invalid signature' }, 401);
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { return response({ error: 'Invalid request' }, 400); }
  if (payload?.type === 1 && (!payload.application_id || payload.application_id === config.application)) return response({ type: 1 });
  const parsed = command.safeParse(payload);
  if (!parsed.success || parsed.data.application_id !== config.application) return response(ephemeral('Comando indisponível.'));
  const interaction = parsed.data;
  if (!config.guild || !config.channels.length) return response(ephemeral('Blueprint ainda não está configurado para este servidor.'));
  if (interaction.guild_id !== config.guild || !config.channels.includes(interaction.channel_id)) return response(ephemeral('Este comando não está disponível neste canal.'));
  // Acknowledge before any Redis/provider access. Next.js after() keeps this bounded work alive.
  schedule(async () => {
    let content = 'Transmissão indisponível. Peça ao responsável para configurar ou renovar o link.';
    let components: object[] = [];
    try {
      const runtime = deps.getConfig();
      await deps.rateLimit(runtime, 'discord-command', `${interaction.guild_id}:${interaction.member.user.id}`);
      if (!await deps.claim(runtime, interaction.id)) return;
      const links = await deps.streamService(runtime).configuredLinks();
      if (links && runtime.APP_ORIGIN.startsWith('https://')) {
        content = 'Escolha como abrir o espaço no navegador. O link é privado: quem o receber terá acesso. A captura só começa após sua confirmação.';
        components = [{ type: 1, components: [{ type: 2, style: 5, label: 'Transmitir', url: invitationUrl(runtime.APP_ORIGIN, links.share, 'share') }, { type: 2, style: 5, label: 'Assistir', url: invitationUrl(runtime.APP_ORIGIN, links.watch, 'watch') }] }];
      }
    } catch { content = 'Transmissão indisponível ou limite temporário atingido. Tente novamente em instantes.'; }
    try {
      const result = await deps.fetch(`https://discord.com/api/v10/webhooks/${config.application}/${interaction.token}/messages/@original`, { method: 'PATCH', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, components, allowed_mentions: { parse: [] } }) });
      if (!result.ok) console.warn('discord_interaction_response_failed');
    } catch { console.warn('discord_interaction_response_failed'); }
  });
  return response({ type: 5, data: { flags: 64 } });
}
