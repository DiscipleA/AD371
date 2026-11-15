import test from 'node:test';
import assert from 'node:assert/strict';
const runtime=await import('../supabase/functions/saved-orders/runtime.mjs').catch(()=>({}));
const sqlModule=await import('../supabase/functions/saved-orders/sql.mjs').catch(()=>({}));
const U='00000000-0000-4000-8000-000000000001';
const env=values=>name=>values[name];
test('publishable JSON default is checked; legacy is only a fallback',()=>{
  assert.equal(typeof runtime.readConfig,'function');
  const base={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_example'}),ALLOWED_ORIGINS:'http://localhost:8797,https://store.test',MONGODB_DB:'stylestore'};
  const config=runtime.readConfig(env(base));assert.equal(config.publishableKey,'sb_publishable_example');assert.deepEqual(config.allowedOrigins,['http://localhost:8797','https://store.test']);
  assert.throws(()=>runtime.readConfig(env({...base,SUPABASE_PUBLISHABLE_KEYS:'{}',SUPABASE_ANON_KEY:'legacy'})));
  assert.throws(()=>runtime.readConfig(env({...base,SUPABASE_PUBLISHABLE_KEYS:'{'})));
  assert.throws(()=>runtime.readConfig(env({...base,ALLOWED_ORIGINS:'*'})));
  const legacy={...base,SUPABASE_PUBLISHABLE_KEYS:undefined,SUPABASE_ANON_KEY:'legacy-anon'};assert.equal(runtime.readConfig(env(legacy)).publishableKey,'legacy-anon');
});
test('auth uses a real Supabase user verification endpoint, not JWT payload decoding (controlled HTTP)',async()=>{
  assert.equal(typeof runtime.createVerifyUser,'function'); let seen;
  const verify=runtime.createVerifyUser({url:'https://test.supabase.co',publishableKey:'pub',fetchImpl:async(url,options)=>{seen={url,options};return Response.json({id:U,role:'authenticated'});}});
  assert.deepEqual(await verify('caller-jwt'),{id:U});assert.equal(seen.url,'https://test.supabase.co/auth/v1/user');assert.equal(seen.options.headers.Authorization,'Bearer caller-jwt');assert.equal(seen.options.headers.apikey,'pub');assert.ok(seen.options.signal);
});
test('controlled auth HTTP: invalid token gives null, provider error sanitized, invalid identity rejected',async()=>{
  assert.equal(typeof runtime.createVerifyUser,'function');
  for(const status of [401,403])assert.equal(await runtime.createVerifyUser({url:'https://x',publishableKey:'p',fetchImpl:async()=>new Response('',{status})})('x'),null);
  await assert.rejects(runtime.createVerifyUser({url:'https://x',publishableKey:'p',fetchImpl:async()=>new Response('SECRET',{status:500})})('x'),e=>e.status===503&&!e.message.includes('SECRET'));
  assert.equal(await runtime.createVerifyUser({url:'https://x',publishableKey:'p',fetchImpl:async()=>Response.json({id:'forged'})})('x'),null);
});
test('SQL transport calls restricted RPC with caller bearer, never forwards ownerId (controlled HTTP)',async()=>{
  assert.equal(typeof sqlModule.createSqlAdapter,'function');let seen;
  const adapter=sqlModule.createSqlAdapter({url:'https://test.supabase.co',publishableKey:'pub',fetchImpl:async(url,options)=>{seen={url,options};return Response.json({status:200,data:[]});}});
  assert.deepEqual(await adapter.execute({op:'listOrders',ownerId:U,token:'jwt',body:null}),{status:200,data:[]});
  assert.equal(seen.url,'https://test.supabase.co/rest/v1/rpc/ss_orders_api');assert.equal(seen.options.headers.Authorization,'Bearer jwt');
  assert.deepEqual(JSON.parse(seen.options.body),{p_operation:'listOrders',p_order_id:null,p_item_id:null,p_body:null});assert.ok(seen.options.signal);
});
test('SQL transport never propagates raw database HTTP errors (controlled HTTP)',async()=>{
  assert.equal(typeof sqlModule.createSqlAdapter,'function');
  const adapter=sqlModule.createSqlAdapter({url:'https://x',publishableKey:'p',fetchImpl:async()=>new Response('postgres password',{status:500})});
  await assert.rejects(adapter.execute({op:'listOrders',token:'jwt'}),e=>e.status===503&&!e.message.includes('postgres'));
});
test('Mongo client initialization is lazy, shared and retryable after connection failure (controlled client)',async()=>{
  assert.equal(typeof runtime.createLazyMongo,'function'); let constructions=0,connections=0,closed=0,options;
  class Client{constructor(uri,opts){constructions++;options=opts;}async connect(){connections++;if(connections===1)throw Error('offline');return this;}db(name){return {name};}async close(){closed++;}}
  const get=runtime.createLazyMongo({MongoClient:Client,uri:'mongodb://localhost',database:'stylestore'});
  assert.equal(constructions,0);await assert.rejects(get());const [a,b]=await Promise.all([get(),get()]);assert.equal(a,b);assert.equal(constructions,2);assert.equal(options.maxPoolSize,5);assert.equal(options.minPoolSize,0);assert.ok(options.serverSelectionTimeoutMS<=5000);assert.equal(closed,1);
});
