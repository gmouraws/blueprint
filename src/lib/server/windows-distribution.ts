import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { get, head } from '@vercel/blob';
import { accountTransaction } from './account-db';
import { getConfig } from './config';
export const installer = { version: '0.1.7', filename: 'Blueprint-Room-production-0.1.7-x64-setup.exe', size: 112192552, sha256: '32adea296dcabec2fe0b0bc3a726f51889ada17364b8afac01b91332853daadf' };
const etag = '7dd0abf7a733a53b845e8403842d3626-14';
const lifetime = 24 * 3600000;
export type DownloadRecord = { id: string; hash: string; recipient: string; expires: number; state: 'unused' | 'claimed' | 'revoked' };
export type DownloadStore = { create: (row: DownloadRecord) => Promise<void>; read: (id: string) => Promise<DownloadRecord | null>; list: () => Promise<DownloadRecord[]>; transition: (id: string, hash: string, recipient: string, now: number, state: 'claimed' | 'revoked') => Promise<boolean> };
export const downloadTransition = `local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local row=cjson.decode(raw); if row.state~='unused' or row.hash~=ARGV[1] or row.recipient~=ARGV[2] or row.expires<=tonumber(ARGV[3]) then return 0 end; row.state=ARGV[4]; redis.call('SET',KEYS[1],cjson.encode(row),'KEEPTTL'); return 1`;
export function downloadStore(): DownloadStore {
  const c = getConfig(); const redis = new Redis({ url: c.UPSTASH_REDIS_REST_URL, token: c.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 }, signal: () => AbortSignal.timeout(5000) });
  const prefix = `blueprint:${c.LIVEKIT_ROOM_NAME}:windows-download:`;
  return {
    async create(row) { if (await redis.set(prefix + row.id, row, { nx: true, ex: 48 * 3600 }) !== 'OK') throw Error('Download unavailable'); await redis.zadd(prefix + 'index', { score: row.expires, member: row.id }); await redis.zremrangebyscore(prefix + 'index', '-inf', Date.now() - lifetime); },
    read: id => redis.get<DownloadRecord>(prefix + id),
    async list() { const ids = await redis.zrange<string[]>(prefix + 'index', 0, 99, { rev: true }); if (!ids.length) return []; return (await redis.mget<(DownloadRecord | null)[]>(...ids.map(id => prefix + id))).filter((row): row is DownloadRecord => !!row); },
    async transition(id, hash, recipient, now, state) { return await redis.eval(downloadTransition, [prefix + id], [hash, recipient, String(now), state]) === 1; },
  };
}
export async function downloadRecipients() {
  return accountTransaction(async db => (await db.query(`SELECT id, email FROM blueprint_user WHERE status='active' AND "emailVerified"=true AND role IN ('owner','member') ORDER BY email`)).rows as { id: string; email: string }[]);
}
export async function registeredRecipient(id: string) {
  return accountTransaction(async db => (await db.query(`SELECT id, email FROM blueprint_user WHERE id=$1 AND status='active' AND "emailVerified"=true AND role IN ('owner','member')`, [id])).rows[0] as { id: string; email: string } | undefined);
}
function storage() {
  const environment = process.env.VERCEL === '1' ? process.env.VERCEL_ENV : process.env.CHAT_ENVIRONMENT;
  if (!environment || process.env.BLOB_ENVIRONMENT !== environment || !process.env.BLOB_READ_WRITE_TOKEN) throw Error('Private installer unavailable');
  return { pathname: `${environment}/${installer.filename}`, token: process.env.BLOB_READ_WRITE_TOKEN };
}
export async function privateInstaller() {
  const { pathname, token } = storage(); const blob = await get(pathname, { token, access: 'private', useCache: false });
  if (!blob || blob.statusCode !== 200 || !new URL(blob.blob.url).hostname.endsWith('.private.blob.vercel-storage.com') || blob.blob.size !== installer.size || blob.blob.etag.replaceAll('"', '') !== etag) { if (blob?.stream) await blob.stream.cancel(); throw Error('Private installer unavailable'); }
  return blob.stream;
}
export async function installerAvailable() {
  try { const { pathname, token } = storage(); const blob = await head(pathname, { token, abortSignal: AbortSignal.timeout(10000) }); return new URL(blob.url).hostname.endsWith('.private.blob.vercel-storage.com') && blob.size === installer.size && blob.etag.replaceAll('"', '') === etag; } catch { return false; }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validDownloadCredential = (value: string) => /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value);
export function distributionService(store = downloadStore(), now = Date.now) {
  return {
    async issue(recipient: string) { const token = `${randomUUID()}.${randomBytes(32).toString('base64url')}`; const row: DownloadRecord = { id: token.split('.')[0], hash: digest(token), recipient, expires: now() + lifetime, state: 'unused' }; await store.create(row); return { id: row.id, token, expires: row.expires }; },
    list: () => store.list(),
    async revoke(id: string) { const row = await store.read(id); return !!row && store.transition(id, row.hash, row.recipient, now(), 'revoked'); },
    async inspect(token: string, recipient: string) { if (!validDownloadCredential(token)) return null; const row = await store.read(token.split('.')[0]); return row && row.recipient === recipient && row.state === 'unused' && row.expires > now() && /^[a-f0-9]{64}$/.test(row.hash) && timingSafeEqual(Buffer.from(row.hash), Buffer.from(digest(token))) ? row : null; },
    claim: (row: DownloadRecord) => store.transition(row.id, row.hash, row.recipient, now(), 'claimed'),
  };
}
