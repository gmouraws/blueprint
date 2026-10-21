import 'server-only';
export function discordTarget(env: Record<string, string | undefined> = process.env) {
  if (env.DISCORD_STREAM_ANNOUNCEMENTS_ENABLED !== 'true') return null;
  try { const url = new URL(env.DISCORD_STREAM_WEBHOOK_URL ?? ''); return url.protocol === 'https:' && url.hostname === 'discord.com' && /^\/api(?:\/v10)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash ? url.href : null; } catch { return null; }
}
export function invitationUrl(origin: string, secret: string, role: 'share' | 'watch') { return `${origin}/stream?intent=${role}#invite=${secret}`; }
