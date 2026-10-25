import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../scripts/auth-client.mjs').catch(() => null);
const need = () => { assert.ok(mod, 'Auth client implementation is missing'); return mod; };

test('rejects unconfigured and privileged browser settings', () => {
 const {validateConfig}=need();
 for(const value of [null,{}, {supabaseUrl:'https://example.supabase.co',publishableKey:'sb_secret_abc'}, {supabaseUrl:'http://evil.test',publishableKey:'sb_publishable_example'}, {supabaseUrl:'https://example.supabase.co@evil.test',publishableKey:'sb_publishable_example'}]) assert.equal(validateConfig(value).ok,false);
 assert.equal(validateConfig({supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example',functionName:'gatekeeper'}).ok,true);
});
test('accepts only genuine anon legacy JWT browser keys', () => {
 const {validateConfig}=need();
 const jwt=role=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.equal(validateConfig({supabaseUrl:'https://example.supabase.co',publishableKey:jwt('anon')}).ok,true);
 assert.equal(validateConfig({supabaseUrl:'https://example.supabase.co',publishableKey:jwt('service_role')}).ok,false);
});
test('validates required email and password without trimming passwords', () => {
 const {validateCredentials}=need();
 assert.equal(validateCredentials('','',false).ok,false);
 assert.equal(validateCredentials('x','pass',false).ok,false);
 assert.equal(validateCredentials('new@example.test','short',true).ok,false);
 assert.equal(validateCredentials('new@example.test','é'.repeat(37),true).ok,false);
 const r=validateCredentials(' TEST@EXAMPLE.TEST ','  Secure passphrase!  ',true);
 assert.equal(r.ok,true); assert.equal(r.email,'test@example.test'); assert.equal(r.password,'  Secure passphrase!  ');
 assert.equal(validateCredentials('old@example.test','oldpass',false).ok,true);
});
test('session storage is disabled and URL tokens never auto-imported', () => {
 const {makeAuthClient}=need(); let options;
 const sentinel={auth:{}};
 assert.equal(makeAuthClient({createClient:(url,key,o)=>{options=o;return sentinel;}},{supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'}),sentinel);
 assert.equal(options.auth.persistSession,false); assert.equal(options.auth.detectSessionInUrl,false); assert.equal(options.auth.autoRefreshToken,true);
});
test('only protected resource actions attach the in-memory access token', async () => {
 const {requestResource}=need(); const calls=[];
 const fetcher=async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({resource:'user',user:{id:'id',email:'a@example.test',role:'User'}}),{status:200});};
 const config={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example',functionName:'gatekeeper'};
 const session={access_token:'private-token-never-print'};
 await requestResource(config,'public',session,{fetcher}); await requestResource(config,'user',session,{fetcher});
 assert.ok(!calls[0].opts.headers.Authorization); assert.equal(calls[1].opts.headers.Authorization,'Bearer private-token-never-print');
 assert.ok(!calls[1].url.includes('private-token')); assert.equal(calls[1].opts.credentials,'omit'); assert.equal(calls[1].opts.cache,'no-store');
});
test('keeps real 401 and 403 distinct from network failures', async () => {
 const {requestResource}=need(); const c={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'};
 for(const status of [401,403]) { const r=await requestResource(c,'admin',null,{fetcher:async()=>new Response(JSON.stringify({error:status===401?'Unauthorized':'Forbidden'}),{status})}); assert.equal(r.status,status); }
 const r=await requestResource(c,'user',null,{fetcher:async()=>{throw new TypeError('Failed to fetch');}}); assert.equal(r.status,null); assert.equal(r.ok,false);
});
test('never echoes tokens or credential fields into the resource inspector', () => {
 const {safeResourceBody}=need();
 const out=safeResourceBody({resource:'user',message:'Allowed',access_token:'secret',user:{id:'id',email:'e@example.test',role:'Admin',password:'secret',encrypted_password:'secret'},data:{briefing:'Safe',token:'secret',users:[{password:'secret'}]}});
 assert.ok(!JSON.stringify(out).includes('secret')); assert.equal(out.user.role,'Admin');
});
test('request errors are generic and cannot leak upstream internals', async () => {
 const {requestResource}=need(); const c={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'};
 const r=await requestResource(c,'user',null,{fetcher:async()=>new Response(JSON.stringify({error:'internal database password=secret'}),{status:500})});
 assert.ok(!JSON.stringify(r).includes('secret')); assert.equal(r.status,500);
});
test('malformed or wrong-resource HTTP 200 never claims successful delivery', async () => {
 const {requestResource}=need(); const c={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'};
 for(const body of [null,{}, {error:'fake success'}, {resource:'admin',message:'wrong resource'}, {resource:'user',message:'missing identity'}]) {
  const r=await requestResource(c,'public',null,{fetcher:async()=>new Response(JSON.stringify(body),{status:200})});
  assert.equal(r.ok,false);assert.equal(r.status,200);assert.match(r.body.error,/unexpected/i);
 }
 const valid=await requestResource(c,'public',null,{fetcher:async()=>new Response(JSON.stringify({resource:'public',message:'Available'}),{status:200})});
 assert.equal(valid.ok,true);
});
test('invalid JSON preserves the observed HTTP status without claiming delivery', async () => {
 const {requestResource}=need();const c={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'};
 const r=await requestResource(c,'public',null,{fetcher:async()=>new Response('<html>not the API</html>',{status:200})});
 assert.equal(r.ok,false);assert.equal(r.status,200);assert.match(r.body.error,/unexpected|invalid/i);
});
test('protected success requires resource-specific non-array data', async () => {
 const {requestResource}=need();const c={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example'};
 const session={access_token:'controlled-token',user:{id:'caller-id'}};
 for(const resource of ['user','admin']) {
  for(const data of [[],{}, {scope:'wrong'}, {briefing:''}]) {
   const body={resource,message:'Delivered',user:{id:'caller-id',email:'caller@example.test',role:resource==='admin'?'Admin':'User'},data};
   const r=await requestResource(c,resource,session,{fetcher:async()=>new Response(JSON.stringify(body),{status:200})});
   assert.equal(r.ok,false,JSON.stringify({resource,data}));
  }
 }
});
test('own-account scope is preserved without forwarding arbitrary data', () => {
 const {safeResourceBody}=need();
 assert.deepEqual(safeResourceBody({resource:'user',data:{scope:'own-account',database_password:'secret'}}).data,{scope:'own-account'});
});
test('login failure message does not reveal whether account exists', () => {
 const {authFailureMessage}=need();
 assert.equal(authFailureMessage('login',{message:'User not found'}),authFailureMessage('login',{message:'Invalid password'}));
 assert.equal(authFailureMessage('login',{status:429}),'Too many attempts. Please wait before trying again.');
});
