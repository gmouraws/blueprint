import test from 'node:test';
import assert from 'node:assert/strict';
import { streamVideoSample, validStreamNumber } from '../src/lib/client/stream-sample';

test('missing or invalid RTCStats FPS stays unknown and cannot reach unsafe numeric rendering', () => {
  for (const framesPerSecond of [undefined, null, NaN, Infinity, -1, '30']) {
    const result = streamVideoSample([{ bytesSent: 123, frameWidth: 1920, frameHeight: 1080, framesPerSecond }]);
    assert.equal(result.bytes, 123);
    assert.equal(result.samples, 0);
    assert.ok(Object.values(result).every(validStreamNumber));
    assert.doesNotThrow(() => result.fps.toFixed(1));
  }
  assert.deepEqual(streamVideoSample([]), { bytes: 0, width: 0, height: 0, fps: 0, samples: 0 });
});

test('complete valid layers provide real quality while all valid byte counters remain counted', () => {
  const result = streamVideoSample([
    { bytesSent: 10, frameWidth: 1920, frameHeight: 1080 },
    { bytesSent: 20, frameWidth: 640, frameHeight: 360, framesPerSecond: 30 },
    { bytesSent: 30, frameWidth: 1280, frameHeight: 720, framesPerSecond: 15 },
    { bytesSent: NaN, frameWidth: Infinity, frameHeight: 1080, framesPerSecond: 60 },
  ]);
  assert.deepEqual(result, { bytes: 60, width: 1280, height: 720, fps: 15, samples: 1 });
  assert.equal(streamVideoSample([{ frameWidth: 640, frameHeight: 360, framesPerSecond: 0 }]).fps, 0);
});
