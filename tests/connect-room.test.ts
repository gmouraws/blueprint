import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectRoom, VoiceConnectionTimeout } from '../src/lib/client/connect-room';

test('successful connection stays connected after the deadline', async () => {
  let disconnected = false;
  await connectRoom({ connect: async () => {}, disconnect: async () => { disconnected = true; } }, 'ws://test', 'test-token', 10);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(disconnected, false);
});

test('stalled connection cancels and waits for cleanup before retry becomes possible', async () => {
  let finishCleanup!: () => void;
  let startedCleanup!: () => void;
  const cleaning = new Promise<void>(resolve => { startedCleanup = resolve; });
  let settled = false;
  const result = connectRoom({
    connect: () => new Promise<void>(() => {}),
    disconnect: async stopTracks => { assert.equal(stopTracks, true); startedCleanup(); await new Promise<void>(resolve => { finishCleanup = resolve; }); },
  }, 'ws://test', 'test-token', 10).finally(() => { settled = true; });
  const rejection = assert.rejects(result, VoiceConnectionTimeout);
  await cleaning;
  assert.equal(settled, false);
  finishCleanup();
  await rejection;
});

test('connection failure also releases the old transport', async () => {
  let disconnected = false;
  const failure = new Error('Test connection failure');
  await assert.rejects(connectRoom({ connect: async () => { throw failure; }, disconnect: async stopTracks => { assert.equal(stopTracks, true); disconnected = true; } }, 'ws://test', 'test-token'), error => error === failure);
  assert.equal(disconnected, true);
});
