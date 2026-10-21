import test from 'node:test';
import assert from 'node:assert/strict';
// The one-off registration CLI is intentionally plain Node ESM.
import { registerDiscordCommand } from '../scripts/register-discord-command.mjs';
test('registration is a single named guild upsert, never a bulk overwrite or permission change',async()=>{
 const env={NODE_ENV:'test' as const,DISCORD_APPLICATION_ID:'1562592101659836516',DISCORD_GUILD_ID:'466392379667120129',DISCORD_BOT_TOKEN:'test-only-registration'};
 const calls: string[]=[];
 const request: typeof fetch=async(url,init)=>{calls.push(String(url));assert.equal(init!.method,'POST');assert.deepEqual(JSON.parse(String(init!.body)),{type:1,name:'blueprint',description:'Abrir o espaço privado de transmissão do Blueprint',options:[]});return Response.json({type:1,name:'blueprint',application_id:env.DISCORD_APPLICATION_ID,guild_id:env.DISCORD_GUILD_ID});};
 await registerDiscordCommand(env,request);await registerDiscordCommand(env,request);assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);assert.ok(calls[0].endsWith('/guilds/466392379667120129/commands'));
 await assert.rejects(registerDiscordCommand({...env,DISCORD_BOT_TOKEN:''},request),/DISCORD_BOT_TOKEN/);
});
