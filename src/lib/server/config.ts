import 'server-only';
import { z } from 'zod';

const secureUrl = (protocol: string) => z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === protocol && !url.username && !url.password && !url.search && !url.hash;
});
const schema = z.object({
  ROOM_PASSWORD: z.string().min(16).max(256),
  SESSION_SECRET: z.string().min(32).max(256),
  LIVEKIT_URL: secureUrl('wss:').refine(value => new URL(value).hostname.endsWith('.livekit.cloud')),
  LIVEKIT_API_KEY: z.string().min(8),
  LIVEKIT_API_SECRET: z.string().min(24),
  LIVEKIT_ROOM_NAME: z.string().regex(/^[a-z0-9-]{3,64}$/),
  UPSTASH_REDIS_REST_URL: secureUrl('https:'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(16),
  APP_ORIGIN: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === value && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
  }),
});
export type Config = z.infer<typeof schema>;
export function configuration(env: Record<string, string | undefined> = process.env) {
  const values = { ...env };
  for (const key of Object.keys(schema.shape)) {
    if (/replace-with|your-project|your-database/.test(values[key] ?? '')) values[key] = '';
  }
  return schema.safeParse(values);
}
export function getConfig(): Config {
  const result = configuration();
  if (!result.success) throw new Error('Configuration required');
  return result.data;
}

export function allowedOrigins(config: Config) {
  const origins = [config.APP_ORIGIN];
  // These values are supplied by Vercel, never by request headers.
  if (process.env.VERCEL === '1') {
    for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
      if (host && /^[a-z0-9-]+\.vercel\.app$/i.test(host)) origins.push(`https://${host}`);
    }
  }
  return origins;
}
