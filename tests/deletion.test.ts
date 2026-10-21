import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { mergeMessages, reconcileDeletions } from '../src/lib/chat';
import { drainImageCleanup } from '../src/lib/server/image-cleanup';

test('deletion uses session identity, fences retries, revokes images and records ordered catchup across history pages', async () => {
  const db = new PGlite();
  try {
    for (const file of ['001-chat', '002-images', '003-message-deletion', '003-message-deletion']) await db.exec(await readFile(`migrations/${file}.sql`, 'utf8'));
    await db.query("INSERT INTO blueprint_chat_environment VALUES(true,'preview',1)");
    const owner = randomUUID(), other = randomUUID();
    const put = async (body: string, image: string | null = null, key = randomUUID(), identity = owner) => {
      const row = (await db.query<{id: string}>('SELECT * FROM blueprint_chat_put_image($1,$2,$3,$4,$5,$6)', ['preview',identity,'Same nickname',body,key,image])).rows[0];
      return { id: String(row.id), key };
    };
    const remove = async (id: string, kind = 'message', identity = owner, environment = 'preview') => (await db.query<{kind: string}>('SELECT blueprint_chat_delete($1,$2,$3,$4) AS kind', [environment,identity,id,kind])).rows[0].kind;
    const image = async () => {
      const id = randomUUID();
      await db.query("INSERT INTO blueprint_chat_attachments(id,sender_id,request_id,content_type,original_size,state,width,height) VALUES($1,$2,$3,'image/png',100,'ready',64,32)", [id,owner,randomUUID()]);
      return id;
    };
    const attachment = await image(); const first = await put('Keep text', attachment);
    await put('Same name is not ownership', null, randomUUID(), other);
    await assert.rejects(remove(first.id, 'image', other), /Content unavailable/);
    await assert.rejects(remove(first.id, 'message', owner, 'production'), /environment mismatch/);
    await assert.rejects(remove(first.id, 'arbitrary'), /Invalid deletion/);
    assert.equal(await remove(first.id,'image'), 'image');
    assert.equal(await remove(first.id,'image'), 'image');
    assert.equal((await db.query<{body:string;attachment_id:string|null;deleted_at:string|null}>('SELECT body,attachment_id,deleted_at FROM blueprint_chat_messages WHERE id=$1',[first.id])).rows[0].body, 'Keep text');
    assert.equal((await db.query<{state:string}>('SELECT state FROM blueprint_chat_attachments WHERE id=$1',[attachment])).rows[0].state, 'deleting');
    await db.query("DELETE FROM blueprint_chat_attachments WHERE id=$1 AND state='deleting' AND created_at<=now()-interval '1 hour'",[attachment]);
    assert.equal((await db.query('SELECT id FROM blueprint_chat_attachments WHERE id=$1',[attachment])).rows.length,1,'retain a cleanup marker while an old upload token can still be replayed');
    assert.equal((await db.query("SELECT a.id FROM blueprint_chat_attachments a JOIN blueprint_chat_messages m ON m.attachment_id=a.id WHERE a.id=$1 AND a.state='attached' AND m.deleted_at IS NULL",[attachment])).rows.length,0);
    await assert.rejects(put('Keep text', attachment, first.key), /Idempotency conflict/);
    const empty = await put('', await image()); assert.equal(await remove(empty.id,'image'), 'message');
    assert.equal(await remove(empty.id,'image'), 'message');
    // Delete outside the newest history page and catch it through the separate cursor.
    for(let i=0;i<55;i++) await put(`Page ${i}`);
    assert.equal(await remove(first.id), 'message'); assert.equal(await remove(first.id), 'message');
    await assert.rejects(put('Keep text', attachment, first.key), /Idempotency conflict/);
    const tombstone = (await db.query<{body:string;attachment_id:string|null;deleted_at:string|null}>('SELECT body,attachment_id,deleted_at FROM blueprint_chat_messages WHERE id=$1',[first.id])).rows[0];
    assert.equal(tombstone.body,''); assert.equal(tombstone.attachment_id,null); assert.ok(tombstone.deleted_at);
    for (const file of ['001-chat','002-images','003-message-deletion']) await db.exec(await readFile(`migrations/${file}.sql`,'utf8'));
    const changes = (await db.query<{message_id:string; kind:string}>('SELECT * FROM blueprint_chat_deletions ORDER BY id')).rows;
    assert.deepEqual(changes.map(row=>[String(row.message_id),row.kind]),[[first.id,'image'],[empty.id,'message'],[first.id,'message']]);
    const recent = (await db.query<{id:string}>('SELECT id FROM blueprint_chat_messages WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 50')).rows;
    const older = (await db.query('SELECT id FROM blueprint_chat_messages WHERE deleted_at IS NULL AND id < $1 ORDER BY id DESC',[recent.at(-1)!.id])).rows;
    assert.equal(recent.length+older.length,56);
    await db.query("UPDATE blueprint_chat_attachments SET created_at=now()-interval '1 hour' WHERE id=$1",[attachment]);
    await db.query("DELETE FROM blueprint_chat_attachments WHERE id=$1 AND state='deleting' AND created_at<=now()-interval '1 hour'",[attachment]);
    assert.equal((await db.query('SELECT id FROM blueprint_chat_attachments WHERE id=$1',[attachment])).rows.length,0);
    const expired = await put('Expired'); await db.query("UPDATE blueprint_chat_messages SET created_at=now()-interval '30 days' WHERE id=$1",[expired.id]);
    await assert.rejects(remove(expired.id), /Content unavailable/);
    await assert.rejects(remove('9223372036854775807'), /Content unavailable/);
  } finally { await db.close(); }
});

test('stale history cannot resurrect deleted messages or images', () => {
  const record = {id:'1',channel:'geral' as const,senderId:randomUUID(),name:'Ana',body:'Text',createdAt:new Date().toISOString(),own:true,image:{id:randomUUID(),width:64,height:32}};
  const map = new Map([['1','image' as const]]);
  const removed = reconcileDeletions([record],map);
  assert.equal(removed[0].body,'Text'); assert.equal(removed[0].image,undefined);
  assert.equal(reconcileDeletions(mergeMessages(removed,[record]),map)[0].image,undefined);
  assert.deepEqual(reconcileDeletions(mergeMessages(removed,[record]),new Map([['1','message']])),[]);
});

test('partial object/metadata failures retain retry work and do not starve other cleanup items', async () => {
  const metadata=new Set(['a','b','c']); const objects=new Set(['a/raw','a/image','b/raw','b/image','c/raw','c/image']);
  let fail=true;
  const removeObjects=async(id:string)=>{objects.delete(`${id}/raw`);if(fail&&id==='a')throw new Error('storage unavailable');objects.delete(`${id}/image`);};
  const removeMetadata=async(id:string)=>{if(fail&&id==='b')throw new Error('database unavailable');metadata.delete(id);};
  await assert.rejects(drainImageCleanup([...metadata],removeObjects,removeMetadata),/remains pending/);
  assert.deepEqual([...metadata],['a','b']); assert.deepEqual([...objects],['a/image']);
  fail=false; await drainImageCleanup([...metadata],removeObjects,removeMetadata);
  assert.equal(metadata.size,0); assert.equal(objects.size,0);
});
