import { readFile } from 'node:fs/promises';
import { accountPool, accountTransaction } from '../src/lib/server/account-db';
import { chatDatabaseConfig } from '../src/lib/server/chat-store';
try {
  if (chatDatabaseConfig().environment === 'production') throw new Error('Production not authorized');
  const migration = await readFile(new URL('../migrations/004-accounts.sql',import.meta.url),'utf8');
  await accountTransaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(148296241,4)');
    await db.query(migration);
    await db.query('SELECT id FROM blueprint_user LIMIT 0');
  });
  console.log('Account migration 004 verified in the isolated non-production database.');
} catch { console.error('Account migration failed; no secrets or provider error printed. Verify the target and schema.'); process.exitCode = 1; }
finally { try { await accountPool().end(); } catch { /* Configuration may be unavailable. */ } }
