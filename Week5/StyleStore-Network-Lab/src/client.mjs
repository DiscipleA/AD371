export const REQUEST_TIMEOUT_MS = 6000;
export const MAX_RESPONSE_BYTES = 16384;
const REPLICAS = Object.freeze(['store-a', 'store-b']);
const MESSAGES = Object.freeze({
  config: 'Configuration error: use an HTTPS API origin or local loopback HTTP origin.',
  quantity: 'Choose a whole-number quantity from 1 to 9.',
  replica: 'Unknown lab replica.',
  http: 'Lab unavailable: the gateway returned an unsuccessful HTTP status.',
  gateway: 'Unexpected response: Nginx gateway marker is missing or invalid.',
  content: 'Unexpected response: the lab must return JSON, not a web page.',
  json: 'Unexpected response: invalid JSON.',
  payload: 'Unexpected response: the lab data did not match the requested contract.',
  size: 'Unexpected response: the lab reply exceeded the 16 KiB limit.',
  network: 'Lab unavailable: the request could not be completed.',
  timeout: 'Lab unavailable: the request timed out.',
  aborted: 'Request canceled.',
});

export class LabError extends Error {
  constructor(code, status = null) {
    super(MESSAGES[code] ?? MESSAGES.network);
    this.name = 'LabError';
    this.code = code;
    this.status = status;
  }
}

export function validateApiBase(value = '') {
  if (value === '') return '';
  if (typeof value !== 'string' || value !== value.trim() || /[?#\\]/.test(value)) throw new LabError('config');
  let url;
  try {url = new URL(value);} catch {throw new LabError('config');}
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/') throw new LabError('config');
  return url.origin;
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validQuantity = value => Number.isInteger(value) && value >= 1 && value <= 9;

export function createClient({apiBase = '', fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS} = {}) {
  const base = validateApiBase(apiBase);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > REQUEST_TIMEOUT_MS) throw new LabError('config');

  async function request(path, validate, externalSignal) {
    if (externalSignal?.aborted) throw new LabError('aborted');
    const controller = new AbortController();
    const start = performance.now();
    let status = null, reader, timer, abort;
    const cancellation = new Promise((_, reject) => {
      abort = () => {reject(new LabError('aborted', status)); controller.abort();};
      externalSignal?.addEventListener('abort', abort, {once: true});
      timer = setTimeout(() => {reject(new LabError('timeout', status)); controller.abort();}, timeoutMs);
    });
    const work = async () => {
      const reply = await fetchImpl(`${base}${path}`, {
        method: 'GET', headers: {Accept: 'application/json'},
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      // A transport can ignore abort. Never start processing its late response.
      if (controller.signal.aborted) {void reply.body?.cancel().catch(() => {}); throw new LabError('aborted', status);}
      status = reply.status;
      if (status !== 200) {void reply.body?.cancel().catch(() => {}); throw new LabError('http', status);}
      if (reply.headers.get('X-Lab-Gateway') !== 'nginx') {void reply.body?.cancel().catch(() => {}); throw new LabError('gateway', status);}
      if (!/^application\/json(?:\s*;|$)/i.test(reply.headers.get('Content-Type') ?? '')) {void reply.body?.cancel().catch(() => {}); throw new LabError('content', status);}
      if (Number(reply.headers.get('Content-Length')) > MAX_RESPONSE_BYTES) {void reply.body?.cancel().catch(() => {}); throw new LabError('size', status);}
      if (!reply.body) throw new LabError('json', status);
      reader = reply.body.getReader();
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (controller.signal.aborted) throw new LabError('aborted', status);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new LabError('size', status);
        chunks.push(value);
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {buffer.set(chunk, offset); offset += chunk.byteLength;}
      let data;
      try {data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer));}
      catch {throw new LabError('json', status);}
      if (!validate(data)) throw new LabError('payload', status);
      return {data, status, durationMs: Math.max(0, performance.now() - start)};
    };
    try {return await Promise.race([work(), cancellation]);}
    catch (error) {throw error instanceof LabError ? error : new LabError('network', status);}
    finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
      if (reader) {void reader.cancel().catch(() => {});}
    }
  }

  return Object.freeze({
    async quote(quantity, {signal} = {}) {
      if (!validQuantity(quantity)) throw new LabError('quantity');
      return request(`/api/quote?quantity=${quantity}`, data => record(data) && REPLICAS.includes(data.serverId)
        && record(data.product) && data.product.id === 'retro-sneakers' && data.product.name === 'Retro Sneakers'
        && data.product.unitPriceCents === 8500 && data.currency === 'USD' && data.quantity === quantity
        && Number.isSafeInteger(data.totalCents) && data.totalCents === 8500 * quantity, signal);
    },
    async health(serverId, {signal} = {}) {
      if (!REPLICAS.includes(serverId)) throw new LabError('replica');
      return request(`/api/health/${serverId}`, data => record(data) && data.status === 'ok' && data.serverId === serverId, signal);
    },
  });
}

const unknownHealth = () => Object.fromEntries(REPLICAS.map(id => [id, {state: 'unknown', checkedAt: null, error: null}]));
const initialState = (quantity = '1', configError = '') => ({
  quantity, configError, busy: false, quote: null, counts: {'store-a': 0, 'store-b': 0}, failed: 0,
  trail: [], lastServer: null, gatewayObserved: false, health: unknownHealth(), message: configError || 'Not checked',
});

// The UI delegates state transitions to this unit-tested session. All observations
// are page-memory only. Epoch + abort reject late results, including ignored abort.
export function createLabSession({client, apiBase = '', fetchImpl = globalThis.fetch, batchDelayMs = 120} = {}) {
  let configError = '';
  try {client ??= createClient({apiBase, fetchImpl});}
  catch (error) {configError = error instanceof LabError ? error.message : MESSAGES.config;}
  let state = initialState('1', configError);
  let epoch = 0, active = null, disposed = false, number = 0;
  const listeners = new Set();
  const emit = patch => {
    if (disposed) return;
    state = {...state, ...patch};
    for (const listener of listeners) listener();
  };
  const current = job => !disposed && epoch === job.epoch && !job.controller.signal.aborted;
  const begin = message => {
    if (disposed || active || state.configError) return null;
    const job = {epoch, controller: new AbortController()};
    active = job; // Synchronous gate precedes render or listener notification.
    emit({busy: true, message});
    return job;
  };
  const finish = job => {if (current(job)) {active = null; emit({busy: false});}};
  const delay = signal => new Promise(resolve => {
    if (signal.aborted) return resolve();
    const done = () => {clearTimeout(timer); signal.removeEventListener('abort', done); resolve();};
    const timer = setTimeout(done, Math.max(0, Math.min(500, batchDelayMs)));
    signal.addEventListener('abort', done, {once: true});
  });

  return Object.freeze({
    getSnapshot: () => state,
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
    setQuantity(value) {
      if (active || disposed) return;
      emit({quantity: String(value), quote: null, message: state.configError || 'Quantity changed. Get a new quote.'});
    },
    async runQuotes(count = 1) {
      const quantity = /^[1-9]$/.test(state.quantity) ? Number(state.quantity) : NaN;
      if (!validQuantity(quantity)) {if (!active) emit({quote: null, message: MESSAGES.quantity}); return;}
      if (count !== 1 && count !== 10) return;
      const job = begin(count === 1 ? 'Requesting quote…' : 'Sending 10 serial quote requests…');
      if (!job) return;
      emit({quote: null});
      let successes = 0, failures = 0;
      try {
        for (let i = 0; i < count && current(job); i++) {
          const requestNumber = ++number;
          const requestId = `quote-${String(requestNumber).padStart(4, '0')}`;
          const start = performance.now();
          try {
            const result = await client.quote(quantity, {signal: job.controller.signal});
            if (!current(job)) return;
            successes++;
            const serverId = result.data.serverId;
            emit({quote: result.data, counts: {...state.counts, [serverId]: state.counts[serverId] + 1},
              lastServer: serverId, gatewayObserved: true,
              trail: [{number: requestNumber, requestId, serverId, status: result.status, durationMs: result.durationMs, error: null}, ...state.trail].slice(0, 20),
              message: `Quote validated from ${serverId}.`,
            });
          } catch (error) {
            if (!current(job)) return;
            failures++;
            const safe = error instanceof LabError ? error : new LabError('network');
            emit({quote: null, failed: state.failed + 1,
              trail: [{number: requestNumber, requestId, serverId: null, status: safe.status, durationMs: Math.max(0, performance.now() - start), error: safe.message}, ...state.trail].slice(0, 20),
              message: `${safe.message}${safe.status !== null ? ` HTTP ${safe.status}.` : ''}`,
            });
          }
          if (i < count - 1 && current(job)) await delay(job.controller.signal);
        }
        if (count === 10 && current(job)) emit({message: `Batch complete: ${successes} validated, ${failures} failed. Recent trail shows each attempt.`});
      } finally {finish(job);}
    },
    async checkHealth() {
      const job = begin('Checking both replicas…');
      if (!job) return;
      emit({health: Object.fromEntries(REPLICAS.map(id => [id, {...state.health[id], state: 'checking', error: null}]))});
      try {
        await Promise.all(REPLICAS.map(async id => {
          try {
            await client.health(id, {signal: job.controller.signal});
            if (current(job)) emit({gatewayObserved: true, health: {...state.health, [id]: {state: 'healthy', checkedAt: new Date().toISOString(), error: null}}});
          } catch (error) {
            if (!current(job)) return;
            const safe = error instanceof LabError ? error : new LabError('network');
            emit({health: {...state.health, [id]: {state: 'unavailable', checkedAt: new Date().toISOString(), error: `${safe.message}${safe.status !== null ? ` HTTP ${safe.status}.` : ''}`}}});
          }
        }));
        if (current(job)) emit({message: `Health check complete: ${REPLICAS.map(id => `${id} ${state.health[id].state}`).join('; ')}.`});
      } finally {finish(job);}
    },
    clear() {
      epoch++;
      active?.controller.abort();
      active = null;
      number = 0;
      emit(initialState(state.quantity, state.configError));
    },
    dispose() {
      disposed = true;
      epoch++;
      active?.controller.abort();
      active = null;
      listeners.clear();
    },
  });
}
