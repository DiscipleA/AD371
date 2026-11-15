import test from 'node:test';
import assert from 'node:assert/strict';
const mongoModule=await import('../supabase/functions/saved-orders/mongo.mjs').catch(()=>({}));
const bootstrap=await import('../supabase/mongo/bootstrap.mjs').catch(()=>({}));
const U='00000000-0000-4000-8000-000000000001',O='00000000-0000-4000-8000-000000000002',I='00000000-0000-4000-8000-000000000003';
const doc=()=>({id:O,ownerId:U,label:'Saved',items:[{id:I,productId:'classic-tee',name:'Classic Tee',unitPriceCents:2800,quantity:1}],createdAt:'2026-11-12T11:00:00.000Z',updatedAt:'2026-11-12T11:00:00.000Z'});
function fixture({result=doc(),cap={count:1},insertFails=false}={}){
  assert.equal(typeof mongoModule.createMongoAdapter,'function');const calls=[];let ended=false;
  const session={withTransaction:async(fn,options)=>{calls.push({name:'transaction',options});return fn();},endSession:async()=>{ended=true;}};
  const make=(collection)=>({
    findOne:async(filter,options)=>{calls.push({collection,name:'findOne',filter,options});return result;},
    find:filter=>{calls.push({collection,name:'find',filter});return{sort:()=>({limit:()=>({toArray:async()=>result?[result]:[]})})};},
    findOneAndUpdate:async(filter,update,options)=>{calls.push({collection,name:'findOneAndUpdate',filter,update,options});return collection==='ss_owner_caps'?cap:result;},
    findOneAndDelete:async(filter,options)=>{calls.push({collection,name:'findOneAndDelete',filter,options});return result;},
    insertOne:async(document,options)=>{calls.push({collection,name:'insertOne',document,options});if(insertFails)throw Error('provider SECRET');return {insertedId:O};},
    updateOne:async(filter,update,options)=>{calls.push({collection,name:'updateOne',filter,update,options});return {matchedCount:1};},
  });
  const db={collection:make};const adapter=mongoModule.createMongoAdapter({getMongo:async()=>({db,client:{startSession:()=>session}}),now:()=> '2026-11-12T12:00:00.000Z'});
  return{calls,session,ended:()=>ended,run:(op,body=null,extra={})=>adapter.execute({op,ownerId:U,orderId:O,itemId:I,body,...extra})};
}
test('Mongo full document read is exactly one owner-qualified query (controlled Mongo client)',async()=>{
  const f=fixture();const out=await f.run('getOrder');assert.equal(out.data.totalCents,2800);assert.equal(out.data.ownerId,undefined);assert.equal(out.data._id,undefined);
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].filter,{ownerId:U,id:O});
});
test('Mongo listing is owner-qualified summaries without embedded/private data (controlled Mongo client)',async()=>{
  const f=fixture();const r=await f.run('listOrders');assert.equal(r.data[0].itemCount,1);assert.equal(r.data[0].items,undefined);assert.equal(f.calls[0].filter.ownerId,U);assert.equal(f.calls.length,1);
});
test('Mongo creation uses trusted snapshots and an atomic per-owner reservation with insertion (controlled Mongo client)',async()=>{
  const f=fixture();const r=await f.run('createOrder',{label:'New',items:[{productId:'retro-sneakers',quantity:2}]});assert.equal(r.status,201);assert.equal(r.data.totalCents,17000);
  const reserve=f.calls.find(c=>c.collection==='ss_owner_caps'&&c.name==='findOneAndUpdate');assert.deepEqual(reserve.filter,{_id:U,count:{$lt:10}});assert.deepEqual(reserve.update,{$inc:{count:1}});assert.equal(reserve.options.session,f.session);
  const insert=f.calls.find(c=>c.name==='insertOne');assert.equal(insert.options.session,f.session);assert.equal(insert.document.ownerId,U);assert.equal(insert.document.items[0].unitPriceCents,8500);assert.match(insert.document.id,/^[\da-f-]{36}$/);assert.ok(f.ended());
  assert.equal(f.calls.find(c=>c.name==='transaction').options.writeConcern.w,'majority');
});
test('Mongo at-cap rejection never inserts and transaction failure is surfaced, not fake success (controlled Mongo client)',async()=>{
  const f=fixture({cap:null});await assert.rejects(f.run('createOrder',{label:'New',items:[{productId:'classic-tee',quantity:1}]}),e=>e.status===409);assert.equal(f.calls.filter(c=>c.name==='insertOne').length,0);assert.ok(f.ended());
  const fail=fixture({insertFails:true});await assert.rejects(fail.run('createOrder',{label:'New',items:[{productId:'classic-tee',quantity:1}]}));assert.ok(fail.ended());
});
test('Mongo deletion decrements owner cap only after owner-qualified deletion in the same transaction (controlled Mongo client)',async()=>{
  const f=fixture();assert.deepEqual((await f.run('deleteOrder')).data,{id:O,deleted:true});
  const deletion=f.calls.find(c=>c.name==='findOneAndDelete');assert.deepEqual(deletion.filter,{ownerId:U,id:O});assert.equal(deletion.options.session,f.session);
  const dec=f.calls.find(c=>c.name==='updateOne');assert.deepEqual(dec.update,{$inc:{count:-1}});assert.equal(dec.options.session,f.session);
  const missing=fixture({result:null});await assert.rejects(missing.run('deleteOrder'),e=>e.status===404);assert.equal(missing.calls.filter(c=>c.name==='updateOne').length,0);
});
test('Mongo atomic push prevents duplicate products and fifth items without read-modify-write (controlled Mongo client)',async()=>{
  const f=fixture();assert.equal((await f.run('addItem',{productId:'retro-sneakers',quantity:1})).status,201);
  const c=f.calls[0];assert.equal(c.name,'findOneAndUpdate');assert.equal(c.filter.ownerId,U);assert.equal(c.filter['items.productId'].$ne,'retro-sneakers');assert.deepEqual(c.filter['items.3'],{$exists:false});assert.equal(c.update.$push.items.unitPriceCents,8500);assert.equal(c.options.returnDocument,'after');assert.equal(c.options.includeResultMetadata,false);assert.equal(f.calls.length,1);
});
test('Mongo uses positional filtered set for quantity and pull for removal (controlled Mongo client)',async()=>{
  const f=fixture();await f.run('updateItem',{quantity:9});const c=f.calls[0];assert.deepEqual(c.filter,{ownerId:U,id:O,'items.id':I});assert.equal(c.update.$set['items.$[item].quantity'],9);assert.deepEqual(c.options.arrayFilters,[{'item.id':I}]);
  await f.run('deleteItem');assert.deepEqual(f.calls[1].update.$pull,{items:{id:I}});assert.equal(f.calls[1].filter.ownerId,U);assert.equal(f.calls[1].filter['items.id'],I);
});
test('Mongo rename is a field-level update and misses stay owner-opaque (controlled Mongo client)',async()=>{
  const f=fixture();await f.run('renameOrder',{label:'Renamed'});assert.equal(f.calls[0].update.$set.label,'Renamed');assert.equal(f.calls[0].update.$set.items,undefined);
  const missing=fixture({result:null});for(const op of ['getOrder','renameOrder','updateItem','deleteItem'])await assert.rejects(missing.run(op,op==='renameOrder'?{label:'x'}:op==='updateItem'?{quantity:1}:null),e=>e.status===404);
  await assert.rejects(missing.run('addItem',{productId:'classic-tee',quantity:1}),e=>e.status===404);
});
test('Mongo admin bootstrap defines strict exact schemas, indexes and counter tradeoff; no connection at import',async()=>{
  assert.equal(typeof bootstrap.initializeMongo,'function');assert.equal(bootstrap.ORDERS_VALIDATOR.$and[0].$jsonSchema.additionalProperties,false);assert.equal(bootstrap.CAPS_VALIDATOR.$jsonSchema.properties.count.maximum,10);
  const calls=[];const db={createCollection:async(name,options)=>calls.push({name,options}),collection:name=>({createIndexes:async indexes=>calls.push({name,indexes})})};
  await bootstrap.initializeMongo(db);const orders=calls.find(c=>c.name==='orders'&&c.options);assert.equal(orders.options.validationAction,'error');assert.equal(orders.options.validationLevel,'strict');assert.ok(calls.some(c=>c.name==='ss_owner_caps'));assert.ok(calls.some(c=>c.indexes?.some(i=>i.unique&&i.key.ownerId===1&&i.key.id===1)));
});
