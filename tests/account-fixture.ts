import { mock, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { createAuth, ACCOUNT_COOKIE } from '../src/lib/server/auth';
import { verifySession } from '../src/lib/server/session';
import type { Config } from '../src/lib/server/config';
import { fixtureConfig } from './config-fixture';

// Test-process-only SQL adapter. No route, environment flag or bypass is shipped.
export const accountDb = new PGlite();
let tail = Promise.resolve();
mock.method(Pool.prototype, 'connect', async () => {
  let release!: () => void; const previous = tail; tail = new Promise<void>(resolve => { release = resolve; }); await previous;
  return { query: async (query: string, parameters?: unknown[]) => {
    const result = await accountDb.query(query,parameters);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length, command: query.trim().split(/\s/)[0].toUpperCase() };
  }, release };
});
export const mail = new Map<string,string>();
const actualFetch = globalThis.fetch;
mock.method(globalThis,'fetch',async (input: RequestInfo | URL,init?:RequestInit) => {
  if (String(input)==='https://api.resend.com/emails') { const body=JSON.parse(String(init?.body));mail.set(body.to[0],body.text.match(/\d{6}/)[0]);return Response.json({id:randomUUID()}); }
  return actualFetch(input,init);
});
export const initialized = (async()=>{
  for(const name of ['001-chat','002-images','003-message-deletion']) await accountDb.exec(await readFile(`migrations/${name}.sql`,'utf8'));
  await accountDb.query("INSERT INTO blueprint_chat_messages(sender_id,display_name,body,request_id) VALUES($1,'Ana','Legacy fixture',$2)",[randomUUID(),randomUUID()]);
  await accountDb.exec(await readFile('migrations/004-accounts.sql','utf8'));
  await accountDb.query("INSERT INTO blueprint_chat_environment VALUES(true,'preview',1)");
})();
export function configureAccountFixture(config:Config=fixtureConfig) {
  Object.assign(process.env,config,{BETTER_AUTH_SECRET:'account-test-secret-only-at-least-32-characters',RESEND_API_KEY:'re_test-only-not-a-real-resend-secret',RESEND_FROM:'room@example.test',DATABASE_URL:'postgres://fixture:fixture@fixture.neon.tech/fixture?sslmode=require',CHAT_ENVIRONMENT:'preview'});
}
export async function invite(email:string,role='member') {
  await initialized;
  await accountDb.query("INSERT INTO blueprint_invitation(id,email,role,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",[randomUUID(),email,role]);
}
export async function signSession(name:string,config:Config=fixtureConfig,remember=false) {
  configureAccountFixture(config); await initialized;
  const email=`${randomUUID()}@example.test`;await invite(email);
  const auth=createAuth(remember);
  await auth.api.sendVerificationOTP({body:{email,type:'sign-in'}});
  const response=await auth.api.signInEmailOTP({body:{email,otp:mail.get(email)!,name},asResponse:true});
  if(!response.ok)throw new Error('Fixture login failed');
  const cookie=response.headers.getSetCookie().find(value=>value.startsWith(ACCOUNT_COOKIE+'='))!;
  const token=cookie.slice(ACCOUNT_COOKIE.length+1).split(';')[0];
  const session=await verifySession(token,config);if(!session)throw new Error('Fixture session missing');
  return {token,session,email};
}

after(async()=>{ await accountDb.close(); });
