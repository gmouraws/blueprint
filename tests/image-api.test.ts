import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { fixtureConfig as config } from './config-fixture';
import { imageHandlers, imageServices } from '../src/lib/server/image-handlers';
import { signSession } from './account-fixture';
import { COOKIE_NAME } from '../src/lib/server/session';
import { LimitError } from '../src/lib/server/rate-limit';
const id = randomUUID();
function request(token?: string, body?: object, origin = config.APP_ORIGIN) {
  return new NextRequest(config.APP_ORIGIN + '/api/attachments', {method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(token?{cookie:COOKIE_NAME+'='+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
test('image endpoints require a valid session and exact origin before touching storage', async () => {
  let touched = false;
  const deps = {...imageServices,getConfig:()=>config,rateLimit:async()=>{touched=true;},downloadImage:async()=>{touched=true;return null;}};
  const api = imageHandlers(deps);
  const {token} = await signSession('Ana',config);
  for(const value of [undefined,token+'x']) {
    assert.equal((await api(request(value),id)).status,401);
    assert.equal((await api(request(value,{action:'complete',id}))).status,401);
  }
  assert.equal((await api(request(token,undefined,'https://untrusted.test'),id)).status,403);

  assert.equal(touched,false);
});
test('image routes bound input, rate-limit writes and never expose provider errors',async()=>{
  const {token}=await signSession('Ana',config);
  const deps={...imageServices,getConfig:()=>config,rateLimit:async()=>{}};
  const api=imageHandlers(deps);
  for(const body of [{action:'prepare',requestId:id,contentType:'image/svg+xml',size:12},{action:'prepare',requestId:id,contentType:'image/png',size:5242881},{action:'complete',id,owner:id}]) assert.equal((await api(request(token,body))).status,400);
  const limited=imageHandlers({...deps,rateLimit:async()=>{throw new LimitError(429);}});
  assert.equal((await limited(request(token,{action:'complete',id}))).status,429);
  const offline=imageHandlers({...deps,downloadImage:async()=>{throw new Error('provider-secret-canary');}});
  const response=await offline(request(token),id); assert.equal(response.status,503); assert.ok(!(await response.text()).includes('provider-secret-canary'));
  const absent=imageHandlers({...deps,downloadImage:async()=>null}); assert.equal((await absent(request(token),id)).status,404);
});
