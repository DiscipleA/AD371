import {useEffect, useState, useSyncExternalStore} from 'react';
import {createLabSession} from './client.mjs';
import Storefront from './Storefront.jsx';
import NetworkMonitor from './NetworkMonitor.jsx';

export default function App() {
  const [session] = useState(() => createLabSession({apiBase: window.StyleStoreLabConfig?.apiBase}));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => () => session.dispose(), [session]);
  const disabled = state.busy || Boolean(state.configError);
  return <div className="stylestore-lab">
    <Storefront state={state} disabled={disabled} onQuantity={session.setQuantity} onQuote={() => session.runQuotes()} />
    <p className={`ss-status${state.configError ? ' ss-status--error' : ''}`} role="status" aria-live="polite" aria-atomic="true">{state.message}</p>
    <NetworkMonitor state={state} disabled={disabled} onBatch={() => session.runQuotes(10)} onHealth={session.checkHealth} onClear={session.clear} />
  </div>;
}
