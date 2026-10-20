import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { Session } from './session';
import { CHAT_PAGE_SIZE, type ChatMessage, type ChatPage } from '../chat';

export function chatDatabaseConfig(env: Record<string, string | undefined> = process.env) {
  const environment = env.VERCEL === '1' ? env.VERCEL_ENV : env.CHAT_ENVIRONMENT;
  if (!environment || !['development', 'preview', 'production'].includes(environment)) throw new Error('Chat environment required');
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { throw new Error('Chat database required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password || !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) throw new Error('Invalid chat database configuration');
  return { url: url.toString(), environment };
}
type Row = { id: string; channel: 'geral'; sender_id: string; display_name: string; body: string; created_at: string };
function message(row: Row, identity: string): ChatMessage {
  return { id: String(row.id), channel: row.channel, senderId: row.sender_id, name: row.display_name, body: row.body, createdAt: new Date(row.created_at).toISOString(), own: row.sender_id === identity };
}
function database() {
  const config = chatDatabaseConfig();
  return { environment: config.environment, sql: neon(config.url, { fetchOptions: { signal: AbortSignal.timeout(10000) } }) };
}
export type HistoryQuery = { before?: string; after?: string };
export class ChatConflict extends Error {}
export async function readChat(session: Session, query: HistoryQuery): Promise<ChatPage> {
  const { sql, environment } = database();
  const selection = query.after
    ? sql`SELECT * FROM blueprint_chat_messages WHERE created_at > now() - interval '30 days' AND id > ${query.after}::bigint ORDER BY id ASC LIMIT ${CHAT_PAGE_SIZE + 1}`
    : query.before
      ? sql`SELECT * FROM blueprint_chat_messages WHERE created_at > now() - interval '30 days' AND id < ${query.before}::bigint ORDER BY id DESC LIMIT ${CHAT_PAGE_SIZE + 1}`
      : sql`SELECT * FROM blueprint_chat_messages WHERE created_at > now() - interval '30 days' ORDER BY id DESC LIMIT ${CHAT_PAGE_SIZE + 1}`;
  const [, rows] = await sql.transaction([sql`SELECT blueprint_chat_assert_environment(${environment})`, selection], { readOnly: true });
  const page = (rows as Row[]).slice(0, CHAT_PAGE_SIZE);
  if (!query.after) page.reverse();
  return { messages: page.map(row => message(row, session.identity)), hasMore: rows.length > CHAT_PAGE_SIZE, serverTime: new Date().toISOString() };
}
export async function saveChat(session: Session, body: string, requestId: string): Promise<ChatMessage> {
  const { sql, environment } = database();
  try {
    const rows = await sql`SELECT * FROM blueprint_chat_put(${environment}, ${session.identity}::uuid, ${session.nickname}, ${body}, ${requestId}::uuid)`;
    return message(rows[0] as Row, session.identity);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P0002') throw new ChatConflict();
    throw new Error('Chat storage unavailable');
  }
}
export async function cleanChat() {
  const { sql, environment } = database();
  await sql.transaction([sql`SELECT blueprint_chat_assert_environment(${environment})`, sql`DELETE FROM blueprint_chat_messages WHERE created_at <= now() - interval '30 days'`]);
}
