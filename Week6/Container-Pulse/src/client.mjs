// Import-safe client: no browser access or requests until requestRuntime is called.
const SAFE_HOSTNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const NODE_VERSION = /^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/;

export function validateRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { service, hostname, processUptimeSeconds, nodeVersion, appVersion } = value;
  if (service !== 'container-pulse'
    || typeof hostname !== 'string' || !SAFE_HOSTNAME.test(hostname)
    || typeof processUptimeSeconds !== 'number' || !Number.isFinite(processUptimeSeconds) || processUptimeSeconds < 0
    || typeof nodeVersion !== 'string' || nodeVersion.length > 128 || !NODE_VERSION.test(nodeVersion)
    || typeof appVersion !== 'string' || !SAFE_VERSION.test(appVersion)) return null;
  return { service, hostname, processUptimeSeconds, nodeVersion, appVersion };
}

function runtimePath(apiBase) {
  if (typeof apiBase !== 'string' || /[\s\\?#%@]/u.test(apiBase)) return null;
  let prefix = '';
  let pathname = apiBase;
  if (apiBase.startsWith('https://')) {
    // Validate raw input before URL parsing can normalize unsafe path segments.
    const absolute = /^(https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?)(\/.*)?$/.exec(apiBase);
    if (!absolute) return null;
    try {
      const parsed = new URL(absolute[1]);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password
        || !parsed.hostname.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return null;
    } catch { return null; }
    prefix = absolute[1];
    pathname = absolute[2] ?? '';
  }
  if (pathname !== '' && !/^\/(?:[A-Za-z0-9._-]+\/?)*$/.test(pathname)) return null;
  if (pathname.split('/').some(segment => segment === '.' || segment === '..')) return null;
  return `${prefix}${pathname.replace(/\/$/, '')}/api/runtime`;
}

/** A measured observation, not a health/replica-count assertion. Never returns error bodies. */
export async function requestRuntime(options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    signal,
    apiBase = globalThis.window?.ContainerPulseConfig?.apiBase ?? '',
    timeoutMs = 8000,
    now = () => globalThis.performance.now(),
  } = options;
  const started = now();
  let status = null;
  const elapsed = () => Math.max(0, now() - started);
  const failure = kind => ({ ok: false, kind, status, durationMs: elapsed() });
  const path = runtimePath(apiBase);
  if (!path) return failure('configuration');
  if (signal?.aborted) return failure('cancelled');
  const controller = new AbortController();
  let timer;
  let abortKind = null;
  let cancel;
  const cancellation = new Promise((_resolve, reject) => {
    cancel = kind => {
      abortKind = kind;
      controller.abort();
      reject(new Error('Runtime request interrupted'));
    };
  });
  const onAbort = () => cancel('cancelled');
  signal?.addEventListener('abort', onAbort, { once: true });
  const boundedTimeout = Number.isFinite(timeoutMs) ? Math.min(8000, Math.max(1, timeoutMs)) : 8000;
  timer = setTimeout(() => cancel('timeout'), boundedTimeout);
  try {
    const exchange = (async () => {
      const response = await fetchImpl(path, {
        method: 'GET', cache: 'no-store',
        credentials: path.startsWith('https://') ? 'omit' : 'same-origin',
        mode: path.startsWith('https://') ? 'cors' : 'same-origin',
        redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      status = response.status;
      if (!response.ok) return failure('http');
      let value;
      try { value = await response.json(); }
      catch { return failure('invalid-response'); }
      const metadata = validateRuntime(value);
      if (!metadata) return failure('invalid-response');
      return { ok: true, status, durationMs: elapsed(), metadata };
    })();
    return await Promise.race([exchange, cancellation]);
  } catch {
    return failure(abortKind ?? 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
