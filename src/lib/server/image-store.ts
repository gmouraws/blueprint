import 'server-only';
import { randomUUID } from 'node:crypto';
import { get, put, head, del, BlobNotFoundError } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { database } from './chat-store';
import type { Session } from './session';
import { MAX_IMAGE_BYTES, type ChatImage } from '../images';
import { boundedImage, InvalidImage, normalizeImage } from './image-validation';
import { drainImageCleanup } from './image-cleanup';

type Attachment = { id: string; sender_id: string; request_id: string; state: string; content_type: string; original_size: number; width: number; height: number; size: number };
export class ImageUnavailable extends Error {}
function storage(environment: string) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || token.includes('replace-with') || process.env.BLOB_ENVIRONMENT !== environment) throw new ImageUnavailable();
  return { token, abortSignal: AbortSignal.timeout(20000) };
}
export const imageKeys = (environment: string, id: string) => ({ raw: environment + '/' + id + '/upload', image: environment + '/' + id + '/image.webp' });
const metadata = (row: Attachment): ChatImage => ({ id: row.id, width: row.width, height: row.height });
export async function prepareImage(session: Session, input: { requestId: string; contentType: string; size: number }) {
  const { sql, environment } = database(); const options = storage(environment);
  const [, rows] = await sql.transaction([
    sql`SELECT blueprint_chat_assert_environment(${environment})`,
    sql`INSERT INTO blueprint_chat_attachments(id,sender_id,request_id,content_type,original_size)
      VALUES(${randomUUID()},${session.identity},${input.requestId},${input.contentType},${input.size})
      ON CONFLICT(sender_id,request_id) DO UPDATE SET request_id = excluded.request_id
      RETURNING *, created_at > now() - interval '55 minutes' AS usable`,
  ]);
  const row = rows[0] as Attachment & { usable: boolean };
  if (!row.usable || row.content_type !== input.contentType || row.original_size !== input.size || ['deleting','attached'].includes(row.state)) throw new InvalidImage();
  if (row.state === 'ready') return { id: row.id, ready: true, image: metadata(row) };
  const pathname = imageKeys(environment, row.id).raw;
  let exists = false;
  try { await head(pathname, options); exists = true; } catch (error) { if (!(error instanceof BlobNotFoundError)) throw error; }
  const token = exists ? undefined : await generateClientTokenFromReadWriteToken({
    ...options, pathname, maximumSizeInBytes: MAX_IMAGE_BYTES, allowedContentTypes: [row.content_type],
    addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 5 * 60 * 1000,
  });
  return { id: row.id, pathname, token, ready: false };
}
export async function completeImage(session: Session, id: string) {
  const { sql, environment } = database(); const options = storage(environment);
  const [, rows] = await sql.transaction([
    sql`SELECT blueprint_chat_assert_environment(${environment})`,
    sql`SELECT * FROM blueprint_chat_attachments WHERE id = ${id} AND sender_id = ${session.identity} AND user_id = ${session.identity} AND created_at > now() - interval '1 hour'`,
  ]);
  const row = rows[0] as Attachment | undefined;
  if (!row || ['deleting','attached'].includes(row.state)) throw new InvalidImage();
  if (row.state === 'ready') return metadata(row);
  const claimed = await sql`UPDATE blueprint_chat_attachments SET state = 'validating', validation_started = now()
    WHERE id = ${id} AND (state = 'pending' OR (state = 'validating' AND validation_started < now() - interval '2 minutes')) RETURNING id`;
  if (!claimed.length) throw new ImageUnavailable();
  const keys = imageKeys(environment, id);
  try {
    const blob = await get(keys.raw, { ...options, access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200 || blob.blob.size !== row.original_size || blob.blob.size > MAX_IMAGE_BYTES) throw new InvalidImage();
    const image = await normalizeImage(await boundedImage(blob.stream), row.content_type);
    await put(keys.image, image.bytes, { ...options, access: 'private', contentType: 'image/webp', addRandomSuffix: false, allowOverwrite: true });
    await sql`UPDATE blueprint_chat_attachments SET state = 'ready', width = ${image.width}, height = ${image.height}, size = ${image.size} WHERE id = ${id} AND state = 'validating'`;
    return { id, width: image.width, height: image.height };
  } catch (error) {
    await sql`UPDATE blueprint_chat_attachments SET state = ${error instanceof InvalidImage ? 'deleting' : 'pending'} WHERE id = ${id} AND state = 'validating'`;
    throw error;
  }
}
export async function downloadImage(id: string) {
  const { sql, environment } = database(); const options = storage(environment);
  const [, rows] = await sql.transaction([
    sql`SELECT blueprint_chat_assert_environment(${environment})`,
    sql`SELECT a.id FROM blueprint_chat_attachments a JOIN blueprint_chat_messages m ON m.attachment_id = a.id
      WHERE a.id = ${id} AND a.state = 'attached' AND m.deleted_at IS NULL AND m.created_at > now() - interval '30 days'`,
  ], { readOnly: true });
  if (!rows.length) return null;
  return get(imageKeys(environment, id).image, { ...options, access: 'private', useCache: false });
}
export async function cleanImages() {
  const { sql, environment } = database();
  const [, rows] = await sql.transaction([
    sql`SELECT blueprint_chat_assert_environment(${environment})`,
    sql`UPDATE blueprint_chat_attachments a SET state = 'deleting' WHERE a.id IN (
      SELECT x.id FROM blueprint_chat_attachments x LEFT JOIN blueprint_chat_messages m ON m.attachment_id = x.id
      WHERE x.state = 'deleting' OR (m.id IS NULL AND x.created_at <= now() - interval '1 hour' AND (x.state <> 'validating' OR x.validation_started < now() - interval '2 minutes')) OR m.created_at <= now() - interval '30 days'
      ORDER BY x.created_at LIMIT 100 FOR UPDATE OF x SKIP LOCKED) RETURNING a.id`,
  ]);
  if (!rows.length) return;
  const options = storage(environment);
  await drainImageCleanup(rows.map(row => String(row.id)), async id => {
    const keys = imageKeys(environment, id);
    // Keep metadata on deletion failure, including failures after a partial deletion.
    await del([keys.raw, keys.image], options);
  }, async id => {
    await sql.transaction([
      sql`DELETE FROM blueprint_chat_messages WHERE attachment_id = ${id} AND created_at <= now() - interval '30 days'`,
      // A previously issued upload token can live until created_at + 1 hour.
      // Retain its cleanup marker through that window so replayed raw uploads
      // are removed on a later pass. Access stays revoked throughout.
      sql`DELETE FROM blueprint_chat_attachments WHERE id = ${id} AND state = 'deleting' AND created_at <= now() - interval '1 hour'`,
    ]);
  });
}
