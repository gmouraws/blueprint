import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { discordHandler, discordServices } from '../src/lib/server/discord-interactions';
import { fixtureConfig } from './config-fixture';
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const env = { NODE_ENV: 'test' as const, DISCORD_APPLICATION_ID: '1562592101659836516', DISCORD_PUBLIC_KEY: publicKey, DISCORD_GUILD_ID: '466392379667120129', DISCORD_ALLOWED_CHANNEL_IDS: '1562594072282271744' };
const payload = { id: '123456789012345678', type: 2, application_id: env.DISCORD_APPLICATION_ID, guild_id: env.DISCORD_GUILD_ID, channel_id: env.DISCORD_ALLOWED_CHANNEL_IDS, token: 'test-only-interaction-token', member: { user: { id: '123456789012345679' } }, data: { name: 'blueprint', type: 1 } };
const panelOpenId = 'blueprint:panel:open:v1', panelPublishId = 'blueprint:panel:publish:v1';
const button = (custom_id = panelOpenId, permissions?: string) => ({ ...payload, type: 3, data: { component_type: 2, custom_id }, member: { ...payload.member, permissions } });
function request(body: object = payload, age = 0) { const raw = JSON.stringify(body), timestamp = String(Math.floor(Date.now()/1000)-age);return new Request('https://www.blueprint.app.br/api/discord/interactions',{method:'POST',headers:{'x-signature-timestamp':timestamp,'x-signature-ed25519':sign(null,Buffer.from(timestamp+raw),keys.privateKey).toString('hex')},body:raw}); }
function fixture() {
 const jobs: (()=>Promise<void>)[] = [], sent: { url: string; body: Record<string, unknown> }[]=[];let reads=0;
 const deps: typeof discordServices={...discordServices,env:()=>env,getConfig:()=>({...fixtureConfig,APP_ORIGIN:'https://www.blueprint.app.br'}),rateLimit:async()=>undefined,claim:async()=>true,streamService:()=>({...discordServices.streamService(fixtureConfig),discordLinks:async()=>{reads++;return {share:'s'.repeat(43),watch:'w'.repeat(43)};}}),fetch:async(input: string | URL | Request,init?: RequestInit)=>{sent.push({url:String(input),body:JSON.parse(String(init?.body))});return new Response('{}');}};
 return {deps,jobs,sent,schedule:(work:()=>Promise<void>)=>jobs.push(work),reads:()=>reads};
}
test('Discord verifies exact raw Ed25519 signatures, PING and freshness before any data access',async()=>{
 const h=fixture();assert.deepEqual(await (await discordHandler(request({type:1}),h.schedule,h.deps)).json(),{type:1});
 const unsigned=new Request('https://example.test',{method:'POST',body:JSON.stringify(payload)});assert.equal((await discordHandler(unsigned,h.schedule,h.deps)).status,401);
 for(const age of [301,-301])assert.equal((await discordHandler(request(payload,age),h.schedule,h.deps)).status,401);
 const valid=request();const modified=new Request(valid.url,{method:'POST',headers:valid.headers,body:JSON.stringify({...payload,channel_id:'123456789012345678'})});assert.equal((await discordHandler(modified,h.schedule,h.deps)).status,401);
 assert.equal(h.jobs.length,0);assert.equal(h.reads(),0);
});
test('only configured guild/channel receives deferred ephemeral response; provider I/O runs after acknowledgement',async()=>{
 const h=fixture();for(const body of [{...payload,guild_id:'123456789012345678'},{...payload,channel_id:'123456789012345678'},{...payload,guild_id:undefined},{...payload,application_id:'123456789012345678'}]){const result=await (await discordHandler(request(body),h.schedule,h.deps)).json();assert.equal(result.type,4);assert.equal(result.data.flags,64);assert.ok(!JSON.stringify(result).includes('#invite='));}
 assert.equal(h.jobs.length,0);
 const response=await discordHandler(request(),h.schedule,h.deps);assert.deepEqual(await response.json(),{type:5,data:{flags:64}});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(h.reads(),0);
 await h.jobs[0]();assert.equal(h.reads(),1);assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0].body.allowed_mentions,{parse:[]});
 const body=JSON.stringify(h.sent[0].body);assert.ok(body.includes('intent=share#invite='+'s'.repeat(43)));assert.ok(body.includes('intent=watch#invite='+'w'.repeat(43)));assert.ok(!body.includes('blueprint-room://'));assert.ok(!body.includes(panelPublishId));
});
test('missing invitation, replay and dependency failure never expose publishing links or create invitations',async()=>{
 const h=fixture();h.deps.streamService=()=>({...discordServices.streamService(fixtureConfig),discordLinks:async()=>null});
 await discordHandler(request(),h.schedule,h.deps);await h.jobs[0]();assert.ok(!JSON.stringify(h.sent).includes('#invite='));
 h.deps.claim=async()=>false;await discordHandler(request(),h.schedule,h.deps);await h.jobs[1]();assert.equal(h.sent.length,1);
 h.deps.claim=async()=>{throw Error('provider-secret-canary');};await discordHandler(request(),h.schedule,h.deps);await h.jobs[2]();assert.ok(!JSON.stringify(h.sent).includes('provider-secret-canary'));assert.ok(!JSON.stringify(h.sent).includes('#invite='));
});
test('missing optional configuration fails closed without scheduling or exposing values',async()=>{
 const h=fixture();h.deps.env=()=>({...env,DISCORD_PUBLIC_KEY:''});assert.equal((await discordHandler(request(),h.schedule,h.deps)).status,503);assert.equal(h.jobs.length,0);
});

test('only Discord administrators see setup; explicit publication creates a non-secret public panel',async()=>{
 const h=fixture();
 await discordHandler(request({...payload,member:{...payload.member,permissions:'8'}}),h.schedule,h.deps);await h.jobs[0]();
 assert.ok(JSON.stringify(h.sent[0].body).includes(panelPublishId));assert.ok(JSON.stringify(h.sent[0].body).includes('intent=share#invite='));
 const acknowledgement=await discordHandler(request(button(panelPublishId,'8')),h.schedule,h.deps);
 assert.deepEqual(await acknowledgement.json(),{type:5});assert.equal(h.sent.length,1);assert.equal(h.reads(),1);
 await h.jobs[1]();assert.equal(h.reads(),1);assert.equal(h.sent.length,2);
 const panel=h.sent[1].body;
 assert.equal(panel.content,'Blueprint — compartilhe sua tela com a galera\nClique abaixo para transmitir ou assistir.');
 assert.deepEqual(panel.components,[{type:1,components:[{type:2,style:1,label:'🎥 Abrir Blueprint',custom_id:panelOpenId}]}]);
 assert.deepEqual(panel.allowed_mentions,{parse:[]});assert.ok(!JSON.stringify(panel).includes('#invite='));assert.ok(!JSON.stringify(panel).includes('url'));
 assert.ok(h.sent.every(call=>call.url.endsWith('/messages/@original')));
});

test('publish authorization is rechecked at click time and component routes retain guild/channel/signature boundaries',async()=>{
 const h=fixture();
 for(const permissions of [undefined,'0','32','2048']){
  const denied=await (await discordHandler(request(button(panelPublishId,permissions)),h.schedule,h.deps)).json();
  assert.equal(denied.type,4);assert.equal(denied.data.flags,64);assert.match(denied.data.content,/administradores/);
 }
 for(const body of [
  {...button(),guild_id:'123456789012345678'}, {...button(),channel_id:'123456789012345678'},
  {...button(),application_id:'123456789012345678'}, {...button(),guild_id:undefined},
  button('unknown:component'), {...button(),data:{component_type:3,custom_id:panelOpenId}},
  {...button(panelPublishId,'8'),channel_id:'123456789012345678'}, button(panelPublishId,'not-a-permission'),
 ]){
  const denied=await (await discordHandler(request(body),h.schedule,h.deps)).json();assert.equal(denied.type,4);assert.equal(denied.data.flags,64);
 }
 const signed=request(button());
 const tampered=new Request(signed.url,{method:'POST',headers:signed.headers,body:JSON.stringify(button(panelPublishId,'8'))});
 assert.equal((await discordHandler(tampered,h.schedule,h.deps)).status,401);
 assert.equal((await discordHandler(request(button(),301),h.schedule,h.deps)).status,401);
 assert.equal(h.jobs.length,0);assert.equal(h.reads(),0);assert.equal(h.sent.length,0);
});

test('panel opens privately resolve the current invitation on every click, including rotation and revocation',async()=>{
 const h=fixture();let current: {share:string;watch:string}|null={share:'s'.repeat(43),watch:'w'.repeat(43)};let reads=0;
 h.deps.streamService=()=>({...discordServices.streamService(fixtureConfig),discordLinks:async()=>{reads++;return current;}});
 for(const next of [current,{share:'n'.repeat(43),watch:'v'.repeat(43)},null]){
  current=next;
  const acknowledgement=await discordHandler(request(button()),h.schedule,h.deps);
  assert.deepEqual(await acknowledgement.json(),{type:5,data:{flags:64}});
  await h.jobs.at(-1)!();const body=JSON.stringify(h.sent.at(-1)!.body);
  if(next){assert.ok(body.includes('intent=share#invite='+next.share));assert.ok(body.includes('intent=watch#invite='+next.watch));assert.ok(body.includes('No Windows'));}
  else{assert.ok(body.includes('Transmissão indisponível'));assert.deepEqual(h.sent.at(-1)!.body.components,[]);}
  if(next?.share!=='s'.repeat(43))assert.ok(!body.includes('s'.repeat(43)));
  assert.ok(!body.includes(panelPublishId));
 }
 assert.equal(reads,3);
});

test('panel actions share existing replay/rate limits and fail closed without leaking errors or links',async()=>{
 for(const body of [button(),button(panelPublishId,'8')]){
  const h=fixture();let limits=0;
  h.deps.rateLimit=async(_config,kind,identifier)=>{assert.equal(kind,'discord-command');assert.equal(identifier,env.DISCORD_GUILD_ID+':'+payload.member.user.id);limits++;};
  h.deps.claim=async()=>false;await discordHandler(request(body),h.schedule,h.deps);await h.jobs[0]();
  assert.equal(limits,1);assert.equal(h.sent.length,0);assert.equal(h.reads(),0);
  h.deps.claim=async()=>true;h.deps.rateLimit=async()=>{throw Error('private-provider-error-canary');};
  await discordHandler(request(body),h.schedule,h.deps);await h.jobs[1]();
  assert.equal(h.reads(),0);assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0].body.components,[]);
  assert.ok(!JSON.stringify(h.sent[0].body).includes('private-provider-error-canary'));assert.ok(!JSON.stringify(h.sent[0].body).includes('#invite='));
 }
});

test('only signed allowed interactions forward sanitized Discord names to individual tickets',async()=>{
 const h=fixture();const names:(string|undefined)[]=[];
 h.deps.streamService=()=>({...discordServices.streamService(fixtureConfig),discordLinks:async name=>{names.push(name);return {share:'s'.repeat(43),watch:'w'.repeat(43)};}});
 for(const member of [{...payload.member,nick:'Server\u0000 Name',user:{...payload.member.user,global_name:'Display',username:'user'}},{...payload.member,nick:null,user:{...payload.member.user,global_name:'Display',username:'user'}},{...payload.member,user:{...payload.member.user,username:'user'}}]){
  await discordHandler(request({...payload,member}),h.schedule,h.deps);await h.jobs.at(-1)!();
 }
 assert.deepEqual(names,['Server Name','Display','user']);
 for(const sent of h.sent){const text=JSON.stringify(sent.body);assert.ok(!text.includes(payload.member.user.id));assert.ok(!text.includes('Server'));assert.ok(!text.includes('Display'));}
});
