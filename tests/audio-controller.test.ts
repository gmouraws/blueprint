import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioController } from '../src/lib/client/audio-controller';
import { bindingFromEvent, validateShortcuts, emptyShortcuts } from '../src/lib/client/shortcuts';

function fixture(enabled = false) {
  let microphone = { enabled, track: {} as unknown };
  let state = { muted: false, combined: false, busy: false };
  let available = true; let fail = false;
  const calls: { enabled: boolean; existingOnly?: boolean }[] = [];
  const controller = new AudioController({
    microphone: () => microphone, available: () => available,
    setMicrophone: async (value, existingOnly) => { calls.push({ enabled: value, existingOnly }); if (fail) return false; microphone.enabled = value; return true; },
    changed: next => { state = next; },
  });
  return { controller, calls, state: () => state, mic: () => microphone, replace: () => { microphone = { enabled: false, track: {} }; }, disconnect: () => { available = false; microphone.enabled = false; controller.invalidate(); }, fail: () => { fail = true; } };
}
test('combined mute restores all four preceding combinations using only the retained track', async () => {
  for (const microphone of [false, true]) for (const listening of [false, true]) {
    const f = fixture(microphone);
    if (listening) await f.controller.dispatch('listening');
    await f.controller.dispatch('all');
    assert.equal(f.mic().enabled, false); assert.deepEqual(f.state(), { muted: true, combined: true, busy: false });
    await f.controller.dispatch('all');
    assert.equal(f.mic().enabled, microphone); assert.deepEqual(f.state(), { muted: listening, combined: false, busy: false });
    assert.ok(f.calls.filter(call => call.enabled).every(call => call.existingOnly === true));
  }
});
test('individual overrides exit combined mode and leave the other side muted', async () => {
  for (const action of ['microphone', 'listening'] as const) {
    const f = fixture(true); await f.controller.dispatch('all'); await f.controller.dispatch(action);
    assert.equal(f.state().combined, false);
    assert.equal(f.state().muted, action === 'microphone');
    assert.equal(f.mic().enabled, action === 'microphone');
  }
});
test('track replacement and disconnect discard microphone restoration; failures do not claim combined success', async () => {
  const f = fixture(true); await f.controller.dispatch('all'); f.replace(); await f.controller.dispatch('all');
  assert.equal(f.calls.length, 1); assert.equal(f.mic().enabled, false);
  await f.controller.dispatch('all'); f.disconnect(); assert.equal(f.state().combined, false); assert.equal(f.state().muted, true);
  await f.controller.dispatch('microphone'); assert.equal(f.mic().enabled, false);
  const failed = fixture(true); failed.fail(); await failed.controller.dispatch('all');
  assert.equal(failed.state().combined, false); assert.equal(failed.state().muted, true); assert.equal(failed.mic().enabled, true);
});
test('combined mute cancels a pending activation and stale completion cannot overwrite current state', async () => {
  let resolve!: (value: boolean) => void; let muted = false; let combined = false;
  const controller = new AudioController({ microphone: () => ({ enabled: false }), available: () => true,
    setMicrophone: enabled => enabled ? new Promise(done => { resolve = done; }) : Promise.resolve(true),
    changed: state => { muted = state.muted; combined = state.combined; },
  });
  const pending = controller.dispatch('microphone'); await controller.dispatch('all'); resolve(false); await pending;
  assert.equal(muted, true); assert.equal(combined, true);
  await controller.dispatch('all'); assert.equal(muted, false);
});
test('shortcut preferences reject malformed, reserved and duplicated bindings', () => {
  assert.deepEqual(validateShortcuts(null), emptyShortcuts);
  assert.deepEqual(validateShortcuts({ microphone: 'Ctrl+Shift+M', listening: 'Ctrl+Shift+M', all: 'Ctrl+Shift+T' }), { ...emptyShortcuts, microphone: 'Ctrl+Shift+M' });
  assert.equal(bindingFromEvent({ key: 'm', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }), 'Ctrl+Shift+M');
  assert.equal(bindingFromEvent({ key: 'm', ctrlKey: true, shiftKey: true, altKey: true, metaKey: false }), '');
});

test('listening can be toggled during pending microphone permission without losing completion state', async () => {
  let resolve!: (value: boolean) => void;
  let state = { muted: false, combined: false, busy: false };
  const controller = new AudioController({ microphone: () => ({ enabled: false }), available: () => true,
    setMicrophone: () => new Promise(done => { resolve = done; }), changed: next => { state = next; },
  });
  const pending = controller.dispatch('microphone');
  await controller.dispatch('listening');
  assert.deepEqual(state, { muted: true, combined: false, busy: true });
  resolve(true); await pending;
  assert.deepEqual(state, { muted: true, combined: false, busy: false });
});
