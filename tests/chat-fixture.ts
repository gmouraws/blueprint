import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const sharp: typeof import('sharp').default = createRequire(import.meta.url)('sharp');
import { PGlite } from '@electric-sql/pglite';
import type { Page } from '@playwright/test';
import type { ChatMessage } from '../src/lib/chat';

// Test-only HTTP adapter over real embedded PostgreSQL. Never imported by the app.
export async function createChatFixture() {
  const db = new PGlite();
  await db.exec(await readFile('migrations/001-chat.sql', 'utf8'));
  await db.exec(await readFile('migrations/002-images.sql','utf8'));
  await db.query("INSERT INTO blueprint_chat_environment VALUES (true,'preview',1)");
  const fixtureImage = await sharp({create:{width:64,height:32,channels:3,background:'#a3e1c5'}}).webp().toBuffer();
  const identities = new Map<string, string>();
  const faults = { failWrites: false, loseNextResponse: false, failImageCompletion: false };
  return {
    db, faults, close: () => db.close(),
    async install(page: Page, name: string) {
      if (!identities.has(name)) identities.set(name, randomUUID());
      const identity = identities.get(name)!;
      // Simulates a direct upload already present (the retry path); Blob itself is verified in Preview.
      await page.route('**/api/attachments', async route => {
        const body=route.request().postDataJSON();
        if(body.action==='prepare') {
          const result=await db.query<{id:string}>("INSERT INTO blueprint_chat_attachments(id,sender_id,request_id,content_type,original_size) VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,request_id) DO UPDATE SET request_id=excluded.request_id RETURNING id",[randomUUID(),identity,body.requestId,body.contentType,body.size]);
          return route.fulfill({json:{id:result.rows[0].id,ready:false}});
        }
        if(faults.failImageCompletion) return route.fulfill({status:503,json:{error:'Validação indisponível.'}});
        await db.query("UPDATE blueprint_chat_attachments SET state='ready',width=64,height=32 WHERE id=$1 AND sender_id=$2 AND state='pending'",[body.id,identity]);
        return route.fulfill({json:{image:{id:body.id,width:64,height:32}}});
      });
      await page.route('**/api/attachments/*',async route=>{
        const id=new URL(route.request().url()).pathname.split('/').at(-1);
        const result=await db.query("SELECT a.id FROM blueprint_chat_attachments a JOIN blueprint_chat_messages m ON m.attachment_id=a.id WHERE a.id=$1 AND a.state='attached' AND m.created_at>now()-interval '30 days'",[id]);
        return route.fulfill(result.rows.length?{body:fixtureImage,contentType:'image/webp',headers:{'cache-control':'private, no-store'}}:{status:404});
      });
      await page.route(/\/api\/chat(?:\?.*)?$/, async route => {
        const req = route.request(); const params = new URL(req.url()).searchParams;
        const map = (row: Record<string, unknown>): ChatMessage => ({ id: String(row.id), channel: 'geral', senderId: String(row.sender_id), name: String(row.display_name), body: String(row.body), createdAt: new Date(String(row.created_at)).toISOString(), own: row.sender_id === identity, ...(row.attachment_id?{image:{id:String(row.attachment_id),width:64,height:32}}:{}) });
        if (req.method() === 'POST') {
          if (faults.failWrites) return route.fulfill({ status: 503, json: { error: 'Histórico indisponível.' } });
          const { body, requestId, imageId } = req.postDataJSON();
          const result = await db.query('SELECT * FROM blueprint_chat_put_image($1,$2,$3,$4,$5,$6)', ['preview', identity, name, body, requestId, imageId??null]);
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
