// Loaded ONLY by the Playwright web-server command, never by application code.
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
for (const migration of ['001-chat','002-images','003-message-deletion','004-accounts']) await db.exec(await readFile(`migrations/${migration}.sql`,'utf8'));
await db.exec("INSERT INTO blueprint_chat_environment VALUES(true,'preview',1); INSERT INTO blueprint_invitation(id,email,role,expires_at) VALUES(gen_random_uuid(),'owner@example.test','owner',now()+interval '7 days')");
let tail = Promise.resolve();
Pool.prototype.connect = async function () {
  let release; const previous = tail; tail = new Promise(resolve=>{release=resolve;}); await previous;
  return { query: async (query,parameters) => { const result = await db.query(query,parameters);return {...result,rowCount:result.affectedRows??result.rows.length,command:query.trim().split(/\s/)[0].toUpperCase()}; }, release };
};
