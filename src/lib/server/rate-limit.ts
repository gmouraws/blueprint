import 'server-only';
import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import type { Config } from './config';

export class LimitError extends Error { constructor(public status: number, public retryAfter = 60) { super('Rate limit'); } }
export function enforceLimitResults(results: { success: boolean; reset: number; reason?: string }[]) {
  if (results.some(result => result.reason === 'timeout')) throw new LimitError(503);
  const denied = results.find(result => !result.success);
  if (denied) throw new LimitError(429, Math.max(1, Math.ceil((denied.reset - Date.now()) / 1000)));
}
export async function rateLimit(config: Config, kind: 'login' | 'token', identifier: string) {
  const redis = new Redis({ url: config.UPSTASH_REDIS_REST_URL, token: config.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 } });
  const hashed = createHmac('sha256', config.SESSION_SECRET).update(identifier).digest('hex');
  const prefix = `blueprint:${config.LIVEKIT_ROOM_NAME}:${kind}`;
  const options = { redis, analytics: false, timeout: 3000, ephemeralCache: false as const };
  try {
    const local = new Ratelimit({ ...options, prefix, limiter: kind === 'login' ? Ratelimit.slidingWindow(10, '10 m') : Ratelimit.slidingWindow(12, '1 m') });
    const checks = [local.limit(hashed)];
    if (kind === 'login') checks.push(new Ratelimit({ ...options, prefix: `${prefix}:global`, limiter: Ratelimit.slidingWindow(60, '10 m') }).limit('all'));
    const results = await Promise.all(checks);
    // The SDK normally fails open on timeout. Authentication must fail closed.
    enforceLimitResults(results);
  } catch (error) {
    if (error instanceof LimitError) throw error;
    throw new LimitError(503);
  }
}
