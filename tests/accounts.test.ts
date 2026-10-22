import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import sharp from 'sharp';
import { accountDb as db, initialized, invite, mail, signSession, configureAccountFixture } from './account-fixture';
import { createAuth, ACCOUNT_COOKIE, SESSION_SECONDS, REMEMBERED_SESSION_SECONDS } from '../src/lib/server/auth';
import { verifySession } from '../src/lib/server/session';
import { accountAuthHandler, accountAuthServices } from '../src/lib/server/account-auth-handlers';
import { issueMedia, revokeSessions, cleanRevokedMedia } from '../src/lib/server/account-media';
import { normalizeAvatar, MAX_AVATAR_BYTES, avatarHandler, avatarServices, cleanAvatars } from '../src/lib/server/avatar';
import { LimitError } from '../src/lib/server/rate-limit';
import { accountHandler, accountServices } from '../src/lib/server/account-handlers';
import { fixtureConfig } from './config-fixture';

test('invite-only registration is guarded in the actual adapter and database; no first visitor owner',async()=>{
  configureAccountFixture();await initialized;
  const auth=createAuth(); const email=`${randomUUID()}@example.test`;
  const context=await auth.$context;
  await assert.rejects(context.internalAdapter.createUser({email,name:'Ana',emailVerified:true}, {method:'email-otp'}));
  await assert.rejects(db.query('INSERT INTO blueprint_user(name,email) VALUES($1,$2)',['Ana',email]),/Invitation required/);
  assert.equal((await db.query('SELECT id FROM blueprint_user WHERE email=$1',[email])).rows.length,0);
  await invite(email);
  await auth.api.sendVerificationOTP({body:{email,type:'sign-in'}});
  const code=mail.get(email)!;
  const stored=await db.query<{value:string}>('SELECT value FROM blueprint_verification WHERE identifier LIKE $1',['%'+email+'%']);
  assert.ok(stored.rows.length);assert.ok(stored.rows.every(row=>!row.value.includes(code)));
  const result=await auth.api.signInEmailOTP({body:{email,otp:code,name:'Ana'},asResponse:true});assert.equal(result.status,200);
  const user=(await db.query<{role:string}>('SELECT role FROM blueprint_user WHERE email=$1',[email])).rows[0];assert.equal(user.role,'member');
  const accepted=(await db.query<{accepted_at:Date}>('SELECT accepted_at FROM blueprint_invitation WHERE email=$1',[email])).rows[0];assert.ok(accepted.accepted_at);
  assert.notEqual((await auth.api.signInEmailOTP({body:{email,otp:code,name:'Ana'},asResponse:true})).status,200);
});
test('expiry and revocation after code delivery still prevent signup; fresh invitation and replay are separate',async()=>{
  for(const kind of ['expired','revoked']){
    const email=`${randomUUID()}@example.test`;await invite(email);const auth=createAuth();await auth.api.sendVerificationOTP({body:{email,type:'sign-in'}});
    if(kind==='expired')await db.query("UPDATE blueprint_invitation SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE email=$1",[email]);
    else await db.query('UPDATE blueprint_invitation SET revoked_at=now() WHERE email=$1',[email]);
    const result=await auth.api.signInEmailOTP({body:{email,otp:mail.get(email)!,name:'Ana'},asResponse:true});assert.notEqual(result.status,200);
    assert.equal((await db.query('SELECT id FROM blueprint_user WHERE email=$1',[email])).rows.length,0);
  }
});
test('OTP expiry and three failed attempts invalidate the code',async()=>{
  for(const mode of ['expiry','attempts']){
    const email=`${randomUUID()}@example.test`;await invite(email);const auth=createAuth();await auth.api.sendVerificationOTP({body:{email,type:'sign-in'}});const otp=mail.get(email)!;
    if(mode==='expiry')await db.query('UPDATE blueprint_verification SET "expiresAt"=now()-interval \'1 second\' WHERE identifier LIKE $1',['%'+email+'%']);
    else for(let index=0;index<3;index++)assert.notEqual((await auth.api.signInEmailOTP({body:{email,otp:otp==='000000'?'111111':'000000',name:'Ana'},asResponse:true})).status,200);
    assert.notEqual((await auth.api.signInEmailOTP({body:{email,otp,name:'Ana'},asResponse:true})).status,200);
  }
});
test('owner bootstrap requires an explicit owner invitation; sole active owner cannot be disabled or removed',async()=>{
  const email=`${randomUUID()}@example.test`;await invite(email,'owner');const auth=createAuth();await auth.api.sendVerificationOTP({body:{email,type:'sign-in'}});
  assert.equal((await auth.api.signInEmailOTP({body:{email,otp:mail.get(email)!,name:'Responsável'},asResponse:true})).status,200);
  const id=(await db.query<{id:string}>('SELECT id FROM blueprint_user WHERE email=$1',[email])).rows[0].id;
  await assert.rejects(db.query("UPDATE blueprint_user SET status='disabled' WHERE id=$1",[id]),/Sole owner/);
  await assert.rejects(db.query('DELETE FROM blueprint_user WHERE id=$1',[id]),/Sole owner/);
});
test('server sessions expire absolutely; remembered and browser-session cookies carry no public token response',async context=>{
  context.mock.method(accountAuthServices,'rateLimit',async()=>{});
  for(const remember of [false,true]){
    const email=`${randomUUID()}@example.test`;await invite(email);await createAuth().api.sendVerificationOTP({body:{email,type:'sign-in'}});
    const request=new NextRequest(fixtureConfig.APP_ORIGIN+'/api/account/verify',{method:'POST',headers:{origin:fixtureConfig.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify({email,otp:mail.get(email),name:'Ana',remember})});
    const response=await accountAuthHandler(request,true);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
    const cookie=response.headers.getSetCookie().find(value=>value.startsWith(ACCOUNT_COOKIE+'='))!;
    for(const flag of [/HttpOnly/i,/Secure/i,/SameSite=strict/i])assert.match(cookie,flag);
    if(remember)assert.match(cookie,/Max-Age=2592000/);else assert.doesNotMatch(cookie,/Max-Age|Expires/);
    const token=cookie.slice(ACCOUNT_COOKIE.length+1).split(';')[0];const session=await verifySession(token);assert.ok(session);
    const row=(await db.query<{seconds:number}>('SELECT EXTRACT(EPOCH FROM ("expiresAt"-"createdAt"))::float AS seconds FROM blueprint_session WHERE id=$1',[session.sessionId])).rows[0];
    assert.ok(Math.abs(row.seconds-(remember?REMEMBERED_SESSION_SECONDS:SESSION_SECONDS))<1);
    await db.query('UPDATE blueprint_session SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',[session.sessionId]);assert.equal(await verifySession(token),null);
  }
});
test('existing active members keep their stable identity across logins, while disabled/revoked sessions are rejected',async()=>{
  const first=await signSession('Ana');const auth=createAuth();await auth.api.sendVerificationOTP({body:{email:first.email,type:'sign-in'}});
  const result=await auth.api.signInEmailOTP({body:{email:first.email,otp:mail.get(first.email)!,name:'Changed client name'},asResponse:true});assert.equal(result.status,200);
  const cookie=result.headers.getSetCookie().find(value=>value.startsWith(ACCOUNT_COOKIE+'='))!;const second=await verifySession(cookie.slice(ACCOUNT_COOKIE.length+1).split(';')[0]);
  assert.equal(second?.identity,first.session.identity);assert.notEqual(second?.sessionId,first.session.sessionId);assert.equal(second?.nickname,'Ana');
  await db.query('UPDATE blueprint_session SET revoked_at=now() WHERE id=$1',[first.session.sessionId]);assert.equal(await verifySession(first.token),null);
  await db.query("UPDATE blueprint_user SET status='disabled' WHERE id=$1",[first.session.identity]);assert.equal(await verifySession(cookie.slice(ACCOUNT_COOKIE.length+1).split(';')[0]),null);
});
test('revocation fences media issuance, removes voice and viewers and retains partial cleanup for retry',async context=>{
  const {session,token}=await signSession('Ana');let fail=true;const removed:string[]=[];
  context.mock.method(RoomServiceClient.prototype,'removeParticipant',async (_room:string,identity:string,options:{revokeTokenTs:bigint})=>{assert.ok(options.revokeTokenTs>BigInt(Math.floor(Date.now()/1000)));if(fail&&identity.endsWith('view'))throw new Error('controlled');removed.push(identity);});
  await issueMedia(session,async()=>true,()=>[{identity:session.identity+':voice',room:'test-voice'},{identity:session.identity+':view',room:'test-screen'}]);
  assert.equal((await revokeSessions(session.identity,session.sessionId)).cleanupPending,true);assert.equal(await verifySession(token),null);
  let issued=false;await assert.rejects(issueMedia(session,async()=>{issued=true;return true;},()=>[]));assert.equal(issued,false);
  fail=false;assert.equal((await cleanRevokedMedia()).cleanupPending,false);assert.equal(removed.length,2);
});
test('migration is repeatable and old sender UUIDs stay unclaimed; new records derive account ownership',async()=>{
  const legacy=(await db.query<{id:string;user_id:null}>("SELECT id,user_id FROM blueprint_chat_messages WHERE body='Legacy fixture'")).rows[0];assert.equal(legacy.user_id,null);
  const {session}=await signSession('Ana');
  await assert.rejects(db.query('SELECT blueprint_chat_delete($1,$2,$3,$4)',['preview',session.identity,legacy.id,'message']));
  await db.exec(await readFile('migrations/004-accounts.sql','utf8'));
  const rows=await db.query<{user_id:string;id:string}>('SELECT * FROM blueprint_chat_put_image($1,$2,$3,$4,$5,$6)',['preview',session.identity,'Ana','Account-owned',randomUUID(),null]);assert.equal(rows.rows[0].user_id,session.identity);
  const other=await signSession('Ana');await assert.rejects(db.query('SELECT blueprint_chat_delete($1,$2,$3,$4)',['preview',other.session.identity,rows.rows[0].id,'message']));
  await assert.rejects(db.query('SELECT * FROM blueprint_chat_put_image($1,$2,$3,$4,$5,$6)',['preview',randomUUID(),'Ana','Unclaimed',randomUUID(),null]),/Account required/);
});
test('avatar validation uses real decoding, strips metadata and respects size/type bounds',async()=>{
  const input=await sharp({create:{width:600,height:300,channels:3,background:'red'}}).jpeg().withMetadata().toBuffer();
  const output=await normalizeAvatar(input,'image/jpeg');const metadata=await sharp(output).metadata();assert.equal(metadata.width,256);assert.equal(metadata.height,256);assert.equal(metadata.exif,undefined);
  await assert.rejects(normalizeAvatar(input,'image/png'));await assert.rejects(normalizeAvatar(Buffer.alloc(MAX_AVATAR_BYTES+1),'image/jpeg'));await assert.rejects(normalizeAvatar(Buffer.from('not an image'),'image/png'));
});
test('generic code response does not reveal membership; rate failures prevent email and reject unexpected fields',async context=>{
  const checks: {kind:string;identifier:string}[]=[];
  context.mock.method(accountAuthServices,'rateLimit',async(_config:typeof fixtureConfig,kind:string,identifier:string)=>{checks.push({kind,identifier});});
  const request=(body:object)=>new NextRequest(fixtureConfig.APP_ORIGIN+'/api/account/code',{method:'POST',headers:{origin:fixtureConfig.APP_ORIGIN,'content-type':'application/json'},body:JSON.stringify(body)});
  const missing=`${randomUUID()}@example.test`;const response=await accountAuthHandler(request({email:missing}));assert.equal(response.status,200);assert.equal(mail.has(missing),false);
  assert.deepEqual(checks.map(item=>item.kind),['login','otp-send']);assert.equal(checks[1].identifier,missing);
  const known=`${randomUUID()}@example.test`;await invite(known);
  const accepted=await accountAuthHandler(request({email:known}));assert.equal(accepted.status,response.status);assert.deepEqual(await accepted.json(),await response.json());assert.ok(mail.has(known));
  assert.equal((await accountAuthHandler(request({email:missing,role:'owner'}))).status,400);
  context.mock.method(accountAuthServices,'rateLimit',async()=>{throw new LimitError(429);});assert.equal((await accountAuthHandler(request({email:missing}))).status,429);
  context.mock.method(accountAuthServices,'rateLimit',async()=>{throw new LimitError(503);});assert.equal((await accountAuthHandler(request({email:missing}))).status,503);
});


test('avatars require a session, replace only its owner reference and retain failed cleanup', async context => {
  const {session,token}=await signSession('Avatar');const other=await signSession('Other');
  process.env.BLOB_READ_WRITE_TOKEN='test-only-private-storage';process.env.BLOB_ENVIRONMENT='preview';
  context.mock.method(avatarServices,'rateLimit',async()=>{});
  context.mock.method(avatarServices,'put',async()=>({}));
  let fails=true;const deleted:string[]=[];
  context.mock.method(avatarServices,'del',async(path:string)=>{if(fails)throw new Error('controlled cleanup');deleted.push(path);});
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:'blue'}}).png().toBuffer();
  const request=(method:string,cookie=token)=>new NextRequest(fixtureConfig.APP_ORIGIN+'/api/account/avatar',{method,headers:{origin:fixtureConfig.APP_ORIGIN,cookie:cookie?ACCOUNT_COOKIE+'='+cookie:'','content-type':'image/png'},body:method==='PUT'?new Uint8Array(bytes):undefined});
  assert.equal((await avatarHandler(request('PUT',''))).status,401);
  assert.equal((await avatarHandler(request('PUT'))).status,200);
  const first=(await db.query<{avatar_id:string}>('SELECT avatar_id FROM blueprint_user WHERE id=$1',[session.identity])).rows[0].avatar_id;
  const replacement=await avatarHandler(request('PUT'));assert.equal(replacement.status,200);assert.equal((await replacement.json()).cleanupPending,true);
  const second=(await db.query<{avatar_id:string}>('SELECT avatar_id FROM blueprint_user WHERE id=$1',[session.identity])).rows[0].avatar_id;assert.notEqual(first,second);
  assert.equal((await db.query<{state:string}>('SELECT state FROM blueprint_avatar WHERE id=$1',[first])).rows[0].state,'deleting');
  assert.equal((await db.query<{avatar_id:null}>('SELECT avatar_id FROM blueprint_user WHERE id=$1',[other.session.identity])).rows[0].avatar_id,null);
  fails=false;assert.equal((await cleanAvatars()).cleanupPending,false);assert.ok(deleted.some(path=>path.endsWith(first+'.webp')));
  assert.equal((await avatarHandler(request('DELETE'))).status,200);assert.equal((await db.query<{avatar_id:null}>('SELECT avatar_id FROM blueprint_user WHERE id=$1',[session.identity])).rows[0].avatar_id,null);
});


test('owner operations reject members and account defaults use versioned, allowlisted updates', async context => {
  context.mock.method(accountServices,'rateLimit',async()=>{});
  const {token,session}=await signSession('Member');
  const request=(body:object)=>new NextRequest(fixtureConfig.APP_ORIGIN+'/api/account',{method:'POST',headers:{origin:fixtureConfig.APP_ORIGIN,cookie:ACCOUNT_COOKIE+'='+token,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await accountHandler(request({action:'invite',email:'someone@example.test'}))).status,403);
  assert.equal((await accountHandler(request({action:'preferences',version:0,preferences:{microphone:'private-device'}}))).status,400);
  assert.equal((await accountHandler(request({action:'preferences',version:0,preferences:{sounds:false}}))).status,200);
  assert.equal((await accountHandler(request({action:'preferences',version:0,preferences:{sounds:true}}))).status,409);
  assert.equal((await db.query<{preferences:{sounds:boolean}}>('SELECT preferences FROM blueprint_user WHERE id=$1',[session.identity])).rows[0].preferences.sounds,false);
  await db.query("UPDATE blueprint_user SET status='disabled' WHERE id=$1",[session.identity]);
  assert.equal((await accountHandler(request({action:'profile',name:'Denied'}))).status,401);
});

test('custom shortcut API persists per authenticated account/platform and preserves legacy bindings',async context=>{
 context.mock.method(accountServices,'rateLimit',async()=>{});
 const first=await signSession('Keys'),second=await signSession('Other');
 const request=(body:object,token=first.token)=>new NextRequest(fixtureConfig.APP_ORIGIN+'/api/account',{method:'POST',headers:{origin:fixtureConfig.APP_ORIGIN,cookie:ACCOUNT_COOKIE+'='+token,'content-type':'application/json'},body:JSON.stringify(body)});
 const old={microphone:'Ctrl+Shift+M',listening:'',all:''};
 await db.query('UPDATE blueprint_user SET preferences=$1 WHERE id=$2',[JSON.stringify({sounds:false,shortcuts:{windows:old}}),first.session.identity]);
 const bindings={microphone:'Alt+F8',listening:'F9',all:'Ctrl+Delete'};
 const body={action:'shortcuts',accountId:first.session.identity,version:0,platform:'windowsDesktop',bindings};
 assert.equal((await accountHandler(request(body,''))).status,401);
 assert.equal((await accountHandler(request(body,second.token))).status,409);
 assert.equal((await accountHandler(request({...body,bindings:{...bindings,all:'F9'}}))).status,400);
 assert.equal((await accountHandler(request(body))).status,200);
 assert.equal((await accountHandler(request(body))).status,409);
 assert.equal((await accountHandler(request({...body,version:1,platform:'browser',bindings:old}))).status,200);
 const saved=(await db.query<{preferences:{sounds:boolean;shortcuts:Record<string,unknown>}}>('SELECT preferences FROM blueprint_user WHERE id=$1',[first.session.identity])).rows[0].preferences;
 assert.equal(saved.sounds,false);assert.deepEqual(saved.shortcuts.windows,old);assert.deepEqual(saved.shortcuts.browser,old);assert.deepEqual(saved.shortcuts.windowsDesktop,bindings);
 assert.deepEqual((await db.query<{preferences:object}>('SELECT preferences FROM blueprint_user WHERE id=$1',[second.session.identity])).rows[0].preferences,{});
});


test('expired sessions with outstanding media leases are rejected without losing cleanup records', async context => {
  const {session,token}=await signSession('Expiry');
  await issueMedia(session,async()=>true,()=>[{identity:session.identity+':expired',room:'expiry-test'}]);
  await db.query(`UPDATE blueprint_session SET "expiresAt"=now()-interval '1 second' WHERE id=$1`,[session.sessionId]);
  assert.equal(await verifySession(token),null);
  assert.equal((await db.query('SELECT identity FROM blueprint_media_lease WHERE session_id=$1',[session.sessionId])).rows.length,1);
  let removed=false;context.mock.method(RoomServiceClient.prototype,'removeParticipant',async()=>{removed=true;});
  await cleanRevokedMedia();assert.equal(removed,true);
});
