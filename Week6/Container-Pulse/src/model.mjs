import { requestRuntime } from './client.mjs';

const emptyState = () => ({
  phase: 'idle', busy: false, latest: null, successCount: 0, durationMs: null,
  identities: [], notifications: [], message: 'Ready. No runtime checked yet.',
});

const failureMessages = {
  http: 'The runtime returned an HTTP error response.',
  'invalid-response': 'The runtime response did not match the expected contract.',
  network: 'The runtime could not be reached.',
  timeout: 'The runtime request timed out.',
  cancelled: 'The runtime request was cancelled.',
  configuration: 'The runtime API path is not a permitted same-origin path.',
};

/** Page-memory observations. Epoch ownership prevents any late result surviving Clear. */
export function createDashboardStore({ request = requestRuntime } = {}) {
  let state = emptyState();
  let epoch = 0;
  let sequence = 0;
  let controller = null;
  const subscribers = new Set();
  const emit = next => {
    state = next;
    for (const subscriber of subscribers) subscriber();
  };
  const cancel = () => {
    epoch++;
    controller?.abort();
    controller = null;
  };
  async function run(count) {
    if (state.busy) return;
    const ownership = ++epoch;
    controller = new AbortController();
    emit({ ...state, busy: true, phase: 'checking', latest: null, message: 'Checking runtime…' });
    for (let index = 0; index < count; index++) {
      if (ownership !== epoch) return;
      let result;
      try { result = await request({ signal: controller.signal }); }
      catch { result = { ok: false, kind: 'network', status: null, durationMs: null }; }
      if (ownership !== epoch) return;
      const notice = {
        id: ++sequence, ok: result.ok, status: result.status, durationMs: result.durationMs,
        hostname: result.ok ? result.metadata.hostname : null,
        message: result.ok ? 'Validated runtime response received.' : (failureMessages[result.kind] ?? failureMessages.network),
      };
      emit({
        ...state, busy: index < count - 1, phase: result.ok ? 'success' : 'failed',
        latest: result.ok ? result.metadata : null,
        successCount: state.successCount + (result.ok ? 1 : 0),
        durationMs: result.durationMs,
        identities: result.ok && !state.identities.includes(result.metadata.hostname)
          ? [...state.identities, result.metadata.hostname] : state.identities,
        notifications: [notice, ...state.notifications].slice(0, 12),
        message: result.ok ? `Response validated from ${result.metadata.hostname}.` : `Check failed. ${notice.message}`,
      });
    }
    if (ownership === epoch) controller = null;
  }
  return {
    getSnapshot: () => state,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    check: () => run(1),
    sample: () => run(6),
    clear() {
      cancel();
      emit(emptyState());
    },
    dispose() {
      cancel();
      subscribers.clear();
      state = { ...state, busy: false };
    },
  };
}
