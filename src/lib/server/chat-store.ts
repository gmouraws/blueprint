import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { Session } from './session';
import { CHAT_PAGE_SIZE, type ChatMessage, type ChatPage, type ChatDeletion } from '../chat';

export function chatDatabaseConfig(env: Record<string, string | undefined> = process.env) {
  const environment = env.VERCEL === '1' ? env.VERCEL_ENV : env.CHAT_ENVIRONMENT;
  if (!environment || !['development', 'preview', 'production'].includes(environment)) throw new Error('Chat environment required');
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { throw new Error('Chat database required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password || !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) throw new Error('Invalid chat database configuration');
  return { url: url.toString(), environment };
}
type Row = { id: string; channel: 'geral'; sender_id: string; user_id?: string; display_name: string; body: string; created_at: string; attachment_id?: string; width?: number; height?: number };
function message(row: Row, identity: string): ChatMessage {
  return { id: String(row.id), channel: row.channel, senderId: row.sender_id, name: row.display_name, body: row.body, createdAt: new Date(row.created_at).toISOString(), own: row.user_id === identity, userId: row.user_id ?? null, ...(row.attachment_id ? { image: { id: row.attachment_id, width: row.width!, height: row.height! } } : {}) };
}
export function database() {
  const config = chatDatabaseConfig();
  return { environment: config.environment, sql: neon(config.url, { fetchOptions: { signal: AbortSignal.timeout(10000) } }) };
}
export type HistoryQuery = { before?: string; after?: string; changesAfter?: string };
export class ChatConflict extends Error {}
export class ChatUnavailable extends Error {}
export async function readChat(session: Session, query: HistoryQuery): Promise<ChatPage> {
  const { sql, environment } = database();
  const selection = query.after
    ? sql`SELECT m.*, a.width, a.height FROM blueprint_chat_messages m LEFT JOIN blueprint_chat_attachments a ON a.id = m.attachment_id WHERE m.deleted_at IS NULL AND m.created_at > now() - interval '30 days' AND m.id > ${query.after}::bigint ORDER BY m.id ASC LIMIT ${CHAT_PAGE_SIZE + 1}`
    : query.before
      ? sql`SELECT m.*, a.width, a.height FROM blueprint_chat_messages m LEFT JOIN blueprint_chat_attachments a ON a.id = m.attachment_id WHERE m.deleted_at IS NULL AND m.created_at > now() - interval '30 days' AND m.id < ${query.before}::bigint ORDER BY m.id DESC LIMIT ${CHAT_PAGE_SIZE + 1}`
      : sql`SELECT m.*, a.width, a.height FROM blueprint_chat_messages m LEFT JOIN blueprint_chat_attachments a ON a.id = m.attachment_id WHERE m.deleted_at IS NULL AND m.created_at > now() - interval '30 days' ORDER BY m.id DESC LIMIT ${CHAT_PAGE_SIZE + 1}`;
  const [, rows, changes, latest] = await sql.transaction([
    sql`SELECT blueprint_chat_assert_environment(${environment})`, selection,
    sql`SELECT id, message_id, kind FROM blueprint_chat_deletions WHERE id > ${query.changesAfter ?? '9223372036854775807'}::bigint ORDER BY id LIMIT ${CHAT_PAGE_SIZE + 1}`,
    sql`SELECT COALESCE(MAX(id),0)::text AS cursor FROM blueprint_chat_deletions`,
  ], { readOnly: true, isolationLevel: 'RepeatableRead' });
  const page = (rows as Row[]).slice(0, CHAT_PAGE_SIZE);
  if (!query.after) page.reverse();
  const mutations = changes.slice(0, CHAT_PAGE_SIZE);
  return { messages: page.map(row => message(row, session.identity)), hasMore: rows.length > CHAT_PAGE_SIZE, serverTime: new Date().toISOString(),
    changes: { cursor: String(mutations.at(-1)?.id ?? query.changesAfter ?? latest[0].cursor), items: mutations.map(row => ({ id: String(row.message_id), kind: row.kind as ChatDeletion['kind'] })), hasMore: changes.length > CHAT_PAGE_SIZE } };
}
export async function deleteChat(session: Session, id: string, target: ChatDeletion['kind']) {
  const { sql, environment } = database();
  let kind: ChatDeletion['kind'];
  try {
    const rows = await sql`SELECT blueprint_chat_delete(${environment}, ${session.identity}::uuid, ${id}::bigint, ${target}) AS kind`;
    kind = rows[0].kind;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P0003') throw new ChatUnavailable();
    throw new Error('Deletion unavailable');
  }
  // Access is already revoked transactionally. Blob failures never undo deletion.
  let cleanupPending = false;
  try { const { cleanImages } = await import('./image-store'); await cleanImages(); } catch { cleanupPending = true; }
  return { change: { id, kind }, cleanupPending };
}
export async function saveChat(session: Session, body: string, requestId: string, imageId?: string): Promise<ChatMessage> {
  const { sql, environment } = database();
  try {
    const rows = await sql`SELECT m.*, a.width, a.height FROM blueprint_chat_put_image(${environment}, ${session.identity}::uuid, ${session.nickname}, ${body}, ${requestId}::uuid, ${imageId ?? null}::uuid) m LEFT JOIN blueprint_chat_attachments a ON a.id = m.attachment_id`;
    return message(rows[0] as Row, session.identity);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P0002') throw new ChatConflict();
    throw new Error('Chat storage unavailable');
  }
}
export async function cleanChat() {
  const { sql, environment } = database();
  const { cleanImages } = await import('./image-store');
  await cleanImages();
  const { cleanAvatars } = await import('./avatar');
  const { cleanRevokedMedia } = await import('./account-media');
  await cleanAvatars(); await cleanRevokedMedia();
  await sql.transaction([sql`SELECT blueprint_chat_assert_environment(${environment})`, sql`DELETE FROM blueprint_chat_messages WHERE created_at <= now() - interval '30 days' AND attachment_id IS NULL`, sql`DELETE FROM blueprint_chat_deletions WHERE created_at <= now() - interval '30 days'`]);
}
