import { CATALOG } from '../../shared/catalog.mjs';

// Admin-only bootstrap. Import this module and call initializeMongo(db) from a
// trusted admin session before serving requests. No credentials, connections,
// schema mutation or index creation occur during import or request handling.
// Requires a replica set (Atlas); create/delete use multi-document transactions.
// Collections are exclusively managed by the application adapter. Never discard
// ss_owner_caps while retaining orders; an existing import needs an offline,
// audited count reconciliation before enabling traffic. No browser DB access.
const UUID = {bsonType:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'};
const ISO = {bsonType:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'};
const itemSchemas = CATALOG.map(p=>({bsonType:'object',additionalProperties:false,required:['id','productId','name','unitPriceCents','quantity'],properties:{id:UUID,productId:{enum:[p.id]},name:{enum:[p.name]},unitPriceCents:{bsonType:'int',enum:[p.unitPriceCents]},quantity:{bsonType:'int',minimum:1,maximum:9}}}));
export const ORDERS_VALIDATOR = {$and:[
  {$jsonSchema:{bsonType:'object',additionalProperties:false,required:['id','ownerId','label','items','createdAt','updatedAt'],properties:{_id:{bsonType:'objectId'},id:UUID,ownerId:UUID,label:{bsonType:'string',minLength:1,maxLength:80,pattern:'^[^\\x00-\\x1f\\x7f]+$'},items:{bsonType:'array',minItems:0,maxItems:4,items:{oneOf:itemSchemas}},createdAt:ISO,updatedAt:ISO}}},
  {$expr:{$and:[
    {$eq:['$label',{$trim:{input:'$label'}}]},
    {$eq:[{$size:'$items'},{$size:{$setUnion:[{$map:{input:'$items',as:'item',in:'$$item.productId'}},[]]}}]},
    {$eq:[{$size:'$items'},{$size:{$setUnion:[{$map:{input:'$items',as:'item',in:'$$item.id'}},[]]}}]},
  ]}},
]};
export const CAPS_VALIDATOR = {$jsonSchema:{bsonType:'object',additionalProperties:false,required:['_id','count'],properties:{_id:UUID,count:{bsonType:'int',minimum:0,maximum:10}}}};
export async function initializeMongo(db) {
  for (const [name,validator] of [['orders',ORDERS_VALIDATOR],['ss_owner_caps',CAPS_VALIDATOR]]) {
    const options={validator,validationLevel:'strict',validationAction:'error'};
    try { await db.createCollection(name,options); }
    catch(error) { if(error?.code!==48)throw error;await db.command({collMod:name,...options}); }
  }
  await db.collection('orders').createIndexes([
    {key:{id:1},name:'orders_id_unique',unique:true},
    {key:{ownerId:1,id:1},name:'orders_owner_id_unique',unique:true},
    {key:{ownerId:1,updatedAt:-1,id:1},name:'orders_owner_updated'},
  ]);
  // ss_owner_caps._id has MongoDB's built-in unique index. Keep zero-count
  // documents: deleting them can race first-use initialization with a mutation.
}
