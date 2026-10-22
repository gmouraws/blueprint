import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { distributionService, registeredRecipient, type DownloadRecord, type DownloadStore } from '../src/lib/server/windows-distribution';
import { windowsHandler, windowsServices } from '../src/lib/server/windows-handlers';
import { accountDb, signSession } from './account-fixture';
import { fixtureConfig } from './config-fixture';
import type { Session } from '../src/lib/server/session';

function memoryStore(): DownloadStore {
  const rows = new Map<string, DownloadRecord>();
  return { async create(row) { rows.set(row.id, structuredClone(row)); }, async read(id) { return structuredClone(rows.get(id) ?? null); }, async list() { return structuredClone([...rows.values()]); }, async transition(id, hash, recipient, now, state) { const row = rows.get(id); if (!row || row.hash !== hash || row.recipient !== recipient || row.expires <= now || row.state !== 'unused') return false; row.state = state; return true; } };
}
test('download capabilities are hashed, recipient-bound, expiring, revocable and atomically claimed', async () => {
  let now = 1000; const store = memoryStore(); const service = distributionService(store, () => now);
  const link = await service.issue('recipient'); assert.ok(!JSON.stringify(await store.list()).includes(link.token));
  assert.equal(await service.inspect(link.token, 'another'), null);
  assert.equal(await service.inspect(link.token + 'x', 'recipient'), null);
  const row = (await service.inspect(link.token, 'recipient'))!; assert.ok(row);
  const claims = await Promise.all(Array.from({ length: 8 }, () => service.claim(row))); assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await service.inspect(link.token, 'recipient'), null);
  const revoked = await service.issue('recipient'); assert.equal(await service.revoke(revoked.id), true); assert.equal(await service.inspect(revoked.token, 'recipient'), null);
  const expired = await service.issue('recipient'); now += 24 * 3600000; assert.equal(await service.inspect(expired.token, 'recipient'), null);
});
test('registered recipients require an existing active verified account, never a pending invitation', async () => {
  const { session } = await signSession('Download fixture');
  assert.ok(await registeredRecipient(session.identity));
  assert.equal(await registeredRecipient(randomUUID()), undefined);
  await accountDb.query('UPDATE blueprint_user SET "emailVerified"=false WHERE id=$1', [session.identity]); assert.equal(await registeredRecipient(session.identity), undefined);
  await accountDb.query('UPDATE blueprint_user SET "emailVerified"=true,status=\'disabled\' WHERE id=$1', [session.identity]); assert.equal(await registeredRecipient(session.identity), undefined);
});
test('management rejects anonymous and member sessions; downloads reject another recipient and replay', async () => {
  const id = randomUUID(); let session: Session | null = null; const store = memoryStore(); const service = distributionService(store);
  let reads = 0;
  const deps = { ...windowsServices, getConfig: () => fixtureConfig, verifySession: async () => session, rateLimit: async () => {}, distributionService: () => service, registeredRecipient: async (value: string) => value === id ? { id, email: 'member@example.test' } : undefined, installerAvailable: async () => true, downloadRecipients: async () => [{ id, email: 'member@example.test' }], privateInstaller: async () => { reads++; return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }); } };
  const request = (body?: object) => new NextRequest(fixtureConfig.APP_ORIGIN + '/api/windows/distribution', { method: body ? 'POST' : 'GET', headers: { origin: fixtureConfig.APP_ORIGIN, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await windowsHandler(request(), true, deps)).status, 401);
  session = { identity: id, nickname: 'Member', sessionId: randomUUID(), role: 'member' };
  assert.equal((await windowsHandler(request(), true, deps)).status, 403);
  assert.equal((await windowsHandler(request({ action: 'issue', recipient: id }), true, deps)).status, 403);
  session.role = 'owner';
  assert.equal((await windowsHandler(request({ action: 'issue', recipient: randomUUID() }), true, deps)).status, 403);
  const issued = await windowsHandler(request({ action: 'issue', recipient: id }), true, deps); assert.equal(issued.status, 200);
  const result = await issued.json(); const credential = new URL(result.url).hash.slice('#access='.length);
  const payload = await windowsHandler(request(), true, deps); assert.ok(!JSON.stringify(await payload.json()).includes(credential));
  const valid = await windowsHandler(request({ credential }), false, deps); assert.equal(valid.status, 200); assert.equal(valid.headers.get('location'), null); assert.match(valid.headers.get('cache-control')!, /no-store/); assert.deepEqual([...new Uint8Array(await valid.arrayBuffer())], [1, 2, 3]);
  assert.equal((await windowsHandler(request({ credential }), false, deps)).status, 410); assert.equal(reads, 1);
});
