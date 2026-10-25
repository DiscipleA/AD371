import test from 'node:test';
import assert from 'node:assert/strict';

// Controlled external Auth/PostgREST boundaries only. These are NOT live Supabase tests.
const moduleURL = new URL('../supabase/functions/_shared/gatekeeper.mjs', import.meta.url);
const env = { SUPABASE_URL: 'https://approved-project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_controlled_fixture', ALLOWED_ORIGINS: 'http://localhost:4173,https://showcase.example' };
const id = '12345678-1234-4234-8234-123456789abc';
const email = 'controlled@example.test';
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb250cm9sbGVkIn0.signature';
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type':'application/json'}});
const profile = (role = 'User') => ({id, email, role});
const success = (resource = 'user', role = 'User') => ({ status:200, body:{resource, message:'OK', user:profile(role), data: resource === 'admin' ? {briefing:'Trusted non-PII briefing.'} : {scope:'own-account'}} });
async function setup(replies = [], options = {}) {
  const { createHandler } = await import(moduleURL);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url:String(url), init});
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply(url, init);
    if (!reply) throw new Error('Unexpected external request');
    return reply;
  };
  return {handler:createHandler({env, fetchImpl, ...options}), calls};
}
function request(resource = 'user', {authorized = true, origin = 'http://localhost:4173', method = 'GET', query, headers = {}} = {}) {
  const h = new Headers(headers);
  if (authorized) h.set('authorization', `Bearer ${token}`);
  if (origin !== null) h.set('origin', origin);
  return new Request(`https://edge.example/functions/v1/gatekeeper?${query ?? `resource=${resource}`}`, {method, headers:h});
}

test('public needs no JWT or upstream calls and has security headers', async () => {
  const {handler,calls} = await setup(); const res = await handler(request('public',{authorized:false}));
  assert.equal(res.status,200); assert.equal((await res.json()).resource,'public'); assert.equal(calls.length,0);
  assert.equal(res.headers.get('cache-control'),'no-store'); assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'),'http://localhost:4173');
  assert.match(res.headers.get('vary'),/Origin/i);
});
test('User 200 uses Auth then same bearer-scoped RPC, never Auth metadata role', async () => {
  const {handler,calls} = await setup([json({id,email,user_metadata:{role:'Admin'},app_metadata:{role:'Admin'}}),json(success())]);
  const res = await handler(request()); assert.equal(res.status,200); assert.equal((await res.json()).user.role,'User');
  assert.deepEqual(calls.map(c=>c.url),[`${env.SUPABASE_URL}/auth/v1/user`,`${env.SUPABASE_URL}/rest/v1/rpc/gatekeeper_resource`]);
  for (const c of calls) { assert.equal(c.init.headers.Authorization,`Bearer ${token}`); assert.equal(c.init.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY); assert.equal(c.init.redirect,'error'); assert.ok(c.init.signal instanceof AbortSignal); }
  assert.equal(calls[0].init.method,'GET'); assert.equal(calls[1].init.method,'POST'); assert.deepEqual(JSON.parse(calls[1].init.body),{p_resource:'user'});
});
test('Admin 200 comes from private-role RPC only',async()=>{
  const {handler}=await setup([json({id,email}),json(success('admin','Admin'))]); const res=await handler(request('admin'));
  assert.equal(res.status,200); const body=await res.json(); assert.equal(body.user.role,'Admin'); assert.equal(body.data.briefing,'Trusted non-PII briefing.');
});
test('missing and malformed bearer fail 401 before external calls', async()=>{
  for (const authorization of ['', 'Basic secret','Bearer bad','Bearer a.b.c extra']) {
    const {handler,calls}=await setup(); const res=await handler(request('user',{authorized:false,headers:authorization ? {authorization} : {}}));
    assert.equal(res.status,401); assert.equal(calls.length,0);
  }
});
test('forged compact JWT rejected by Auth before RPC',async()=>{
  const {handler,calls}=await setup([json({error:'invalid signature',access_token:'sensitive'},401)]);
  const res=await handler(request()); assert.equal(res.status,401); assert.equal(calls.length,1); assert.deepEqual(await res.json(),{error:'Authentication required.'});
});
test('User requesting admin gets 403; metadata and header spoof cannot elevate',async()=>{
  const {handler,calls}=await setup([json({id,email,user_metadata:{role:'Admin'}}),json({status:403,body:{error:'private upstream detail'}})]);
  const res=await handler(request('admin',{headers:{'x-role':'Admin'}})); assert.equal(res.status,403);
  assert.deepEqual(JSON.parse(calls[1].init.body),{p_resource:'admin'}); assert.deepEqual(await res.json(),{error:'Access denied.'});
});
test('stale/revoked session from independent RPC check maps 401',async()=>{
  const {handler}=await setup([json({id,email}),json({status:401,body:{error:'Session revoked',session_id:'secret'}})]);
  const res=await handler(request()); assert.equal(res.status,401); assert.deepEqual(await res.json(),{error:'Authentication required.'});
});
test('strict resource query rejects duplicates, unknown keys, tokens and role injection',async()=>{
  for (const query of ['','resource=','resource=PUBLIC','resource=bad','resource=user&resource=admin','resource=user&role=Admin','resource=user&access_token=secret','resource=user&jwt=secret']) {
    const {handler,calls}=await setup(); const res=await handler(request('user',{query})); assert.equal(res.status,400,query); assert.equal(calls.length,0);
  }
});
test('non-GET methods fail 405 and declare Allow',async()=>{
  for (const method of ['POST','PUT','DELETE','HEAD']) { const {handler,calls}=await setup(); const res=await handler(request('public',{method})); assert.equal(res.status,405); assert.equal(res.headers.get('allow'),'GET, OPTIONS'); assert.equal(calls.length,0); }
});
test('exact CORS allowlist denies null, suffix and arbitrary origins without echo',async()=>{
  for (const origin of ['null','https://showcase.example.evil.test','https://evil.test','http://localhost:4174']) {
    const {handler,calls}=await setup(); const res=await handler(request('public',{origin})); assert.equal(res.status,403); assert.equal(res.headers.get('access-control-allow-origin'),null); assert.equal(calls.length,0);
  }
  const {handler}=await setup(); assert.equal((await handler(request('public',{origin:null}))).status,200);
});
test('preflight permits only configured origin GET and known headers',async()=>{
  const {handler,calls}=await setup();
  const options=(extra={})=>request('public',{method:'OPTIONS',headers:{'access-control-request-method':'GET','access-control-request-headers':'authorization, apikey, content-type, x-client-info',...extra}});
  const res=await handler(options()); assert.equal(res.status,204); assert.equal(await res.text(),''); assert.equal(res.headers.get('access-control-allow-methods'),'GET, OPTIONS'); assert.equal(calls.length,0);
  assert.equal((await handler(options({'access-control-request-method':'POST'}))).status,405);
  assert.equal((await handler(options({'access-control-request-headers':'x-role'}))).status,400);
  assert.equal((await handler(request('public',{method:'OPTIONS',origin:null}))).status,403);
});
test('invalid environment fails closed without upstream traffic',async()=>{
  for (const changes of [ {SUPABASE_URL:''},{SUPABASE_URL:'http://remote.example'},{SUPABASE_URL:'https://u:p@remote.example'},{SUPABASE_URL:'https://remote.example/path'},{SUPABASE_URL:'https://remote.example?secret=x'},{SUPABASE_PUBLISHABLE_KEY:''},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_forbidden'},{ALLOWED_ORIGINS:'*'},{ALLOWED_ORIGINS:''},{ALLOWED_ORIGINS:'https://showcase.example/path'},{ALLOWED_ORIGINS:'http://remote.example'} ]) {
    const {handler,calls}=await setup([],{env:{...env,...changes}}); assert.equal((await handler(request('public'))).status,503,JSON.stringify(changes)); assert.equal(calls.length,0);
  }
});
test('hosted plural publishable-key dictionary uses its validated default key',async()=>{
 const {handler,calls}=await setup([json({id,email}),json(success())],{env:{...env,SUPABASE_PUBLISHABLE_KEY:undefined,SUPABASE_ANON_KEY:undefined,SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_hosted_default'})}});
 assert.equal((await handler(request())).status,200);
 assert.equal(calls[0].init.headers.apikey,'sb_publishable_hosted_default');
});
test('invalid hosted key dictionaries fail closed',async()=>{
 for(const dictionary of ['{','{}','[]','{"other":"sb_publishable_other"}','{"default":"sb_secret_forbidden"}','{"default":7}']) {
  const {handler,calls}=await setup([],{env:{...env,SUPABASE_PUBLISHABLE_KEY:undefined,SUPABASE_ANON_KEY:undefined,SUPABASE_PUBLISHABLE_KEYS:dictionary}});
  assert.equal((await handler(request('public'))).status,503);assert.equal(calls.length,0);
 }
});
test('empty hosted dictionary never falls back to a coexisting valid anon key',async()=>{
 const anon='e30.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';
 const {handler,calls}=await setup([],{env:{...env,SUPABASE_PUBLISHABLE_KEY:undefined,SUPABASE_ANON_KEY:anon,SUPABASE_PUBLISHABLE_KEYS:'{"default":""}'}});
 assert.equal((await handler(request('public'))).status,503);assert.equal(calls.length,0);
});
test('localhost CLI URLs and fallback anon key are accepted',async()=>{
  const {handler}=await setup([],{env:{...env,SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_PUBLISHABLE_KEY:undefined,SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature'}});
  assert.equal((await handler(request('public'))).status,200);
});
test('Auth unavailable/network errors and malformed identity fail closed',async()=>{
  for (const reply of [json({error:'secret'},500),json({error:'rate-limited'},429),new Error('secret token'),new Response('not JSON'),json({id:'wrong',email}),json({id,email:null})]) {
    const {handler,calls}=await setup([reply]); const res=await handler(request()); assert.equal(res.status,503); assert.equal(calls.length,1); assert.deepEqual(await res.json(),{error:'Service unavailable.'});
  }
});
test('RPC unavailable and malformed envelopes never expose upstream payload',async()=>{
  for (const reply of [json({error:'secret'},500),json({error:'secret'},404),new Error('secret'),json({status:201,body:{}}),json({status:200,body:{...success().body,user:{...profile(),id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}}),json(success('admin','User')),new Response('not JSON')]) {
    const {handler}=await setup([json({id,email}),reply]); const res=await handler(request()); assert.equal(res.status,503); assert.deepEqual(await res.json(),{error:'Service unavailable.'});
  }
});
test('response allowlist removes password/hash/token/metadata fields at every layer',async()=>{
  const dangerous={...success(),secret:'upstream-secret',body:{...success().body,message:'password=upstream-secret',password:'upstream-secret',access_token:'upstream-secret',user:{...profile(),encrypted_password:'upstream-secret',user_metadata:{role:'Admin'}},data:{scope:'own-account',password:'upstream-secret',rows:[{email:'other-user'}]}}};
  const {handler}=await setup([json({id,email,encrypted_password:'upstream-secret'}),json(dangerous)]); const res=await handler(request()); assert.equal(res.status,200); const body=await res.json(); assert.deepEqual(Object.keys(body).sort(),['data','message','resource','user']); assert.deepEqual(body.user,profile()); assert.deepEqual(body.data,{scope:'own-account'}); assert.doesNotMatch(JSON.stringify(body),/upstream-secret|other-user|metadata|password|token/);
});
test('legacy service-role or malformed key cannot be accepted as anon environment credential',async()=>{
  for (const payload of [{role:'service_role'},{role:'authenticated'},{role:'Admin'},{}]) {
    const configuredKey=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
    const {handler,calls}=await setup([],{env:{...env,SUPABASE_PUBLISHABLE_KEY:undefined,SUPABASE_ANON_KEY:configuredKey}});
    assert.equal((await handler(request('public'))).status,503); assert.equal(calls.length,0);
  }
});
test('Admin success cannot be paired with User role even when resource matches',async()=>{
  const {handler}=await setup([json({id,email}),json(success('admin','User'))]); assert.equal((await handler(request('admin'))).status,503);
});
test('RPC email mismatch fails closed instead of returning a different identity',async()=>{
  const reply=success(); reply.body.user.email='other@example.test';
  const {handler}=await setup([json({id,email}),json(reply)]); assert.equal((await handler(request())).status,503);
});
test('Auth fetch has timeout and aborts rather than hanging',async()=>{
  let signal; const {handler}=await setup([(_url,init)=>{signal=init.signal; return new Promise(()=>{});} ],{timeoutMs:15});
  const res=await handler(request()); assert.equal(res.status,503); assert.equal(signal.aborted,true);
});
test('RPC body consumption also times out',async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}});
  const {handler}=await setup([json({id,email}),new Response(stream)],{timeoutMs:15}); assert.equal((await handler(request())).status,503);
});
