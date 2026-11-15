import test from 'node:test';
import assert from 'node:assert/strict';
const { createHandler } = await import('../supabase/functions/saved-orders/controller.mjs').catch(()=>({}));
const U='00000000-0000-4000-8000-000000000001', O='00000000-0000-4000-8000-000000000002', I='00000000-0000-4000-8000-000000000003';
function setup(overrides={}) {
  assert.equal(typeof createHandler,'function','export import-safe createHandler');
  const calls=[];
  const adapter={execute:async input=>{calls.push(input);return {status:input.op==='createOrder'||input.op==='addItem'?201:200,data:{id:O}};}};
  const handler=createHandler({verifyUser:async token=>token==='valid'?{id:U}:null,sql:adapter,mongo:adapter,allowedOrigins:['http://localhost:8797'],...overrides});
  const request=(path='/orders',method='GET',body,extra={})=>new Request(`https://example.test/functions/v1/saved-orders${path}${path.includes('?')?'':'?engine=sql'}`,{method,headers:{Authorization:'Bearer valid',Origin:'http://localhost:8797',...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  return {handler,calls,request};
}
test('catalog requires verified auth but never touches either adapter',async()=>{
  const {handler,calls,request}=setup(); const res=await handler(request('/catalog?engine=mongo'));
  assert.equal(res.status,200); const json=await res.json(); assert.equal(json.engine,'mongo'); assert.equal(json.data.length,4); assert.equal(calls.length,0);
});
test('missing, invalid or decode-only tokens cannot access storage',async()=>{
  const {handler,calls,request}=setup();
  for(const Authorization of ['', 'Bearer forged', 'Basic valid']) {const r=await handler(request('/orders','GET',undefined,{Authorization}));assert.equal(r.status,401);assert.equal((await r.json()).ok,false);}
  assert.equal(calls.length,0);
});
test('authentication failures are sanitized and verification precedes DB access',async()=>{
  const {handler,calls,request}=setup({verifyUser:async()=>{throw Error('SECRET DB PASSWORD');}});
  const r=await handler(request()); assert.equal(r.status,503); assert.doesNotMatch(await r.text(),/SECRET/);assert.equal(calls.length,0);
});
test('preflight is auth-free and CORS only reflects explicit origins',async()=>{
  const {handler,calls,request}=setup({verifyUser:()=>{throw Error('must not authenticate preflight');}});
  const r=await handler(request('/orders','OPTIONS',undefined,{Authorization:''})); assert.equal(r.status,204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),'http://localhost:8797');assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);
  const blocked=await handler(request('/orders','OPTIONS',undefined,{Origin:'https://evil.test'}));assert.equal(blocked.status,400);assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);assert.equal(calls.length,0);
});
test('routes all CRUD operations to selected adapter with verified owner and original bearer',async()=>{
  const {handler,calls,request}=setup();
  const cases=[['/orders','GET',undefined,'listOrders',200],['/orders','POST',{label:' X ',items:[{productId:'classic-tee',quantity:1}]},'createOrder',201],[`/orders/${O}`,'GET',undefined,'getOrder',200],[`/orders/${O}`,'PATCH',{label:'Y'},'renameOrder',200],[`/orders/${O}`,'DELETE',undefined,'deleteOrder',200],[`/orders/${O}/items`,'POST',{productId:'retro-sneakers',quantity:2},'addItem',201],[`/orders/${O}/items/${I}`,'PATCH',{quantity:3},'updateItem',200],[`/orders/${O}/items/${I}`,'DELETE',undefined,'deleteItem',200]];
  for(const [path,method,body,op,status] of cases){const r=await handler(request(path,method,body));assert.equal(r.status,status);const last=calls.at(-1);assert.equal(last.op,op);assert.equal(last.ownerId,U);assert.equal(last.token,'valid');assert.equal((await r.json()).engine,'sql');}
  assert.equal(calls[1].body.label,'X');assert.equal(calls.at(-1).itemId,I);
});
test('invalid engine, repeated selector, invalid UUID and unknown routes never touch storage',async()=>{
  const {handler,calls,request}=setup();
  for(const [path,status] of [['/orders?engine=',400],['/orders?engine=redis',400],['/orders?engine=sql&engine=mongo',400],['/orders/nope',400],['/orders?ownerId=spoof',400],['/missing',404],['/orders/foo/items/bar',400]])assert.equal((await handler(request(path))).status,status,path);
  assert.equal(calls.length,0);
});
test('reject malformed, unsafe, wrong-content-type and oversized JSON before storage',async()=>{
  const {handler,calls,request}=setup();
  for(const body of ['{', {label:'x',items:[{productId:{$ne:null},quantity:1}]},{label:'x',items:[{productId:'classic-tee',quantity:1}],ownerId:U},' '.repeat(8193)]) assert.equal((await handler(request('/orders','POST',body))).status,400);
  assert.equal((await handler(request('/orders','POST','{}',{'Content-Type':'text/plain'}))).status,400);
  assert.equal(calls.length,0);
});
test('streamed body is byte-bounded even without Content-Length',async()=>{
  const {handler,calls}=setup();let cancelled=false;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(4097));},cancel(){cancelled=true;}});
  const req=new Request('https://example.test/saved-orders/orders?engine=mongo',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:stream,duplex:'half'});
  const r=await handler(req);assert.equal(r.status,400);assert.ok(cancelled);assert.equal(calls.length,0);
});
test('provider failures and untrusted thrown objects never escape as raw errors',async()=>{
  const {handler,request}=setup({sql:{execute:async()=>{throw Object.assign(Error('mongodb+srv://password'),{status:418,code:'SECRET'});}}});
  const r=await handler(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,error:{code:'UNAVAILABLE',message:'Storage is temporarily unavailable.'}});
});
test('controlled adapter envelopes preserve 404/409 without disclosing provider data',async()=>{
  for(const status of [404,409]) {const {handler,request}=setup({sql:{execute:async()=>({status,data:null})}});const r=await handler(request());assert.equal(r.status,status);assert.equal((await r.json()).ok,false);}
});
