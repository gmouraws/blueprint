import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { normalizeImage, boundedImage, InvalidImage } from '../src/lib/server/image-validation';
import { messageParts } from '../src/lib/client/message-links';

test('images are completely decoded, stripped and normalized; false MIME, malformed, oversized files fail', async () => {
  for (const format of ['png','jpeg','webp'] as const) {
    const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#a3e1c5' } })[format]().withMetadata().toBuffer();
    const image = await normalizeImage(bytes, 'image/' + format);
    assert.equal(image.width, 64); assert.equal(image.height, 32);
    const metadata = await sharp(image.bytes).metadata(); assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined);
    await assert.rejects(normalizeImage(bytes, 'text/html'), InvalidImage);
    await assert.rejects(normalizeImage(bytes.subarray(0, 20), 'image/' + format), InvalidImage);
  }
  await assert.rejects(normalizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'), InvalidImage);
  await assert.rejects(normalizeImage(Buffer.alloc(5242881), 'image/png'), InvalidImage);
  const oversized = await sharp({ create: { width: 8193, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(normalizeImage(oversized, 'image/png'), InvalidImage);
  const frames = Buffer.concat([Buffer.alloc(24, 20), Buffer.alloc(24, 220)]);
  const animated = await sharp(frames, { raw: { width: 4, height: 4, channels: 3, pageHeight: 2 } }).webp({ delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(normalizeImage(animated, 'image/webp'), InvalidImage);
  let cancelled = false;
  await assert.rejects(boundedImage(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5242881)); }, cancel() { cancelled = true; } })), InvalidImage);
  assert.equal(cancelled, true);
});
test('only http(s) links without embedded credentials are linked; markup stays plain text', () => {
  const parts = messageParts('<script> https://example.test/path?q=1. javascript:alert(1) https://user:pass@example.test');
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), ['https://example.test/path?q=1']);
  assert.equal(parts.map(part => part.text).join(''), '<script> https://example.test/path?q=1. javascript:alert(1) https://user:pass@example.test');
});
test('image attachment ownership, atomic message creation, retries, expiry and environment isolation', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('migrations/001-chat.sql','utf8'));
    const migration = await readFile('migrations/002-images.sql','utf8'); await db.exec(migration); await db.exec(migration);
    await db.query("INSERT INTO blueprint_chat_environment VALUES (true,'preview',1)");
    const sender = randomUUID(), image = randomUUID(), request = randomUUID();
    await db.query("INSERT INTO blueprint_chat_attachments(id,sender_id,request_id,content_type,original_size,state,width,height) VALUES($1,$2,$3,'image/png',100,'ready',64,32)",[image,sender,randomUUID()]);
    const put = (owner=sender, key=request, attachment: string|null=image, env='preview') => db.query<{id:string}>('SELECT * FROM blueprint_chat_put_image($1,$2,$3,$4,$5,$6)',[env,owner,'Ana','',key,attachment]);
    await assert.rejects(put(randomUUID()), /Invalid attachment/);
    await assert.rejects(put(sender,request,image,'production'), /environment mismatch/);
    const first = (await put()).rows[0]; assert.equal((await put()).rows[0].id,first.id);
    await assert.rejects(put(sender,randomUUID()), /Invalid attachment/);
    await assert.rejects(put(sender,request,null), /Idempotency conflict/);
    assert.equal((await db.query("SELECT * FROM blueprint_chat_messages")).rows.length,1);
    await db.query("UPDATE blueprint_chat_messages SET created_at = now() - interval '30 days'");
    assert.equal((await db.query("SELECT a.id FROM blueprint_chat_attachments a JOIN blueprint_chat_messages m ON m.attachment_id=a.id WHERE a.state='attached' AND m.created_at > now() - interval '30 days'")).rows.length,0);
    await assert.rejects(put(), /Idempotency conflict/);
  } finally { await db.close(); }
});
