import test from 'node:test';
import assert from 'node:assert/strict';
const domain = await import('../shared/domain.mjs').catch(() => ({}));
const catalog = await import('../shared/catalog.mjs').catch(() => ({}));
const valid = { label: '  Weekend 😀  ', items: [{ productId: 'retro-sneakers', quantity: 2 }] };

test('trusted catalog has four fixed products, integer cents and local art', () => {
  assert.deepEqual(catalog.CATALOG?.map(p => [p.id,p.unitPriceCents,p.image]), [
    ['retro-sneakers',8500,'assets/sneakers.svg'],['classic-tee',2800,'assets/tee.svg'],
    ['everyday-hoodie',6400,'assets/hoodie.svg'],['city-backpack',5200,'assets/backpack.svg']]);
  assert.ok(Object.isFrozen(catalog.CATALOG));
});
test('create validation trims Unicode labels and projects fixed fields', () => {
  assert.equal(typeof domain.validateMutation, 'function');
  assert.deepEqual(domain.validateMutation('createOrder', valid), { ...valid, label: 'Weekend 😀' });
});
for (const [name,body] of [
  ['empty label',{...valid,label:'  '}], ['81 codepoints',{...valid,label:'😀'.repeat(81)}],
  ['missing label',{items:valid.items}], ['null',null],['array',[]],
  ['unknown owner',{...valid,ownerId:'spoof'}],['forged price',{...valid,items:[{productId:'retro-sneakers',quantity:2,unitPriceCents:1}]}],
  ['zero',{...valid,items:[{productId:'retro-sneakers',quantity:0}]}],
  ['ten',{...valid,items:[{productId:'retro-sneakers',quantity:10}]}],
  ['fraction',{...valid,items:[{productId:'retro-sneakers',quantity:1.5}]}],
  ['string quantity',{...valid,items:[{productId:'retro-sneakers',quantity:'2'}]}],
  ['operator',{...valid,items:[{productId:{$ne:null},quantity:2}]}],
  ['unknown product',{...valid,items:[{productId:'constructor',quantity:2}]}],
  ['duplicate',{...valid,items:[...valid.items,...valid.items]}],['empty items',{...valid,items:[]}],
  ['prototype key',JSON.parse('{"label":"x","items":[],"__proto__":{"x":1}}')],
]) test(`reject ${name}`,()=>{
  assert.equal(typeof domain.validateMutation,'function');
  assert.throws(()=>domain.validateMutation('createOrder',body),e=>e.status===400 && e.code==='BAD_REQUEST');
});
test('80 Unicode codepoints are accepted and one-field patches are strict',()=>{
  assert.equal(domain.validateMutation('renameOrder',{label:'😀'.repeat(80)}).label.length,160);
  assert.deepEqual(domain.validateMutation('updateItem',{quantity:9}),{quantity:9});
  assert.throws(()=>domain.validateMutation('renameOrder',{label:'ok',$set:{}}));
});
test('server generates ids and snapshots prices; normalization computes totals without leaking owner',()=>{
  assert.equal(typeof domain.createOrder,'function');
  let n=0;
  const order=domain.createOrder('00000000-0000-4000-8000-000000000001',domain.validateMutation('createOrder',valid),{uuid:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,now:()=> '2026-11-12T11:00:00.000Z'});
  assert.equal(order.items[0].unitPriceCents,8500);
  const out=domain.normalizeOrder(order);
  assert.equal(out.totalCents,17000); assert.equal(out.ownerId,undefined);
  assert.equal(out.id,'00000000-0000-4000-8000-000000000001');
  assert.deepEqual(domain.summarizeOrder(order),{id:out.id,label:out.label,itemCount:1,totalCents:17000,updatedAt:out.updatedAt});
  assert.equal(domain.normalizeOrder({...order,items:[]}).totalCents,0);
});
