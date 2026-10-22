import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// The one-off registration CLI is intentionally plain Node ESM.
import { registerDiscordCommand, registrationDiagnostic } from '../scripts/register-discord-command.mjs';
test('registration is a single named guild upsert, never a bulk overwrite or permission change',async()=>{
 const env={NODE_ENV:'test' as const,DISCORD_APPLICATION_ID:'100000000000000001',DISCORD_GUILD_ID:'100000000000000002',DISCORD_BOT_TOKEN:'test-only-registration'};
 const calls: string[]=[];
 const request: typeof fetch=async(url,init)=>{calls.push(String(url));assert.equal(init!.method,'POST');assert.deepEqual(JSON.parse(String(init!.body)),{type:1,name:'blueprint',description:'Abrir o espaço privado de transmissão do Blueprint',options:[]});return Response.json({type:1,name:'blueprint',application_id:env.DISCORD_APPLICATION_ID,guild_id:env.DISCORD_GUILD_ID});};
 await registerDiscordCommand(env,request);await registerDiscordCommand(env,request);assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);assert.ok(calls[0].endsWith('/guilds/100000000000000002/commands'));
 await assert.rejects(registerDiscordCommand({...env,DISCORD_BOT_TOKEN:''},request),/DISCORD_BOT_TOKEN/);
});

const diagnosticEnv={NODE_ENV:'test' as const,DISCORD_APPLICATION_ID:'100000000000000001',DISCORD_GUILD_ID:'100000000000000002',DISCORD_BOT_TOKEN:'secret-canary-never-print'};
async function diagnostic(request: typeof fetch) {
 try { await registerDiscordCommand(diagnosticEnv,request);assert.fail('Expected failure'); }
 catch(error) { const output=registrationDiagnostic(error);assert.ok(!output.includes(diagnosticEnv.DISCORD_BOT_TOKEN));assert.ok(!output.includes('Authorization'));return output; }
}
test('registration configuration is documented without publishing operational IDs',()=>{
 const documentation=readFileSync(new URL('../docs/DISCORD.md',import.meta.url),'utf8');
 for(const [key,value] of [['DISCORD_APPLICATION_ID','<application-id>'],['DISCORD_GUILD_ID','<guild-id>']])assert.ok(documentation.includes('`'+key+'`: `'+value+'`'));
 assert.ok(!/`\d{17,20}`/.test(documentation));
});
test('HTTP diagnostics expose only status, numeric code and allowlisted descriptions',async()=>{
 const malicious={code:50001,message:'Authorization: Bot '+diagnosticEnv.DISCORD_BOT_TOKEN,errors:{token:diagnosticEnv.DISCORD_BOT_TOKEN}};
 assert.match(await diagnostic(async()=>Response.json(malicious,{status:403})),/HTTP 403, Discord code 50001.*Missing access/);
 assert.match(await diagnostic(async()=>Response.json({...malicious,code:99999},{status:400})),/HTTP 400, Discord code 99999.*withheld/);
 assert.match(await diagnostic(async()=>Response.json({...malicious,code:diagnosticEnv.DISCORD_BOT_TOKEN},{status:401})),/HTTP 401, Discord code unavailable/);
 assert.match(await diagnostic(async()=>new Response('<html>'+diagnosticEnv.DISCORD_BOT_TOKEN,{status:502})),/HTTP 502.*non-JSON/);
 assert.match(await diagnostic(async()=>Response.json(null)),/HTTP 200.*unexpected command identity/);
});
test('network diagnostics categorize nested failures without printing messages, causes or headers',async()=>{
 for(const [code,expected] of [['ENOTFOUND','DNS resolution'],['UND_ERR_CONNECT_TIMEOUT','timeout'],['SELF_SIGNED_CERT_IN_CHAIN','TLS certificate validation'],['ECONNRESET','connection failure'],['UNKNOWN','network/transport failure']]){
  const output=await diagnostic(async()=>{throw new TypeError(diagnosticEnv.DISCORD_BOT_TOKEN,{cause:new AggregateError([Object.assign(new Error('Authorization '+diagnosticEnv.DISCORD_BOT_TOKEN),{code})])});});
  assert.ok(output.includes(expected));assert.ok(output.includes('no HTTP response'));
 }
 assert.match(registrationDiagnostic(new Error(diagnosticEnv.DISCORD_BOT_TOKEN)),/unexpected local error/);
});
