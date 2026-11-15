import { CATALOG } from '../shared/catalog.mjs';
export { CATALOG };
const products = new Map(CATALOG.map(product=>[product.id,product]));
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = message => {throw new Error(message);};
export const validLabel = value => {
  if(typeof value!=='string')return false;
  const length=[...value.trim()].length;
  return length>=1 && length<=80;
};
export const validQuantity = value => Number.isInteger(value) && value>=1 && value<=9;
export const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function readConfig(value={}) {
  const result={supabaseUrl:'',publishableKey:'',functionName:'saved-orders',configured:false};
  try {
    const url=new URL(value.supabaseUrl);
    if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash) return result;
    if(typeof value.publishableKey!=='string' || !value.publishableKey.trim() || /sb_secret_|service_role/i.test(value.publishableKey))return result;
    // Legacy public anon JWTs are allowed, but a service-role JWT is never a browser key.
    if(value.publishableKey.split('.').length===3){
      const payload=JSON.parse(atob(value.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(payload.role!=='anon')return result;
    }
    const functionName=value.functionName||'saved-orders';
    if(!/^[a-z][a-z0-9-]{0,62}$/.test(functionName))return result;
    return {supabaseUrl:url.origin,publishableKey:value.publishableKey.trim(),functionName,configured:true};
  }catch{return result;}
}
export function addDraftItem(items,productId) {
  if(!products.has(productId))fail('Unknown product.');
  const existing=items.find(item=>item.productId===productId);
  if(existing)return setDraftQuantity(items,productId,existing.quantity+1);
  if(items.length>=4)fail('Choose up to four different products.');
  return [...items,{productId,quantity:1}];
}
export function setDraftQuantity(items,productId,quantity) {
  if(!validQuantity(quantity))fail('Quantity must be a whole number from 1 to 9.');
  return items.map(item=>item.productId===productId?{...item,quantity}:item);
}
export const draftTotal = items => items.reduce((total,item)=>total+products.get(item.productId).unitPriceCents*item.quantity,0);
const date = value => typeof value==='string' && Number.isFinite(Date.parse(value));
export function validateOrder(order) {
  if(!order || !uuid(order.id) || !validLabel(order.label) || !Array.isArray(order.items) || order.items.length>4 || !date(order.createdAt) || !date(order.updatedAt))fail('Malformed order response.');
  const seen=new Set(),ids=new Set();let total=0;
  for(const item of order.items){
    const product=products.get(item.productId);
    if(!product || !uuid(item.id) || ids.has(item.id) || seen.has(item.productId) || item.name!==product.name || item.unitPriceCents!==product.unitPriceCents || !validQuantity(item.quantity))fail('Malformed order items.');
    seen.add(item.productId);ids.add(item.id);total+=item.unitPriceCents*item.quantity;
  }
  if(!Number.isSafeInteger(order.totalCents) || order.totalCents!==total)fail('Invalid server total.');
  return {id:order.id,label:order.label,items:order.items.map(({id,productId,name,unitPriceCents,quantity})=>({id,productId,name,unitPriceCents,quantity})),totalCents:order.totalCents,createdAt:order.createdAt,updatedAt:order.updatedAt};
}
function validateData(data,kind,expectedId) {
  if(kind==='order')return validateOrder(data);
  if(kind==='deleted'){
    if(!data || data.id!==expectedId || data.deleted!==true)fail('Malformed deletion response.');return {id:data.id,deleted:true};
  }
  if(kind==='catalog'){
    if(!Array.isArray(data) || data.length!==CATALOG.length || CATALOG.some(p=>!data.some(q=>q.id===p.id && q.name===p.name && q.unitPriceCents===p.unitPriceCents && q.image===p.image)))fail('Unexpected catalog response.');return data;
  }
  if(kind==='list'){
    if(!Array.isArray(data) || data.length>1000)fail('Malformed saved-order list.');
    const ids=new Set();for(const order of data){
      if(!order || !uuid(order.id) || ids.has(order.id) || !validLabel(order.label) || !Number.isInteger(order.itemCount) || order.itemCount<0 || order.itemCount>36 || !Number.isSafeInteger(order.totalCents) || order.totalCents<0 || !date(order.updatedAt))fail('Malformed saved-order list.');ids.add(order.id);
    }return data.map(({id,label,itemCount,totalCents,updatedAt})=>({id,label,itemCount,totalCents,updatedAt}));
  }
  fail('Unknown response contract.');
}
export function createOrdersApi(config,getToken,fetchImpl=globalThis.fetch) {
  let generation=0;
  const pending=new Set();
  return {
    cancel(){generation++;for(const controller of pending)controller.abort();pending.clear();},
    async request(engine,path,{method='GET',body,kind='list',expectedId}={}){
      if(!['sql','mongo'].includes(engine) || !/^\/(catalog|orders)(\/[a-zA-Z0-9/-]+)?$/.test(path))fail('Invalid request route.');
      const current=generation,controller=new AbortController();pending.add(controller);
      const timer=setTimeout(()=>controller.abort(),15000);
      const assertCurrent=()=>{if(current!==generation)fail('Request superseded or cancelled.');};
      try{
        const token=await getToken();assertCurrent();if(!token)fail('Start a demo session before accessing saved orders.');
        const url=`${config.supabaseUrl}/functions/v1/${config.functionName}${path}?engine=${engine}`;
        const response=await fetchImpl(url,{method,headers:{apikey:config.publishableKey,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store',credentials:'omit'});
        assertCurrent();const text=await response.text();assertCurrent();if(text.length>1048576)fail('Response exceeded the safety limit.');
        let envelope;try{envelope=JSON.parse(text);}catch{fail(`HTTP ${response.status}: response was not valid JSON.`);}
        if(!response.ok || envelope?.ok!==true)fail(`HTTP ${response.status}: ${typeof envelope?.error?.message==='string'?envelope.error.message.slice(0,220):'Request failed.'}`);
        if(envelope.engine!==engine)fail('Response came from the wrong database engine.');
        const data=validateData(envelope.data,kind,expectedId);
        if(kind==='order' && expectedId && data.id!==expectedId)fail('Response belongs to another order.');
        return {data,status:response.status,method,path,engine};
      }catch(error){
        if(current!==generation)fail('Request superseded or cancelled.');
        if(controller.signal.aborted)fail('Request timed out. A write may have completed; refresh saved orders before trying again.');
        throw error;
      }finally{clearTimeout(timer);pending.delete(controller);}
    }
  };
}
