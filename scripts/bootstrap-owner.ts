import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { accountPool, accountTransaction } from '../src/lib/server/account-db';
import { chatDatabaseConfig } from '../src/lib/server/chat-store';
try {
  if (chatDatabaseConfig().environment === 'production') throw new Error('Production not authorized');
  const email = z.string().trim().toLowerCase().email().parse(process.env.BOOTSTRAP_OWNER_EMAIL);
  await accountTransaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(148296241,4)');
    if ((await db.query("SELECT 1 FROM blueprint_user WHERE role = 'owner' UNION ALL SELECT 1 FROM blueprint_invitation WHERE role = 'owner' AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now()")).rows.length) throw new Error('Owner already established');
    await db.query("INSERT INTO blueprint_invitation(id,email,role,expires_at) VALUES($1,$2,'owner',now() + interval '7 days')",[randomUUID(),email]);
  });
  console.log('Explicit owner invitation created. Complete email verification within seven days.');
} catch { console.error('Owner bootstrap refused. Check the environment, email and existing owner/invitation.'); process.exitCode = 1; }
finally { try { await accountPool().end(); } catch { /* Configuration may be unavailable. */ } }
