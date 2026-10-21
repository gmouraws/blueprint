import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { chatDatabaseConfig } from './chat-store';

let pool: Pool | undefined;
export function accountPool() {
  if (!pool) {
    pool = new Pool({ connectionString: chatDatabaseConfig().url, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
    pool.on('error', () => { /* Never emit provider credentials or idle-client errors to logs. */ });
  }
  return pool;
}
export async function accountTransaction<T>(work: (db: PoolClient) => Promise<T>) {
  const db = await accountPool().connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT blueprint_chat_assert_environment($1)', [chatDatabaseConfig().environment]);
    const result = await work(db);
    await db.query('COMMIT'); return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
