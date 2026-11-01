const healthLabel = {unknown: 'Not checked', checking: 'Checking…', healthy: 'Healthy at last check', unavailable: 'Unavailable at last check'};
const time = value => new Date(value).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

export default function NetworkMonitor({state, disabled, onBatch, onHealth, onClear}) {
  return <section className="ss-monitor" aria-labelledby="ss-monitor-title">
    <div className="ss-monitor-heading">
      <div><p className="ss-eyebrow">BEHIND YOUR QUOTE</p><h3 id="ss-monitor-title">Network monitor</h3></div>
      <div className="ss-monitor-actions" aria-label="Network lab controls">
        <button className="ss-button" type="button" onClick={onBatch} disabled={disabled}>Send 10 requests</button>
        <button className="ss-button" type="button" onClick={onHealth} disabled={disabled}>Check health</button>
        <button className="ss-button ss-button--clear" type="button" onClick={onClear}>Clear</button>
      </div>
    </div>
    <p className="ss-monitor-description">Nginx uses round-robin across two private replicas. Retries and other clients can change the observed sequence; equal counts are not guaranteed.</p>
    <dl className="ss-observations">
      <div><dt>Gateway observation</dt><dd>{state.gatewayObserved ? 'Nginx response observed' : 'Not checked'}</dd></div>
      <div><dt>Last quote response—not health</dt><dd className="ss-last-server">{state.lastServer || 'No quote response yet'}</dd></div>
      <div><dt>Failed quote attempts</dt><dd className="ss-count">{state.failed}</dd></div>
    </dl>
    <div className="ss-replicas">
      {['store-a', 'store-b'].map(id => {
        const health = state.health[id];
        return <article className="ss-replica" key={id} aria-label={`${id} observations`}>
          <div className="ss-replica-heading"><strong>{id}</strong><span className="ss-quote-count">{state.counts[id]} <span>validated quotes</span></span></div>
          <p className={`ss-health ss-health--${health.state}`}><span className="ss-health-dot" aria-hidden="true" />{healthLabel[health.state]}</p>
          {health.checkedAt && <p className="ss-checked-time">Checked <time dateTime={health.checkedAt} title={health.checkedAt}>{time(health.checkedAt)}</time></p>}
          {health.error && <p className="ss-health-error">{health.error}</p>}
        </article>;
      })}
    </div>
    <p className="ss-monitor-footnote">Session observations only. Quote counts are not health checks. The gateway header identifies the configured path; it is not independent security attestation.</p>
    <details className="ss-trail">
      <summary>Recent quote requests <span>{state.trail.length ? `· latest ${state.trail.length}, newest first` : '· no requests yet'}</span></summary>
      {state.trail.length ? <div className="ss-table-scroll" role="region" aria-label="Recent quote request table" tabIndex="0"><table>
        <caption>Browser-observed durations; at most 20 quote attempts. Request IDs are assigned locally. Health probes are not counted.</caption>
        <thead><tr><th scope="col">Request</th><th scope="col">Responding replica</th><th scope="col">HTTP</th><th scope="col">Duration</th><th scope="col">Result</th></tr></thead>
        <tbody>{state.trail.map(entry => <tr key={entry.requestId}>
          <th scope="row"><span>#{entry.number}</span> <code>{entry.requestId}</code></th>
          <td>{entry.serverId || 'Not validated'}</td><td>{entry.status ?? 'No response'}</td><td>{Math.round(entry.durationMs)} ms</td><td>{entry.error || 'Validated'}</td>
        </tr>)}</tbody>
      </table></div> : <p className="ss-empty-trail">Get a quote or send a batch to observe real responses. No requests run automatically.</p>}
    </details>
  </section>;
}
