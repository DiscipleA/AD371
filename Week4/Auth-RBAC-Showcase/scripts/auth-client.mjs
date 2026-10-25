/* Browser-only credentials. This module does not authorize users: the backend does. */
export function validateConfig(value) {
  try {
    const url = new URL(value?.supabaseUrl);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    if (!(url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) && !(local && url.protocol === 'http:')) throw new Error();
    const key = value.publishableKey;
    if (typeof key !== 'string' || key.length > 3000) throw new Error();
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      const parts = key.split('.');
      if (parts.length !== 3) throw new Error();
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      // This rejects accidental privileged configuration, NOT a cryptographic auth check.
      if (payload.role !== 'anon') throw new Error();
    }
    const functionName = value.functionName || 'gatekeeper';
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(functionName)) throw new Error();
    return { ok: true, config: { supabaseUrl: url.origin, publishableKey: key, functionName } };
  } catch {
    return { ok: false, error: 'Not connected. Supabase configuration is required; no requests have been made.' };
  }
}

export function validateCredentials(rawEmail, password, registering = false) {
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!email || typeof password !== 'string' || !password.length) return { ok: false, error: 'Enter your email and password.' };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (new TextEncoder().encode(password).length > 72) return { ok: false, error: 'Use a password no longer than 72 UTF-8 bytes.' };
  if (registering && [...password].length < 12) return { ok: false, error: 'For registration, use at least 12 characters.' };
  return { ok: true, email, password };
}

export function makeAuthClient(sdk, rawConfig) {
  const checked = validateConfig(rawConfig);
  if (!checked.ok || !sdk?.createClient) throw new Error('Supabase is not configured or its client could not load.');
  return sdk.createClient(checked.config.supabaseUrl, checked.config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'gatekeeper-memory-auth' }
  });
}

export function authFailureMessage(action, error) {
  if (error?.status === 429) return 'Too many attempts. Please wait before trying again.';
  if (action === 'login') return 'Invalid email or password.';
  if (action === 'logout') return 'Server logout could not be confirmed. This page has cleared its credentials; the prior session may remain valid until revoked or expired.';
  return 'Registration could not be completed. Check your details or try again later.';
}

const bounded = (text, limit = 600) => typeof text === 'string' ? text.slice(0, limit) : undefined;
export function safeResourceBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Unexpected server response.' };
  if (body.error) return { error: bounded(body.error) };
  const result = {};
  if (['public', 'user', 'admin'].includes(body.resource)) result.resource = body.resource;
  if (typeof body.message === 'string') result.message = bounded(body.message);
  if (body.user && typeof body.user.id === 'string' && ['User', 'Admin'].includes(body.user.role)) {
    result.user = { id: bounded(body.user.id, 100), email: bounded(body.user.email, 254), role: body.user.role };
  }
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    result.data = {};
    for (const key of ['briefing', 'title', 'description', 'notice', 'boundary', 'access', 'session', 'session_active', 'scope']) {
      if (typeof body.data[key] === 'string') result.data[key] = bounded(body.data[key]);
      if (typeof body.data[key] === 'boolean') result.data[key] = body.data[key];
    }
    for (const key of ['user_count', 'admin_count', 'totalUsers', 'totalAdmins']) {
      if (Number.isSafeInteger(body.data[key]) && body.data[key] >= 0) result.data[key] = body.data[key];
    }
  }
  return result;
}

export async function requestResource(rawConfig, resource, session, { fetcher = fetch, signal } = {}) {
  const checked = validateConfig(rawConfig);
  if (!checked.ok || !['public', 'user', 'admin'].includes(resource)) return { ok: false, status: null, body: { error: 'Request configuration is invalid.' } };
  const { config } = checked;
  const headers = { apikey: config.publishableKey, Accept: 'application/json' };
  if (resource !== 'public' && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const url = `${config.supabaseUrl}/functions/v1/${config.functionName}?resource=${resource}`;
  let receivedStatus = null;
  try {
    const response = await fetcher(url, { method: 'GET', headers, credentials: 'omit', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    receivedStatus = response.status;
    if (response.status >= 500) return { ok: false, status: response.status, body: { error: 'The service is unavailable. Please retry later.' } };
    if ([401, 403].includes(response.status)) return { ok: false, status: response.status, body: { error: response.status === 401 ? 'Unauthorized. Sign in with an active session.' : 'Forbidden. This resource requires the Admin role.' } };
    const body = await response.json();
    const safe = safeResourceBody(body);
    const validData = body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
      && (resource === 'user' ? body.data.scope === 'own-account'
        : resource === 'admin' && typeof body.data.briefing === 'string' && body.data.briefing.trim().length > 0 && body.data.briefing.length <= 1000);
    const validUser = resource === 'public' || (safe.user && typeof safe.user.email === 'string' && safe.user.email.length > 0
      && (!session?.user?.id || safe.user.id === session.user.id)
      && (resource !== 'admin' || safe.user.role === 'Admin') && validData);
    const validSuccess = safe.resource === resource && typeof safe.message === 'string' && safe.message.length > 0 && !safe.error && validUser;
    if (response.ok && !validSuccess) return { ok: false, status: response.status, body: { error: 'Unexpected server response. No valid resource delivery was verified.' } };
    return { ok: response.ok && validSuccess, status: response.status, body: safe };
  } catch (error) {
    if (receivedStatus !== null) return { ok: false, status: receivedStatus, body: { error: 'Unexpected or incomplete server response. No valid resource delivery was verified.' } };
    return { ok: false, status: null, cancelled: signal?.aborted || false, body: { error: error?.name === 'TimeoutError' ? 'The request timed out. No successful response was received.' : 'Unable to reach the service. No HTTP response was received.' } };
  }
}
