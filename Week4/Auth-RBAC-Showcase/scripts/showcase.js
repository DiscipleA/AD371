import { validateConfig, validateCredentials, makeAuthClient, authFailureMessage, requestResource } from './auth-client.mjs';

const byId = id => document.getElementById(id);
const setText = (id, text) => { const node = byId(id); if (node) node.textContent = text; };
const config = validateConfig(window.GatekeeperConfig);
let client = null;
let session = null;
let generation = 0;
let requestNumber = 0;
let pending = null;
let authBusy = false;
let signedInUserId = null;

function invalidateRequests() {
  generation += 1;
  pending?.abort();
  pending = null;
  requestNumber += 1;
}
function clearResult() {
  setText('request-status', 'Not requested');
  setText('request-output', 'Choose a resource to make a real request.');
  setText('request-message', 'Public is open. User requires a session. Admin also requires a trusted role.');
  for (const resource of ['public', 'user', 'admin']) byId(`request-${resource}`)?.removeAttribute('aria-pressed');
}
function showSession(next) {
  const changed = next?.user?.id !== signedInUserId;
  session = next?.access_token ? next : null;
  signedInUserId = session?.user?.id || null;
  if (changed) { invalidateRequests(); clearResult(); }
  setText('auth-session', session ? `Signed in as ${session.user.email || 'authenticated user'}` : 'Signed out');
  // A frontend role is only displayed after server verification, never trusted from metadata.
  if (changed || !session) setText('auth-role', session ? 'Awaiting server verification' : '—');
  if (byId('auth-logout')) byId('auth-logout').disabled = !session || authBusy;
}
function disableAuth(busy) {
  authBusy = busy;
  byId('auth-form')?.setAttribute('aria-busy', String(busy));
  for (const id of ['auth-register', 'auth-login', 'auth-email', 'auth-password']) if (byId(id)) byId(id).disabled = busy || !client;
  if (byId('auth-logout')) byId('auth-logout').disabled = busy || !session;
}
async function credentials(action) {
  if (!client || authBusy) return;
  const validation = validateCredentials(byId('auth-email')?.value, byId('auth-password')?.value, action === 'register');
  if (!validation.ok) { setText('auth-message', validation.error); return; }
  const { email, password } = validation;
  invalidateRequests();
  const ownGeneration = generation;
  disableAuth(true);
  setText('auth-message', action === 'register' ? 'Submitting registration securely…' : 'Signing in securely…');
  try {
    const result = action === 'register'
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (action === 'register') {
      if (result.data?.session) {
        showSession(result.data.session);
        setText('auth-message', 'Account created and signed in. The backend assigns User access; registration cannot grant Admin.');
      } else {
        setText('auth-message', 'If registration is eligible, a confirmation email will arrive. Confirm it, then return here and log in.');
      }
    } else if (result.data?.session) {
      showSession(result.data.session);
      setText('auth-message', 'Signed in. Try User access, then attempt the Admin resource.');
    } else {
      throw new Error('Session missing');
    }
  } catch (error) {
    // Auth provider details stay out of the UI. Network/provider errors can still be inspected in DevTools.
    setText('auth-message', authFailureMessage(action, error));
  } finally {
    if (byId('auth-password')) byId('auth-password').value = '';
    disableAuth(false);
  }
}

async function logout() {
  if (!client || authBusy) return;
  invalidateRequests();
  disableAuth(true);
  setText('auth-message', 'Signing out and revoking this session…');
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    showSession(null);
    setText('auth-message', 'Signed out. This page has cleared its credentials. Try User access again to inspect the server response.');
  } catch (error) {
    // Clear the local SDK state even if the remote sign-out could not be confirmed.
    client.auth.stopAutoRefresh();
    client = makeAuthClient(window.supabase, config.config);
    bindAuthEvents();
    showSession(null);
    setText('auth-message', authFailureMessage('logout', error));
  } finally {
    if (byId('auth-password')) byId('auth-password').value = '';
    disableAuth(false);
  }
}

async function runResource(resource) {
  if (!client) return;
  pending?.abort();
  pending = new AbortController();
  const signal = pending.signal;
  const ownGeneration = generation;
  const ownRequest = ++requestNumber;
  const stale = () => signal.aborted || ownGeneration !== generation || ownRequest !== requestNumber;
  setText('request-status', 'Requesting…');
  setText('request-output', 'Waiting for the server. No result has been received.');
  setText('request-message', `GET · ${resource} resource`);
  for (const item of ['public', 'user', 'admin']) byId(`request-${item}`)?.setAttribute('aria-pressed', String(item === resource));
  // getSession can refresh an expired memory token. It does not establish backend trust.
  if (resource !== 'public') {
    try {
      const result = await client.auth.getSession();
      if (stale()) return;
      if (!result.error) session = result.data?.session || null;
    } catch { if (stale()) return; session = null; }
  }
  const result = await requestResource(config.config, resource, session, { signal });
  if (stale()) return;
  setText('request-status', result.status === null ? 'No HTTP response' : `HTTP ${result.status}`);
  setText('request-output', JSON.stringify(result.body, null, 2));
  setText('request-message', result.ok ? 'The server returned this resource. The response below contains no credentials.' : result.body.error || 'The request was rejected.');
  if (result.ok && resource !== 'public' && result.body.user?.id === session?.user?.id) setText('auth-role', result.body.user.role);
  if (result.status === 401 && resource !== 'public') setText('auth-role', 'No active authorized session');
  if (result.status === 403 && resource === 'admin') setText('auth-role', 'Admin access denied');
  pending = null;
}
let subscription = null;
function bindAuthEvents() {
  subscription?.unsubscribe();
  subscription = client.auth.onAuthStateChange((_event, next) => { showSession(next); }).data.subscription;
}

async function init() {
  byId('auth-form')?.addEventListener('submit', event => { event.preventDefault(); void credentials('login'); });
  byId('auth-register')?.addEventListener('click', () => { void credentials('register'); });
  byId('auth-logout')?.addEventListener('click', () => { void logout(); });
  for (const resource of ['public', 'user', 'admin']) byId(`request-${resource}`)?.addEventListener('click', () => { void runResource(resource); });
  if (!config.ok || !window.supabase?.createClient) {
    setText('connection-status', 'Not connected');
    setText('auth-message', config.error || 'The Supabase client could not load. No authentication request was made.');
    for (const resource of ['public', 'user', 'admin']) if (byId(`request-${resource}`)) byId(`request-${resource}`).disabled = true;
    disableAuth(false);
    return;
  }
  try {
    client = makeAuthClient(window.supabase, config.config);
    setText('connection-status', 'Configured · awaiting request');
    setText('auth-message', 'Use a test-only account. New registrations may require email confirmation before login.');
    bindAuthEvents();
    showSession(null);
    for (const resource of ['public', 'user', 'admin']) if (byId(`request-${resource}`)) byId(`request-${resource}`).disabled = false;
    disableAuth(false);
  } catch {
    client = null;
    setText('connection-status', 'Configuration unavailable');
    setText('auth-message', 'The authentication client could not start. No successful connection is claimed.');
    disableAuth(false);
  }
}
void init();
