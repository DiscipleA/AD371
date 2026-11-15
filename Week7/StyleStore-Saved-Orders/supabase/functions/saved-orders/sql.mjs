import { unavailable } from '../../../shared/domain.mjs';
// The caller's JWT is deliberately preserved. The RPC derives auth.uid() and
// re-validates its complete input: neither ownerId nor service keys are sent.
export function createSqlAdapter({url,publishableKey,fetchImpl=fetch}) {
  return { async execute({op,orderId,itemId,body,token}) {
    try {
      const response=await fetchImpl(`${url}/rest/v1/rpc/ss_orders_api`,{method:'POST',headers:{apikey:publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_operation:op,p_order_id:orderId??null,p_item_id:itemId??null,p_body:body??null}),signal:AbortSignal.timeout(10000)});
      if (!response.ok) { if ([401,403].includes(response.status)) return {status:401,data:null}; throw unavailable(); }
      const result=await response.json();
      if (!result || ![200,201,400,401,404,409,503].includes(result.status) || !Object.hasOwn(result,'data')) throw unavailable();
      return {status:result.status,data:result.data};
    } catch { throw unavailable(); }
  }};
}
