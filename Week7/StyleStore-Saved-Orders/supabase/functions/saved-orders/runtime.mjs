import { unavailable, isUuid } from '../../../shared/domain.mjs';

export function readConfig(get) {
  const url = get('SUPABASE_URL')?.replace(/\/$/,'');
  if (!url || !/^https?:\/\//.test(url)) throw new Error('SUPABASE_URL is required.');
  const keyMap = get('SUPABASE_PUBLISHABLE_KEYS');
  let publishableKey;
  if (keyMap !== undefined && keyMap !== null && keyMap !== '') {
    const parsed = JSON.parse(keyMap);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.hasOwn(parsed,'default') || typeof parsed.default !== 'string' || !parsed.default.startsWith('sb_publishable_')) throw new Error('SUPABASE_PUBLISHABLE_KEYS.default is required.');
    publishableKey = parsed.default;
  } else publishableKey = get('SUPABASE_PUBLISHABLE_KEY') || get('SUPABASE_ANON_KEY');
  if (!publishableKey || typeof publishableKey !== 'string' || publishableKey.startsWith('sb_secret_')) throw new Error('A publishable or legacy anon key is required.');
  const allowedOrigins = (get('ALLOWED_ORIGINS') || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (!allowedOrigins.length || allowedOrigins.some(origin=>{try{return !/^https?:/.test(origin)||new URL(origin).origin!==origin;}catch{return true;}})) throw new Error('ALLOWED_ORIGINS must list exact http(s) origins.');
  return { url, publishableKey, allowedOrigins, mongoUri:get('MONGODB_URI'), mongoDatabase:get('MONGODB_DB') || 'stylestore' };
}
export function createVerifyUser({ url, publishableKey, fetchImpl = fetch }) {
  return async token => {
    let response;
    try { response = await fetchImpl(`${url}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)}); }
    catch { throw unavailable(); }
    if ([401,403].includes(response.status)) return null;
    if (!response.ok) throw unavailable();
    let user;
    try { user = await response.json(); } catch { throw unavailable(); }
    return isUuid(user?.id) && user.role === 'authenticated' ? {id:user.id} : null;
  };
}
// A per-isolate lazy singleton. No connection on GET catalog/SQL requests, and no
// per-request close. Failure clears the promise so the next request may retry.
export function createLazyMongo({ MongoClient, uri, database }) {
  let pending;
  return function getMongo() {
    if (!pending) pending = (async()=>{
      if (!uri || !database) throw unavailable();
      const client = new MongoClient(uri,{maxPoolSize:5,minPoolSize:0,maxConnecting:2,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:10000,waitQueueTimeoutMS:5000,retryWrites:true});
      try { await client.connect(); return {client,db:client.db(database)}; }
      catch { try { await client.close(); } catch {} throw unavailable(); }
    })().catch(error=>{pending=undefined;throw error;});
    return pending;
  };
}
