import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { get, put, del } from '@vercel/blob';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { accountTransaction } from './account-db';
import { chatDatabaseConfig } from './chat-store';
import { normalizeImage, InvalidImage } from './image-validation';
import { COOKIE_NAME, verifySession } from './session';
import { getConfig, allowedOrigins } from './config';
import { json } from './handlers';
import { lockMember } from './account-media';
import { rateLimit, LimitError } from './rate-limit';

export const avatarServices = { get, put, del, rateLimit };
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export async function normalizeAvatar(bytes: Buffer, type: string) {
  if (bytes.length > MAX_AVATAR_BYTES) throw new InvalidImage();
  const image = await normalizeImage(bytes, type);
  return sharp(image.bytes).resize(256,256,{ fit:'cover', withoutEnlargement:true }).webp({ quality:85 }).toBuffer();
}
function storage() {
  const { environment } = chatDatabaseConfig();
  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_ENVIRONMENT !== environment) throw new Error('Avatar storage unavailable');
  return { environment, token: process.env.BLOB_READ_WRITE_TOKEN, abortSignal: AbortSignal.timeout(20000) };
}
const key = (environment: string, id: string) => `${environment}/avatars/${id}.webp`;
export async function cleanAvatars() {
  const options = storage();
  const rows = await accountTransaction(async db => {
    await db.query("UPDATE blueprint_avatar SET state = 'deleting' WHERE state = 'pending' AND created_at < now() - interval '1 hour'");
    return (await db.query("SELECT id FROM blueprint_avatar WHERE state = 'deleting' LIMIT 100")).rows;
  });
  let cleanupPending = false;
  for (const row of rows) {
    try { await avatarServices.del(key(options.environment,row.id),options); await accountTransaction(db => db.query("DELETE FROM blueprint_avatar WHERE id = $1 AND state = 'deleting'",[row.id])); }
    catch { cleanupPending = true; }
  }
  return { cleanupPending: cleanupPending || rows.length === 100 };
}
export async function avatarHandler(request: NextRequest) {
  try {
    const config = getConfig(); const origin = request.headers.get('origin');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || ((request.method !== 'GET' || origin) && !allowedOrigins(config).includes(origin ?? ''))) return json({ error:'Origem não permitida.' },403);
    const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value,config);
    if (!session) return json({ error:'Sua sessão expirou. Entre novamente.' },401);
    await avatarServices.rateLimit(config,request.method === 'GET' ? 'image-read' : 'image-write', session.identity);
    const options = storage();
    if (request.method === 'GET') {
      const user = z.uuid().safeParse(request.nextUrl.searchParams.get('user'));
      if (!user.success) return new Response(null,{status:404});
      const rows = await accountTransaction(async db => (await db.query("SELECT avatar_id FROM blueprint_user WHERE id = $1 AND status = 'active'",[user.data])).rows);
      if (!rows[0]?.avatar_id) return new Response(null,{status:404});
      const blob = await avatarServices.get(key(options.environment,rows[0].avatar_id),{...options, access:'private',useCache:false});
      if (!blob || blob.statusCode !== 200) return new Response(null,{status:404});
      return new Response(blob.stream,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    let id: string | null = null;
    if (request.method === 'PUT') {
      const reader = request.body?.getReader(); if (!reader) throw new InvalidImage();
      const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > MAX_AVATAR_BYTES) { await reader.cancel(); throw new InvalidImage(); } chunks.push(next.value); } } finally { reader.releaseLock(); }
      const bytes = await normalizeAvatar(Buffer.concat(chunks),request.headers.get('content-type') ?? '');
      id = randomUUID();
      await accountTransaction(async db => { await lockMember(db,session); await db.query("INSERT INTO blueprint_avatar(id,user_id,state) VALUES($1,$2,'pending')",[id,session.identity]); });
      await avatarServices.put(key(options.environment,id),bytes,{...options,access:'private',contentType:'image/webp',addRandomSuffix:false,allowOverwrite:false});
    }
    await accountTransaction(async db => {
      await lockMember(db,session);
      await db.query("UPDATE blueprint_avatar SET state = 'deleting' WHERE id = (SELECT avatar_id FROM blueprint_user WHERE id = $1)",[session.identity]);
      if (id) await db.query("UPDATE blueprint_avatar SET state = 'active' WHERE id = $1 AND user_id = $2 AND state = 'pending'",[id,session.identity]);
      await db.query('UPDATE blueprint_user SET avatar_id = $1 WHERE id = $2',[id,session.identity]);
    });
    return json({ok:true,...await cleanAvatars()});
  } catch (error) {
    if (error instanceof InvalidImage) return json({error:'Use JPEG, PNG ou WebP válido de até 2 MB.'},400);
    if (error instanceof LimitError) return json({error:'Aguarde antes de tentar novamente.'},error.status);
    return json({error:'Não foi possível atualizar a foto. Tente novamente.'},503);
  }
}
