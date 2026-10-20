import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Page } from '@playwright/test';
import type { ChatMessage } from '../src/lib/chat';

// Test-only HTTP adapter over real embedded PostgreSQL. Never imported by the app.
export async function createChatFixture() {
  const db = new PGlite();
  await db.exec(await readFile('migrations/001-chat.sql', 'utf8'));
  await db.query("INSERT INTO blueprint_chat_environment VALUES (true,'preview',1)");
  const identities = new Map<string, string>();
  const faults = { failWrites: false, loseNextResponse: false };
  return {
    db, faults, close: () => db.close(),
    async install(page: Page, name: string) {
      if (!identities.has(name)) identities.set(name, randomUUID());
      const identity = identities.get(name)!;
      await page.route(/\/api\/chat(?:\?.*)?$/, async route => {
        const req = route.request(); const params = new URL(req.url()).searchParams;
        const map = (row: Record<string, unknown>): ChatMessage => ({ id: String(row.id), channel: 'geral', senderId: String(row.sender_id), name: String(row.display_name), body: String(row.body), createdAt: new Date(String(row.created_at)).toISOString(), own: row.sender_id === identity });
        if (req.method() === 'POST') {
          if (faults.failWrites) return route.fulfill({ status: 503, json: { error: 'Histórico indisponível.' } });
          const { body, requestId } = req.postDataJSON();
          const result = await db.query('SELECT * FROM blueprint_chat_put($1,$2,$3,$4,$5)', ['preview', identity, name, body, requestId]);
          if (faults.loseNextResponse) { faults.loseNextResponse = false; return route.abort('failed'); }
          return route.fulfill({ json: { message: map(result.rows[0] as Record<string, unknown>) } });
        }
        const after = params.get('after'); const before = params.get('before');
        const result = await db.query(`SELECT * FROM blueprint_chat_messages WHERE created_at > now() - interval '30 days' ${after ? 'AND id > $1' : before ? 'AND id < $1' : ''} ORDER BY id ${after ? 'ASC' : 'DESC'} LIMIT 51`, after || before ? [after ?? before] : []);
        const rows = result.rows.slice(0, 50) as Record<string, unknown>[];
        if (!after) rows.reverse();
        return route.fulfill({ json: { messages: rows.map(map), hasMore: result.rows.length > 50, serverTime: new Date().toISOString() } });
      });
    },
  };
}
