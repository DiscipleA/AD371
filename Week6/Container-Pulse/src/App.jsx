import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createDashboardStore } from './model.mjs';
import { summarizeObservations } from './charts.mjs';
import { LatencyChart, DistributionChart } from './ObservationCharts.jsx';

const duration = value => Number.isFinite(value) ? `${value.toFixed(1)} ms` : '—';
const httpLabel = status => status === null || status === undefined ? 'No HTTP response' : `HTTP ${status}`;
const phaseLabel = { idle: 'Not checked', checking: 'Checking', success: 'Observed response', failed: 'Check failed' };

export function RuntimeDetails({ metadata, phase }) {
  return (
    <section className="dash-card card-runtime" aria-labelledby="pulse-runtime-title">
      <div className="dash-card__header">
        <h4 id="pulse-runtime-title">Latest runtime</h4>
        <span className={`status-indicator status-indicator--${phase}`}>{phaseLabel[phase] ?? 'Not checked'}</span>
      </div>
      {metadata ? (
        <div className="runtime-observation">
          <div className="runtime-identity">

            <div>
              <p className="runtime-overline">Responding hostname</p>
              <p className="runtime-hostname">{metadata.hostname}</p>
            </div>
          </div>
          <dl className="runtime-properties">
            <div><dt>Service</dt><dd>{metadata.service}</dd></div>
            <div><dt>Process uptime</dt><dd>{metadata.processUptimeSeconds.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="runtime-unit">s</span></dd></div>
            <div><dt>Node.js version</dt><dd>{metadata.nodeVersion}</dd></div>
            <div><dt>App version</dt><dd>{metadata.appVersion}</dd></div>
          </dl>
          <p className="runtime-footnote">Captured at response time. Process uptime does not tick here.</p>
        </div>
      ) : (
        <div className="runtime-empty">

          <p className="runtime-empty__title">{phase === 'checking' ? 'Waiting for the runtime' : phase === 'failed' ? 'No verified runtime to display' : 'Awaiting a response'}</p>
          <p>{phase === 'failed' ? 'The last check failed. Retry to capture a fresh, validated response.' : 'Run a check to see which process answers this request.'}</p>
          <span className="runtime-endpoint">GET /api/runtime</span>
        </div>
      )}
    </section>
  );
}

export function MetricCard({ label, value, note, area }) {
  return (
    <section className={`dash-card card-${area}`} aria-label={label}>
      <h4 className="stat-label">{label}</h4>
      <span className="stat-number">{value}</span>
      <p className="stat-note">{note}</p>
    </section>
  );
}

export function NotificationCard({ event }) {
  return (
    <div className="notification-container">
      <article className={`notification-card notification-card--${event.ok ? 'success' : 'failure'}`}>
        <div className="card-visual" aria-hidden="true">{event.ok ? '✓' : '!'}</div>
        <div className="card-details">
          <p className="notification-sequence">Check {event.id} · {httpLabel(event.status)}</p>
          <h5 className="card-title">{event.ok ? event.hostname : 'Runtime check failed'}</h5>
          {!event.ok && <p className="card-message">{event.message}</p>}
          <p className="notification-duration">Browser duration: {duration(event.durationMs)}</p>
        </div>
        <div className="card-actions">
          <label className="action-check">
            <input type="checkbox" className="acknowledge-toggle" aria-label={`Acknowledge check ${event.id}`} />
            <span className="label-text">Acknowledge</span>
          </label>
        </div>
      </article>
    </div>
  );
}

export function RuntimeDashboard({ store }) {
  const activeStore = useMemo(() => store ?? createDashboardStore(), [store]);
  const state = useSyncExternalStore(activeStore.subscribe, activeStore.getSnapshot, activeStore.getSnapshot);
  const chartData = useMemo(() => summarizeObservations(state.notifications), [state.notifications]);
  useEffect(() => () => activeStore.dispose(), [activeStore]);
  return (
    <div className="pulse-dashboard">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Runtime observation workspace</p>
            <h3 className="dashboard-title">Container Pulse</h3>
            <p className="dashboard-subtitle">Trace response times. Compare responding processes. Inspect the evidence.</p>
          </div>
          <div className="dashboard-controls" role="group" aria-label="Runtime checks">
            <button type="button" className="pulse-button pulse-button--primary" disabled={state.busy} onClick={() => activeStore.check()}>{state.busy ? 'Checking…' : 'Check runtime'}</button>
            <button type="button" className="pulse-button" disabled={state.busy} onClick={() => activeStore.sample()}>Sample 6 checks</button>
            <button type="button" className="pulse-button pulse-button--clear" onClick={() => activeStore.clear()}>Clear</button>
          </div>
        </header>
        <p className={`dashboard-feedback dashboard-feedback--${state.phase}`} role="status" aria-live="polite" aria-atomic="true">{state.message}</p>
        <div className="dashboard-grid" aria-busy={state.busy}>
          <LatencyChart data={chartData} />
          <RuntimeDetails metadata={state.latest} phase={state.phase} />
          <MetricCard area="stat-a" label="Successful checks" value={state.successCount} note="Validated responses on this page" />
          <MetricCard area="stat-b" label="Last check duration" value={duration(state.durationMs)} note="Browser measured · request + response" />
          <section className="dash-card card-feed" aria-labelledby="pulse-feed-title">
            <div className="dash-card__header">
              <h4 id="pulse-feed-title">Response notifications</h4>
              <span className="event-count">{state.notifications.length} retained</span>
            </div>
            <p className="feed-hint">Newest first · up to 12 · acknowledgment stays on this page.</p>
            {state.notifications.length ? (
              <ul className="activity-list">{state.notifications.map(event => <li key={event.id}><NotificationCard event={event} /></li>)}</ul>
            ) : (
              <div className="feed-empty"><p>No notifications yet</p><p>Completed checks appear here, with their actual outcome and duration.</p></div>
            )}
            {state.notifications.length > 1 && <p className="feed-scroll-hint">Scroll history to inspect earlier checks.</p>}
          </section>
          <DistributionChart data={chartData} identities={state.identities} />
        </div>
        <p className="dashboard-footer">Checks run only on demand. Sample makes six sequential requests and may return the same hostname. Clear cancels pending work.</p>
      </div>
    </div>
  );
}

export default RuntimeDashboard;
