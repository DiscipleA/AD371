import { CATALOG } from '../../../shared/catalog.mjs';
import { DomainError, badRequest, notFound, conflict, unavailable, isUuid, validateMutation } from '../../../shared/domain.mjs';

const LIMIT = 8192;
async function readBody(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > LIMIT)) throw badRequest('Request body exceeds 8192 bytes.');
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw badRequest('Request body exceeds 8192 bytes.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return null;
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw badRequest('Use application/json.');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw badRequest('Malformed JSON.'); }
}
function route(pathname, method) {
  const root = pathname.match(/^\/(?:functions\/v1\/)?saved-orders(\/.*)?$/);
  if (!root) throw notFound();
  const path = root[1] || '/';
  if (path === '/catalog' && method === 'GET') return { op: 'catalog' };
  if (path === '/orders') {
    if (method === 'GET') return { op: 'listOrders' };
    if (method === 'POST') return { op: 'createOrder' };
    throw badRequest('Unsupported method.');
  }
  const match = path.match(/^\/orders\/([^/]+)(?:\/(items)(?:\/([^/]+))?)?$/);
  if (!match) throw notFound();
  const [,orderId,items,itemId] = match;
  if (!isUuid(orderId) || (itemId && !isUuid(itemId))) throw badRequest('Invalid UUID.');
  let op;
  if (!items) op = { GET: 'getOrder', PATCH: 'renameOrder', DELETE: 'deleteOrder' }[method];
  else if (!itemId && method === 'POST') op = 'addItem';
  else if (itemId) op = { PATCH: 'updateItem', DELETE: 'deleteItem' }[method];
  if (!op) throw badRequest('Unsupported method.');
  return { op, orderId, itemId };
}
export function createHandler({ verifyUser, sql, mongo, allowedOrigins = [] }) {
  const allowed = new Set(allowedOrigins.filter(origin => {
    try { return origin !== 'null' && new URL(origin).origin === origin && /^https?:/.test(origin); } catch { return false; }
  }));
  return async function handler(request) {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !allowed.has(origin)) throw badRequest('Origin is not allowed.');
      if (request.method === 'OPTIONS') {
        return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'600'}});
      }
      const authorization = request.headers.get('authorization') || '';
      const match = authorization.match(/^Bearer ([^\s]+)$/i);
      if (!match) throw new DomainError(401,'UNAUTHORIZED','A valid bearer token is required.');
      const token = match[1];
      const user = await verifyUser(token);
      if (!user || !isUuid(user.id)) throw new DomainError(401,'UNAUTHORIZED','A valid bearer token is required.');
      const url = new URL(request.url);
      if ([...url.searchParams.keys()].some(k => k !== 'engine') || url.searchParams.getAll('engine').length > 1) throw badRequest('Use a single engine selector.');
      const engine = url.searchParams.get('engine') ?? 'sql';
      if (!['sql','mongo'].includes(engine)) throw badRequest('Engine must be sql or mongo.');
      const target = route(url.pathname,request.method);
      const body = validateMutation(target.op,await readBody(request));
      if (target.op === 'catalog') return json(200,{ok:true,engine,data:CATALOG});
      const adapter = engine === 'sql' ? sql : mongo;
      if (!adapter) throw unavailable();
      const result = await adapter.execute({...target,body,token,ownerId:user.id});
      if (!result || ![200,201].includes(result.status)) {
        if (result?.status === 400) throw badRequest();
        if (result?.status === 401) throw new DomainError(401,'UNAUTHORIZED','A valid bearer token is required.');
        if (result?.status === 404) throw notFound();
        if (result?.status === 409) throw conflict();
        throw unavailable();
      }
      return json(result.status,{ok:true,engine,data:result.data});
    } catch (error) {
      const safe = error instanceof DomainError ? error : unavailable();
      return json(safe.status,{ok:false,error:{code:safe.code,message:safe.message}});
    }
  };
}
