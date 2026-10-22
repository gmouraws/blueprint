import test from 'node:test';
import assert from 'node:assert/strict';
import { streamRequest } from '../src/lib/client/stream-request';

test('busy lock retries are bounded and preserve one-time ticket request contents', async () => {
  let calls = 0;
  const waits: number[] = [];
  const body = { action: 'exchange', credential: 'synthetic-ticket' };
  const result = await streamRequest(body, false, {
    fetch: async (_url, options) => {
      assert.equal(options?.body, JSON.stringify(body));
      assert.equal(options?.cache, 'no-store');
      return ++calls < 3 ? Response.json({ code: 'STREAM_BUSY' }, { status: 409 }) : Response.json({ role: 'watch' });
    },
    wait: async ms => { waits.push(ms); },
  });
  assert.equal(result.role, 'watch'); assert.equal(calls, 3); assert.equal(waits.length, 2);
  calls = 0;
  await assert.rejects(streamRequest({}, false, {
    fetch: async () => { calls++; return Response.json({ code: 'STREAM_BUSY', error: 'Busy' }, { status: 409 }); },
    wait: async () => {},
  }), /Busy/);
  assert.equal(calls, 4);
});

test('capacity, revoked access, network failures and shutdown requests never replay', async () => {
  for (const status of [401, 409, 503]) {
    let calls = 0;
    await assert.rejects(streamRequest({}, false, {
      fetch: async () => { calls++; return Response.json({ error: 'Rejected' }, { status }); },
      wait: async () => assert.fail('must not retry'),
    }), /Rejected/);
    assert.equal(calls, 1);
  }
  await assert.rejects(streamRequest({}, false, { fetch: async () => { throw Error('Network'); }, wait: async () => assert.fail('must not retry') }), /Network/);
  await assert.rejects(streamRequest({}, true, { fetch: async () => Response.json({ code: 'STREAM_BUSY', error: 'Busy' }, { status: 409 }), wait: async () => assert.fail('must not retry') }), /Busy/);
});
