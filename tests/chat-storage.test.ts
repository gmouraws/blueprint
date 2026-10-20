import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { chatDatabaseConfig } from '../src/lib/server/chat-store';
import { mergeMessages } from '../src/lib/chat';

test('PostgreSQL migration, environment isolation, idempotency, ordering and retention', async () => {
  const db = new PGlite();
  const migration = await readFile('migrations/001-chat.sql', 'utf8');
  try {
    await db.exec(migration); await db.exec(migration);
    await db.query("INSERT INTO blueprint_chat_environment VALUES (true, 'preview', 1)");
    await assert.rejects(db.query("SELECT blueprint_chat_assert_environment('production')"), /environment mismatch/);
    const sender = randomUUID(); const request = randomUUID();
    const write = (body: string, requestId = request, identity = sender, environment = 'preview') => db.query<{ id: bigint; body: string }>('SELECT * FROM blueprint_chat_put($1,$2,$3,$4,$5)', [environment, identity, 'Ana', body, requestId]);
    await assert.rejects(write('Forbidden', randomUUID(), sender, 'production'), /environment mismatch/);
    const first = (await write('Olá')).rows[0];
    assert.equal((await write('Olá')).rows[0].id, first.id);
    await assert.rejects(write('Different'), /Idempotency conflict/);
    assert.notEqual((await write('Olá', request, randomUUID())).rows[0].id, first.id);
    for (let i = 0; i < 70; i++) await write(`Message ${i}`, randomUUID());
    const latest = await db.query<{ id: bigint }>('SELECT id FROM blueprint_chat_messages ORDER BY id DESC LIMIT 50');
    const oldest = latest.rows.at(-1)!.id;
    const older = await db.query<{ id: bigint }>('SELECT id FROM blueprint_chat_messages WHERE id < $1 ORDER BY id DESC LIMIT 50', [oldest]);
    assert.equal(latest.rows.length, 50); assert.equal(older.rows.length, 22);
    const caught = (await write('During pagination', randomUUID())).rows[0];
    const catchup = await db.query<{ id: bigint }>('SELECT id FROM blueprint_chat_messages WHERE id > $1 ORDER BY id', [latest.rows[0].id]);
    assert.deepEqual(catchup.rows.map(row => row.id), [caught.id]);
    assert.equal(new Set([...latest.rows, ...older.rows, ...catchup.rows].map(row => String(row.id))).size, 73);
    await db.query("UPDATE blueprint_chat_messages SET created_at = now() - interval '30 days' WHERE id = $1", [first.id]);
    assert.equal((await db.query("SELECT id FROM blueprint_chat_messages WHERE id = $1 AND created_at > now() - interval '30 days'", [first.id])).rows.length, 0);
    await assert.rejects(write('Olá'), /Idempotency conflict/);
    await db.query("DELETE FROM blueprint_chat_messages WHERE created_at <= now() - interval '30 days'");
    assert.equal((await db.query('SELECT id FROM blueprint_chat_messages WHERE id = $1', [first.id])).rows.length, 0);
    await assert.rejects(write('á'.repeat(1001), randomUUID()), /check constraint/);
  } finally { await db.close(); }
});

test('database configuration is server-only, TLS-only and bound to the deployed environment', () => {
  const DATABASE_URL = 'postgresql://test:test@ep-test.us-east-1.aws.neon.tech/neondb?sslmode=require';
  assert.equal(chatDatabaseConfig({ DATABASE_URL, VERCEL: '1', VERCEL_ENV: 'preview', CHAT_ENVIRONMENT: 'production' }).environment, 'preview');
  assert.throws(() => chatDatabaseConfig({ DATABASE_URL }), /environment required/);
  assert.throws(() => chatDatabaseConfig({ DATABASE_URL: DATABASE_URL.replace('require', 'disable'), CHAT_ENVIRONMENT: 'preview' }), /configuration/);
  assert.throws(() => chatDatabaseConfig({ DATABASE_URL: 'invalid-secret-canary', CHAT_ENVIRONMENT: 'preview' }), /^Error: Chat database required$/);
});

test('client reconciliation deduplicates stable IDs, preserves order and hides expiry', () => {
  const now = Date.now();
  const message = { id: '3', channel: 'geral' as const, senderId: 'test', name: 'Ana', body: 'Plain text', createdAt: new Date(now).toISOString(), own: false };
  const merged = mergeMessages([{ ...message, id: '2' }, message], [{ ...message }, { ...message, id: '1', createdAt: new Date(now - 2592000000).toISOString() }], now);
  assert.deepEqual(merged.map(row => row.id), ['2', '3']);
});
