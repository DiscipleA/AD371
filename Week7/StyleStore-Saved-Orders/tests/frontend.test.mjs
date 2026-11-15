import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
const path = new URL('../src/orders-client.mjs', import.meta.url);
let lib;
test('frontend client exists', async () => { assert.ok(existsSync(path), 'missing isolated orders client'); lib = await import(path); });
const product = {id:'retro-sneakers',name:'Retro Sneakers',unitPriceCents:8500,image:'assets/sneakers.svg'};
const uuid = '7ad516b2-4b11-4acf-8755-2ed91d915369';
const order = {id:uuid,label:'Weekend',items:[{id:uuid,productId:product.id,name:product.name,unitPriceCents:8500,quantity:2}],totalCents:17000,createdAt:'2026-11-12T10:00:00Z',updatedAt:'2026-11-12T10:00:00Z'};
test('config is explicitly unavailable until safe public configuration exists', () => {
  assert.equal(lib.readConfig({}).configured,false);
  assert.equal(lib.readConfig({supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_example',functionName:'saved-orders'}).configured,true);
  assert.equal(lib.readConfig({supabaseUrl:'javascript:alert(1)',publishableKey:'x'}).configured,false);
  assert.equal(lib.readConfig({supabaseUrl:'https://example.supabase.co/path',publishableKey:'x'}).configured,false);
  assert.equal(lib.readConfig({supabaseUrl:'https://example.supabase.co',publishableKey:'sb_secret_no'}).configured,false);
});
test('draft is immutable, unique and bounded; amounts use integer cents', () => {
  const first=lib.addDraftItem([],product.id); assert.deepEqual(first,[{productId:product.id,quantity:1}]);
  const second=lib.addDraftItem(first,product.id); assert.equal(first[0].quantity,1); assert.equal(second[0].quantity,2);
  assert.throws(()=>lib.addDraftItem([{productId:product.id,quantity:9}],product.id));
  assert.throws(()=>lib.addDraftItem([],'unknown'));
  assert.throws(()=>lib.setDraftQuantity(first,product.id,0));
  assert.throws(()=>lib.setDraftQuantity(first,product.id,1.5));
  assert.equal(lib.draftTotal(second),17000);
  assert.equal(lib.validLabel('   '),false); assert.equal(lib.validLabel('x'.repeat(81)),false);
});
test('validate actual order records, never accepting wrong totals or unknown products', () => {
  assert.deepEqual(lib.validateOrder(order),order);
  assert.throws(()=>lib.validateOrder({...order,totalCents:1}));
  assert.throws(()=>lib.validateOrder({...order,items:[{...order.items[0],quantity:10}]}));
  assert.throws(()=>lib.validateOrder({...order,id:'oops'}));
  assert.throws(()=>lib.validateOrder({...order,items:[{...order.items[0],name:'unexpected'}]}));
});
for (const [name,label,valid] of [
  ['one emoji','😀',true],
  ['41 emoji','😀'.repeat(41),true],
  ['80 emoji with surrounding whitespace','  '+ '😀'.repeat(80)+'  ',true],
  ['80 ASCII characters','x'.repeat(80),true],
  ['81 emoji','😀'.repeat(81),false],
  ['81 ASCII characters','x'.repeat(81),false],
]) test(`label boundary counts trimmed Unicode code points: ${name}`,()=>{
  assert.equal(lib.validLabel(label),valid);
});
for (const kind of ['order','list']) {
  const payload=label=>kind==='order'?{...order,label}:[{id:uuid,label,itemCount:2,totalCents:17000,updatedAt:order.updatedAt}];
  const request=label=>lib.createOrdersApi({supabaseUrl:'https://example.supabase.co',publishableKey:'public',functionName:'saved-orders'},async()=> 'fixture-only-token',async()=>new Response(JSON.stringify({ok:true,engine:'sql',data:payload(label)}))).request('sql',kind==='order'?`/orders/${uuid}`:'/orders',{kind});
  test(`${kind} response accepts and preserves 80 emoji`,async()=>{
    const label='😀'.repeat(80);
    assert.deepEqual((await request(label)).data,payload(label));
  });
  for (const [name,label] of [['emoji','😀'.repeat(81)],['ASCII','x'.repeat(81)]])
    test(`${kind} response rejects 81 ${name} code points`,async()=>{
      await assert.rejects(request(label),/Malformed/);
    });
}
test('validated responses strip unknown payload fields before public JSON disclosure',()=>{
  const value=lib.validateOrder({...order,access_token:'must-not-surface',ownerId:'private',items:[{...order.items[0],refresh_token:'must-not-surface'}]});
  assert.equal(value.access_token,undefined);assert.equal(value.ownerId,undefined);assert.equal(value.items[0].refresh_token,undefined);
});
test('actual loopback HTTP validates envelopes, methods, owner token and does not retry writes', async () => {
  let seen=[];
  const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk; seen.push({method:req.method,url:req.url,auth:req.headers.authorization,key:req.headers.apikey,body});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,engine:'sql',data:order}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {const api=lib.createOrdersApi({supabaseUrl:`http://127.0.0.1:${server.address().port}`,publishableKey:'public-test',functionName:'saved-orders'},async()=> 'local-test-token');
    assert.deepEqual((await api.request('sql','/orders',{method:'POST',body:{label:'Weekend',items:[{productId:product.id,quantity:2}]},kind:'order'})).data,order);
    assert.equal(seen.length,1);assert.equal(seen[0].method,'POST');assert.match(seen[0].url,/\/functions\/v1\/saved-orders\/orders\?engine=sql$/);assert.equal(seen[0].auth,'Bearer local-test-token');assert.equal(seen[0].key,'public-test');
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('list and deletion disclosures include only public contract fields',async()=>{
 const summary={id:uuid,label:'Weekend',itemCount:1,totalCents:17000,updatedAt:order.updatedAt};
 for(const [kind,payload,expected] of [['list',[{...summary,access_token:'must-not-surface'}],[summary]],['deleted',{id:uuid,deleted:true,access_token:'must-not-surface'},{id:uuid,deleted:true}]]){
  const api=lib.createOrdersApi({supabaseUrl:'https://example.supabase.co',publishableKey:'public',functionName:'saved-orders'},async()=> 'test',async()=>new Response(JSON.stringify({ok:true,engine:'sql',data:payload})));
  const result=await api.request('sql','/orders',{kind,expectedId:uuid});assert.deepEqual(result.data,expected);
 }
});
test('wrong-engine, malformed and unavailable responses remain errors', async()=> {
  for(const payload of [{ok:true,engine:'mongo',data:order},{ok:true,engine:'sql',data:{id:'fake'}},{ok:false,error:{code:'UNAVAILABLE',message:'Database unavailable'}}]){
    const api=lib.createOrdersApi({supabaseUrl:'https://example.supabase.co',publishableKey:'public',functionName:'saved-orders'},async()=> 'test',async()=>new Response(JSON.stringify(payload),{status:payload.ok?200:503}));
    await assert.rejects(api.request('sql','/orders',{kind:'order'}));
  }
});
test('cancellation rejects superseded response even if transport ignores abort',async()=>{
  let release;
  const api=lib.createOrdersApi({supabaseUrl:'https://example.supabase.co',publishableKey:'public',functionName:'saved-orders'},async()=> 'test',()=>new Promise(r=>{release=r;}));
  const pending=api.request('sql','/orders',{kind:'order'});await new Promise(r=>setImmediate(r));api.cancel();release(new Response(JSON.stringify({ok:true,engine:'sql',data:order})));
  await assert.rejects(pending,/superseded|cancel/i);
});
