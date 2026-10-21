import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, incomingVolume, microphoneError, validatePreferences, configurePreferences, readPreferences, savePreferences, importPreferences, canImportPreferences, preferencePlatform } from '../src/lib/client/preferences';
import { microphoneProcessing, processingStatus } from '../src/lib/client/microphone-processing';

test('microphone processing requests only supported controls and reports actual settings honestly', () => {
  assert.equal(validatePreferences({noiseSuppression:false}).noiseSuppression,false);
  assert.deepEqual(microphoneProcessing(true,{}),{});
  assert.deepEqual(microphoneProcessing(false,{noiseSuppression:true,echoCancellation:true,autoGainControl:true}),{noiseSuppression:false,echoCancellation:true,autoGainControl:true});
  assert.match(processingStatus(false),/não oferece/);
  assert.match(processingStatus(true),/ao ativar/);
  assert.match(processingStatus(true,{}),/não informa/);
  assert.match(processingStatus(true,{noiseSuppression:true}),/^Supressão ativa/);
  assert.match(processingStatus(true,{noiseSuppression:false}),/^Supressão inativa/);
});

test('saved audio preferences are bounded, allowlisted and resilient to invalid data', () => {
  for (const input of [null, [], 'text', 12, { microphone: '', sounds: 'yes', screenVolume: NaN }]) assert.deepEqual(validatePreferences(input), defaultPreferences);
  assert.deepEqual(validatePreferences({ microphone: 'usb-device', sounds: false, screenVolume: 203, token: 'discarded', password: 'discarded' }), { microphone: 'usb-device', output: 'default', sounds: false, screenVolume: 100, noiseSuppression: true, shortcuts: { microphone: '', listening: '', all: '' } });
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


test('account shortcuts override stale local clearing while devices/import/account switching stay isolated', context => {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value: { getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>values.set(key,value) } as unknown as Storage });
  const platform=preferencePlatform();
  configurePreferences('first',{sounds:false,screenVolume:40,shortcuts:{[platform]:{microphone:'Ctrl+Shift+M',listening:'',all:''}}});
  assert.equal(readPreferences().sounds,false);assert.equal(readPreferences().screenVolume,40);
  savePreferences({shortcuts:{microphone:'',listening:'',all:''},output:'usb-headphones'});
  assert.equal(readPreferences().shortcuts.microphone,'Ctrl+Shift+M');assert.equal(readPreferences().output,'usb-headphones');
  values.set('blueprint.audio-preferences',JSON.stringify({microphone:'old-input',sounds:true,token:'discard'}));
  assert.equal(canImportPreferences(),true);importPreferences();assert.equal(canImportPreferences(),false);
  assert.equal(readPreferences().microphone,'old-input');assert.equal(readPreferences().output,'usb-headphones');
  assert.equal(readPreferences().shortcuts.microphone,'Ctrl+Shift+M');
  configurePreferences('second',{sounds:false,screenVolume:20});assert.equal(readPreferences().microphone,'default');assert.equal(readPreferences().screenVolume,20);
  const key=`blueprint.preferences.v2:second:${platform}`;values.set(key,JSON.stringify({token:'discard',sounds:false}));savePreferences({output:'other'});
  assert.equal(JSON.parse(values.get(key)!).token,undefined);
  configurePreferences('first',{});assert.equal(readPreferences().output,'usb-headphones');
  context.mock.restoreAll();configurePreferences('',{});
});
