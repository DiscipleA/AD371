import { DomainError, badRequest, notFound, conflict, unavailable, isUuid, validateMutation, createOrder, createItem, normalizeOrder, summarizeOrder } from '../../../shared/domain.mjs';

// Orders are embedded documents; ss_owner_caps is the deliberate second
// collection needed for a race-safe *per-owner* 10-order limit. Reserve/release
// and insert/delete commit in one Atlas replica-set transaction. Do not seed or
// write these collections outside this adapter without reconciling the counters.
const TX = { readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:5000,timeoutMS:10000 };
const OPT = { maxTimeMS:5000 };
const AFTER = { ...OPT, returnDocument:'after',includeResultMetadata:false };
export function createMongoAdapter({ getMongo, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  return { async execute({op,ownerId,orderId,itemId,body}) {
    try {
      if (!isUuid(ownerId) || (orderId && !isUuid(orderId)) || (itemId && !isUuid(itemId))) throw badRequest();
      body = validateMutation(op,body);
      const { db,client } = await getMongo();
      const orders = db.collection('orders'), caps = db.collection('ss_owner_caps');
      const filter = { ownerId,id:orderId };
      const success = (document,status=200) => {
        if (!document) throw notFound();
        return {status,data:normalizeOrder(document)};
      };
      const transact = async fn => {
        const session = client.startSession();
        try { return await session.withTransaction(()=>fn(session),TX); }
        finally { await session.endSession(); }
      };
      switch(op) {
        case 'listOrders': {
          const docs = await orders.find({ownerId},OPT).sort({updatedAt:-1,id:1}).limit(10).toArray();
          return {status:200,data:docs.map(summarizeOrder)};
        }
        case 'getOrder': return success(await orders.findOne(filter,OPT));
        case 'createOrder': {
          // Idempotent initialization never overwrites an existing count. A
          // concurrent first-use upsert may lose its unique-_id race harmlessly.
          try { await caps.updateOne({_id:ownerId},{$setOnInsert:{count:0}},{...OPT,upsert:true}); }
          catch(error) { if (error?.code !== 11000) throw error; }
          const document = createOrder(ownerId,body,{uuid,now});
          return await transact(async session => {
            const reserved = await caps.findOneAndUpdate({_id:ownerId,count:{$lt:10}},{$inc:{count:1}},{...AFTER,session});
            if (!reserved) throw conflict('You can save at most 10 orders per storage engine.');
            await orders.insertOne(document,{...OPT,session});
            return success(document,201);
          });
        }
        case 'deleteOrder': return await transact(async session => {
          const removed = await orders.findOneAndDelete(filter,{...OPT,session,includeResultMetadata:false});
          if (!removed) throw notFound();
          const changed = await caps.updateOne({_id:ownerId,count:{$gt:0}},{$inc:{count:-1}},{...OPT,session});
          if (changed.matchedCount !== 1) throw unavailable(); // Roll back an inconsistent counter, never silently bypass it.
          return {status:200,data:{id:orderId,deleted:true}};
        });
        case 'renameOrder': return success(await orders.findOneAndUpdate(filter,{$set:{label:body.label,updatedAt:now()}},AFTER));
        case 'addItem': {
          const document = await orders.findOneAndUpdate({...filter,'items.productId':{$ne:body.productId},'items.3':{$exists:false}},{$push:{items:createItem(body,{uuid})},$set:{updatedAt:now()}},AFTER);
          if (document) return success(document,201);
          if (!await orders.findOne(filter,{...OPT,projection:{id:1}})) throw notFound();
          throw conflict('Product already exists or the order already contains four items.');
        }
        case 'updateItem': return success(await orders.findOneAndUpdate({...filter,'items.id':itemId},{$set:{'items.$[item].quantity':body.quantity,updatedAt:now()}},{...AFTER,arrayFilters:[{'item.id':itemId}]}));
        case 'deleteItem': return success(await orders.findOneAndUpdate({...filter,'items.id':itemId},{$pull:{items:{id:itemId}},$set:{updatedAt:now()}},AFTER));
        default: throw badRequest('Unknown operation.');
      }
    } catch(error) {
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }};
}
