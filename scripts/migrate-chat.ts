import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { chatDatabaseConfig } from '../src/lib/server/chat-store';

try {
  const { url, environment } = chatDatabaseConfig();
  const sql = neon(url, { fetchOptions: { signal: AbortSignal.timeout(30000) } });
  const migration = await readFile(new URL('../migrations/001-chat.sql', import.meta.url), 'utf8');
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(148296241, 2)`,
    ...migration.split(/\r?\n-- statement\r?\n/).map(statement => sql.query(statement)),
    sql`INSERT INTO blueprint_chat_environment (singleton, environment, schema_version) VALUES (true, ${environment}, 1) ON CONFLICT (singleton) DO NOTHING`,
    sql`SELECT blueprint_chat_assert_environment(${environment})`,
  ]);
  const rows = await sql`SELECT environment, schema_version FROM blueprint_chat_environment`;
  if (rows.length !== 1 || rows[0].environment !== environment || rows[0].schema_version !== 1) throw new Error('Verification failed');
  console.log(`Chat schema v1 verified for ${environment}.`);
} catch {
  console.error('Chat migration failed. Check DATABASE_URL, CHAT_ENVIRONMENT, permissions and the target database. No credential or raw provider error was logged.');
  process.exitCode = 1;
}
