import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, incomingVolume, microphoneError, validatePreferences } from '../src/lib/client/preferences';

test('saved audio preferences are bounded, allowlisted and resilient to invalid data', () => {
  for (const input of [null, [], 'text', 12, { microphone: '', sounds: 'yes', screenVolume: NaN }]) assert.deepEqual(validatePreferences(input), defaultPreferences);
  assert.deepEqual(validatePreferences({ microphone: 'usb-device', sounds: false, screenVolume: 203, token: 'discarded', password: 'discarded' }), { microphone: 'usb-device', sounds: false, screenVolume: 100 });
  assert.equal(validatePreferences({ microphone: 'x'.repeat(257), screenVolume: -3 }).microphone, 'default');
  assert.equal(validatePreferences({ screenVolume: -3 }).screenVolume, 0);
});
test('global mute dominates each local volume without changing the saved setting', () => {
  assert.equal(incomingVolume(false, false, 35), 0.35);
  assert.equal(incomingVolume(true, false, 35), 0);
  assert.equal(incomingVolume(false, true, 35), 0);
  assert.equal(incomingVolume(false, false, 200), 1);
});
test('device errors explain failure without echoing underlying messages', () => {
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'Other']) {
    const error = new Error('sensitive-debug-payload'); error.name = name;
    assert.ok(!microphoneError(error).includes(error.message));
  }
});
