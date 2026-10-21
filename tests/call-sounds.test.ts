import test from 'node:test';
import assert from 'node:assert/strict';
import type { Room } from 'livekit-client';
import { closeSounds, playMembershipTone, prepareSounds, setSoundPolicy } from '../src/lib/client/call-sounds';

test('deafen cancels a currently scheduled tone and suppresses new tones without changing the saved preference', async context => {
  let started=0, zeroed=0, cancelled=0, closed=0;
  const room={canPlaybackAudio:true} as Room;
  class FakeContext {
    state='running';currentTime=1;destination={};
    async resume(){}
    async close(){this.state='closed';closed++;}
    createOscillator(){return {frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){},start(){started++;},stop(){},onended:null};}
    createGain(){return {context:this,gain:{cancelScheduledValues(){cancelled++;},setValueAtTime(value:number){if(value===0)zeroed++;},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const original=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
  Object.defineProperty(globalThis,'AudioContext',{value:FakeContext,configurable:true});
  context.after(()=>{if(original)Object.defineProperty(globalThis,'AudioContext',original);else Reflect.deleteProperty(globalThis,'AudioContext');});
  prepareSounds(room);setSoundPolicy(room,{enabled:true,muted:false});
  const playing=playMembershipTone(room,true);const before=zeroed;
  setSoundPolicy(room,{enabled:true,muted:true});assert.equal(cancelled,1);assert.equal(zeroed,before+1);
  await playMembershipTone(room,false);assert.equal(started,1);
  setSoundPolicy(room,{enabled:true,muted:false});const restored=playMembershipTone(room,false);assert.equal(started,2);
  closeSounds(room);assert.equal(closed,1);await Promise.all([playing,restored]);
});
