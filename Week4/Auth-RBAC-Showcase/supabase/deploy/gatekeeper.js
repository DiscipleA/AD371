// Generated deploy bundle: exact tested shared handler followed by thin runtime bootstrap.
// Shared Web API handler: no SDK, no token decoding, no service-role credentials.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ERRORS = Object.freeze({400:'Invalid request.',401:'Authentication required.',403:'Access denied.',405:'Method not allowed.',503:'Service unavailable.'});
const CORS_HEADERS = ['authorization','apikey','content-type','x-client-info'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isEmail = value => typeof value === 'string' && value.length > 0 && value.length <= 320 && !/[\r\n\u0000]/.test(value);

function parseOrigin(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.includes('*')) throw new Error('Invalid origin');
  const url = new URL(value);
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid origin');
  return url.origin;
}

function configuration(env) {
  const raw = env?.SUPABASE_URL;
  const base = parseOrigin(raw);
  if (raw !== base && raw !== `${base}/`) throw new Error('Non-canonical URL');
  let publishable = env.SUPABASE_PUBLISHABLE_KEY;
  if (!publishable && env.SUPABASE_PUBLISHABLE_KEYS) {
    const dictionary = JSON.parse(env.SUPABASE_PUBLISHABLE_KEYS);
    if (!isObject(dictionary) || typeof dictionary.default !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(dictionary.default)) throw new Error('Invalid public key dictionary');
    publishable = dictionary.default;
  }
  const anon = env.SUPABASE_ANON_KEY;
  const key = publishable || anon;
  if (typeof key !== 'string' || key.length > 8192 || /[\s\u0000-\u001f]/.test(key)) throw new Error('Invalid key');
  if (publishable ? !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) : !COMPACT_JWT.test(key)) throw new Error('Use only public credentials');
  if (!publishable) {
    // This inspects trusted ENV CONFIGURATION only to reject accidentally supplied
    // service-role credentials. It is NOT caller-token verification or authorization.
    const encoded = key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4,'=')));
    if (!isObject(payload) || payload.role !== 'anon') throw new Error('Use anon configuration only');
  }
  if (typeof env.ALLOWED_ORIGINS !== 'string' || !env.ALLOWED_ORIGINS.trim()) throw new Error('Missing origins');
  const origins = new Set(env.ALLOWED_ORIGINS.split(',').map(value => {
    const exact = value.trim();
    if (parseOrigin(exact) !== exact) throw new Error('Use exact canonical origins');
    return exact;
  }));
  return Object.freeze({base,key,origins});
}

// Timer covers both response headers and JSON consumption. Promise.race also protects
// against a stalled peer/body that ignores AbortSignal; no remote body is logged.
async function fetchJSON(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Upstream timeout')); }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetchImpl(url,{...init,signal:controller.signal,redirect:'error',cache:'no-store'});
      if (!response.ok) {
        // Error bodies are neither needed nor safe to forward.
        await response.body?.cancel();
        return {status:response.status,body:null};
      }
      return {status:response.status,body:await response.json()};
    })(), timeout]);
  } finally { clearTimeout(timer); }
}

function safeSuccess(body, resource, identity) {
  if (!isObject(body) || body.resource !== resource || !isObject(body.user) || !isObject(body.data)) return null;
  const user = body.user;
  if (user.id !== identity.id || user.email !== identity.email || !['User','Admin'].includes(user.role) || (resource === 'admin' && user.role !== 'Admin')) return null;
  let data;
  if (resource === 'user') {
    if (body.data.scope !== 'own-account') return null;
    data = {scope:'own-account'};
  } else {
    if (typeof body.data.briefing !== 'string' || !body.data.briefing.length || body.data.briefing.length > 1000) return null;
    data = {briefing:body.data.briefing};
  }
  return {resource,message:resource === 'admin' ? 'Admin resource authorized.' : 'User resource authorized.',user:{id:user.id,email:user.email,role:user.role},data};
}

export function createHandler({env, fetchImpl = globalThis.fetch, timeoutMs = 8_000} = {}) {
  let config;
  try {
    config = configuration(env);
    if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) config = undefined;
  } catch { config = undefined; }
  return async function gatekeeper(request) {
    const origin = request.headers.get('origin');
    const allowedOrigin = config && origin !== null && config.origins.has(origin);
    const headers = new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'});
    if (allowedOrigin) headers.set('access-control-allow-origin',origin);
    const respond = (status, body = {error:ERRORS[status]}) => new Response(status === 204 ? null : JSON.stringify(body),{status,headers});
    if (!config) return respond(503);
    if (origin !== null && !allowedOrigin) return respond(403);
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin) return respond(403);
      headers.set('allow','GET, OPTIONS');
      if (request.headers.get('access-control-request-method') !== 'GET') return respond(405);
      const requested = request.headers.get('access-control-request-headers');
      if (requested && requested.split(',').some(header => !CORS_HEADERS.includes(header.trim().toLowerCase()))) return respond(400);
      headers.set('access-control-allow-methods','GET, OPTIONS');
      headers.set('access-control-allow-headers',CORS_HEADERS.join(', '));
      return respond(204);
    }
    if (request.method !== 'GET') { headers.set('allow','GET, OPTIONS'); return respond(405); }
    let resource;
    try {
      const url = new URL(request.url);
      const entries = [...url.searchParams];
      if (url.hash || entries.length !== 1 || entries[0][0] !== 'resource' || !['public','user','admin'].includes(entries[0][1])) return respond(400);
      resource = entries[0][1];
    } catch { return respond(400); }
    if (resource === 'public') return respond(200,{resource,message:'Public resource is available without authentication.'});
    const authorization = request.headers.get('authorization') || '';
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
    if (!match || match[1].length > 8192) return respond(401);
    const upstreamHeaders = {Authorization:`Bearer ${match[1]}`,apikey:config.key,'Content-Type':'application/json',Accept:'application/json'};
    try {
      const auth = await fetchJSON(fetchImpl,`${config.base}/auth/v1/user`,{method:'GET',headers:upstreamHeaders},timeoutMs);
      if ([400,401,403,422].includes(auth.status)) return respond(401);
      if (auth.status !== 200 || !isObject(auth.body) || !UUID.test(auth.body.id) || !isEmail(auth.body.email)) return respond(503);
      const rpc = await fetchJSON(fetchImpl,`${config.base}/rest/v1/rpc/gatekeeper_resource`,{method:'POST',headers:upstreamHeaders,body:JSON.stringify({p_resource:resource})},timeoutMs);
      if ([401,403].includes(rpc.status)) return respond(rpc.status);
      if (rpc.status !== 200 || !isObject(rpc.body) || ![200,400,401,403].includes(rpc.body.status)) return respond(503);
      if (rpc.body.status !== 200) return respond(rpc.body.status);
      const body = safeSuccess(rpc.body.body,resource,auth.body);
      return body ? respond(200,body) : respond(503);
    } catch { return respond(503); }
  };
}


// Public resource requires gateway JWT verification off; the shared handler
// explicitly validates every protected request through Auth and a guarded RPC.
Deno.serve(createHandler({
  env: {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_PUBLISHABLE_KEY: Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS'),
  },
}));
