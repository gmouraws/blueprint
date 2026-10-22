import test from 'node:test';
import assert from 'node:assert/strict';
import { discordDisplayName, discordText, streamDisplayName, streamTitle } from '../src/lib/stream-labels';
import { confirmedVideoSid, viewingReporter, type Viewing } from '../src/lib/client/stream-viewing';

test('verified Discord label fallback, Unicode bounds and formatting remain display-only',()=>{
  const user={global_name:'Display',username:'username'};
  assert.equal(discordDisplayName({nick:'Server',user}),'Server');
  assert.equal(discordDisplayName({nick:'\u0000\u202e',user}),'Display');
  assert.equal(discordDisplayName({nick:null,user:{...user,global_name:null}}),'username');
  assert.equal(discordDisplayName({user:{}}),undefined);
  assert.equal(Array.from(streamDisplayName('😀'.repeat(90))!).length,48);
  assert.equal(streamDisplayName('  Alex\n\u202e Silva  '),'Alex Silva');
  assert.equal(streamTitle(3), 'Transmissão 3');assert.equal(streamTitle(3,'Alex'),'Transmissão de Alex');
  assert.equal(discordText('**@everyone** [x](https://x.test) <@123>'),'\\*\\*@everyone\\*\\* \\[x\\]\\(https://x\\.test\\) \\<@123\\>');
});

test('viewer reports coalesce actual SDK state, retry without interrupting media, and never send idle/selection intent',async()=>{
  let actual:Viewing|null=null;const sent:Viewing[]=[];let fail=false;
  const reporter=viewingReporter(()=>actual,async value=>{if(fail)throw Error('offline');sent.push({...value});});
  await reporter.sync();assert.equal(sent.length,0);
  actual={connectionId:'connection',trackSid:null};await reporter.sync(); // Connected with no subscribed video.
  await reporter.sync();assert.equal(sent.length,1);
  actual={...actual,trackSid:'TR_one'};await reporter.sync();assert.equal(sent.at(-1)!.trackSid,'TR_one');
  actual={...actual,trackSid:'TR_two'};fail=true;await reporter.sync();assert.equal(sent.at(-1)!.trackSid,'TR_one');
  fail=false;await reporter.sync();assert.equal(sent.at(-1)!.trackSid,'TR_two');
  actual={...actual,trackSid:null};await reporter.sync();assert.equal(sent.at(-1)!.trackSid,null);
  actual=null;await reporter.sync();const before=sent.length;reporter.stop();await reporter.sync();assert.equal(sent.length,before);
});

test('only an actually subscribed screen video counts; delayed switching updates cannot overwrite the latest subscription',async()=>{
  const video={source:'screen_share',trackSid:'TR_one',isSubscribed:false,track:undefined as object|undefined};
  assert.equal(confirmedVideoSid(true,[video]),null);video.isSubscribed=true;assert.equal(confirmedVideoSid(true,[video]),null);
  video.track={};assert.equal(confirmedVideoSid(true,[video]),'TR_one');assert.equal(confirmedVideoSid(false,[video]),null);
  assert.equal(confirmedVideoSid(true,[{...video,source:'screen_share_audio'},{...video,source:'camera'}]),null);
  let value:Viewing={connectionId:'connection',trackSid:'TR_one'},release!:()=>void;
  const wait=new Promise<void>(resolve=>{release=resolve;});const sent:Viewing[]=[];
  const reporter=viewingReporter(()=>value,async next=>{sent.push({...next});if(sent.length===1)await wait;});
  const pending=reporter.sync();value={...value,trackSid:'TR_two'};void reporter.sync();release();await pending;
  assert.deepEqual(sent.map(item=>item.trackSid),['TR_one','TR_two']);reporter.stop();
});
