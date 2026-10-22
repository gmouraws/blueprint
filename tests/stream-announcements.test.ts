import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { announcementService, END_GRACE_MS, type Publication, type AnnouncementStore } from '../src/lib/server/stream-announcements';
import { streamService, streamRoom } from '../src/lib/server/stream-space';
import { streamEventHandler } from '../src/lib/server/stream-events';
import { fixtureConfig } from './config-fixture';
function fixture(name?: string) {
 const rows: Publication[]=[];let clock=100000, mode='ok', active=true, authorized=true, identity='stream:test';
 const calls:{method:string;url:string;body:Record<string,unknown>}[]=[];
 let serial=Promise.resolve();
 const store:AnnouncementStore={update:work=>{const result=serial.then(()=>work(rows));serial=result.then(()=>undefined,()=>undefined);return result;}};
 const service={...streamService(fixtureConfig),publicationSnapshot:async()=>active?[{key:'guest-hash',label:1,name,identity,authorized,legacy:false}]:[],announcementViewer:async()=>({id:randomUUID(),secret:'w'.repeat(43),expires:clock+3600000,role:'watch' as const})};
 const request:typeof fetch=async(url,init)=>{calls.push({method:init!.method!,url:String(url),body:JSON.parse(String(init!.body))});if(mode==='network')throw Error('secret-network-canary');if(mode==='rate'){mode='ok';return Response.json({retry_after:1},{status:429});}if(mode==='edit-failure'&&init!.method==='PATCH'){mode='ok';return new Response(null,{status:503});}return Response.json({id:'123456789012345678'});};
 const api=announcementService(fixtureConfig,store,service,request,()=>clock,'https://discord.com/api/webhooks/123/test-only');
 return {rows,calls,api,tick:(ms:number)=>clock+=ms,active:(value:boolean)=>active=value,authorized:(value:boolean)=>authorized=value,identity:(value:string)=>identity=value,mode:(value:string)=>mode=value};
}
test('one publication start/end across duplicate wakeups, reconnects and replacements; original link is removed',async()=>{
 const h=fixture();await Promise.all([h.api.reconcile(),h.api.reconcile()]);assert.equal(h.calls.length,1);assert.ok(h.rows[0].messageId);
 assert.match(String(h.calls[0].body.content),/intent=watch#invite=/);assert.deepEqual(h.calls[0].body.allowed_mentions,{parse:[]});
 h.active(false);assert.equal((await h.api.reconcile()).wait,END_GRACE_MS);h.tick(5000);h.active(true);h.identity('stream:reconnected');await h.api.reconcile();assert.equal(h.calls.length,1);
 await h.api.reconcile();assert.equal(h.rows[0].ended,undefined);
 h.active(false);await h.api.reconcile();h.tick(END_GRACE_MS);await Promise.all([h.api.reconcile(),h.api.reconcile()]);
 assert.equal(h.calls.filter(c=>c.method==='POST').length,2);assert.equal(h.calls.filter(c=>c.method==='POST'&&c.body.content==='Transmissão 1 encerrada').length,1);
 const edit=h.calls.find(c=>c.method==='PATCH')!;assert.ok(edit.url.endsWith('/messages/123456789012345678'));assert.equal(edit.body.content,'Transmissão 1 encerrada');assert.deepEqual(edit.body.components,[]);assert.ok(!JSON.stringify(edit.body).includes('#invite='));
 await h.api.reconcile();assert.equal(h.calls.filter(c=>c.method==='POST').length,2);
 h.active(true);await h.api.reconcile();assert.equal(h.calls.filter(c=>c.method==='POST').length,3);
});
test('rate-limit retry is safe; ambiguous POST is not repeated; failed edits are retried without duplicate end posts',async()=>{
 const h=fixture();h.mode('rate');assert.equal((await h.api.reconcile()).pending,true);await h.api.reconcile();assert.equal(h.calls.length,1);h.tick(1001);await h.api.reconcile();assert.equal(h.calls.length,2);
 h.active(false);await h.api.reconcile();h.tick(END_GRACE_MS);h.mode('edit-failure');assert.equal((await h.api.reconcile()).pending,true);await h.api.reconcile();assert.equal(h.calls.filter(c=>c.method==='POST'&&c.body.content==='Transmissão 1 encerrada').length,1);assert.equal(h.rows[0].edited,true);
 const unknown=fixture();unknown.mode('network');await unknown.api.reconcile();await unknown.api.reconcile();assert.equal(unknown.calls.length,1);assert.equal(unknown.rows[0].start,'uncertain');assert.ok(!JSON.stringify(unknown.rows).includes('secret-network-canary'));
});
test('revocation only ends a provider-confirmed absence; unknown or unauthorized publishers cannot create announcements',async()=>{
 const h=fixture();await h.api.reconcile();h.authorized(false);await h.api.reconcile();assert.equal(h.rows[0].ended,undefined);h.active(false);await h.api.reconcile();h.tick(END_GRACE_MS);await h.api.reconcile();assert.ok(h.rows[0].ended);
 const other=fixture();other.authorized(false);await other.api.reconcile();assert.equal(other.calls.length,0);
});

test('Discord start/edit/end preserve the session label, escape formatting and suppress all mentions',async()=>{
 const h=fixture('**Alex** <@123> @everyone\n');await h.api.reconcile();
 assert.match(String(h.calls[0].body.content),/Transmissão de \\\*\\\*Alex/);assert.ok(!String(h.calls[0].body.content).includes('\n'));
 h.active(false);await h.api.reconcile();h.tick(END_GRACE_MS);await h.api.reconcile();
 for(const call of h.calls){assert.deepEqual(call.body.allowed_mentions,{parse:[]});assert.ok(String(call.body.content).includes('Alex'));assert.ok(!String(call.body.content).includes('**Alex**'));}
 assert.equal(h.calls.filter(call=>call.method==='POST').length,2);
});
test('LiveKit webhook verifies JWT plus exact body; other rooms do not trigger reconciliation; failures request retry',async()=>{
 let reconciled=0;let fail=false;
 const deps={getConfig:()=>fixtureConfig,settle:async()=>{reconciled++;if(fail)throw Error('provider-canary');}};
 async function request(room=streamRoom(fixtureConfig),tamper=false) {const body=JSON.stringify({event:'track_unpublished',room:{name:room},id:'test-event'});const token=new AccessToken(fixtureConfig.LIVEKIT_API_KEY,fixtureConfig.LIVEKIT_API_SECRET,{ttl:60});token.sha256=createHash('sha256').update(body).digest('base64');return new Request('https://example.test',{method:'POST',headers:{authorization:await token.toJwt()},body:tamper?body+' ':body});}
 assert.equal((await streamEventHandler(new Request('https://example.test',{method:'POST'}),deps)).status,401);
 assert.equal((await streamEventHandler(await request(undefined,true),deps)).status,401);assert.equal(reconciled,0);
 assert.equal((await streamEventHandler(await request('member-room'),deps)).status,204);assert.equal(reconciled,0);
 assert.equal((await streamEventHandler(await request(),deps)).status,204);assert.equal(reconciled,1);
 fail=true;assert.equal((await streamEventHandler(await request(),deps)).status,503);
});
