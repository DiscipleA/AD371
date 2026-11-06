import React, { useId } from 'react';

const duration = value => Number.isFinite(value) ? `${value.toFixed(1)} ms` : '—';
const series = index => `var(--pulse-series-${index % 4})`;

export function LatencyChart({ data }) {
  const id = useId();
  const timed = data.samples.filter(sample => sample.y !== null);
  return (
    <section className="dash-card card-latency" aria-labelledby={`${id}-heading`}>
      <div className="dash-card__header">
        <h4 id={`${id}-heading`}>Response time <span className="chart-window">{data.total} / 12 checks</span></h4>
        <div className="chart-summary">
          <p><span>Average</span><strong>{duration(data.meanMs)}</strong></p>
          <p><span>Peak</span><strong>{duration(data.maxMs)}</strong></p>
        </div>
      </div>
      <div className="latency-chart">
        <div className="chart-axis chart-axis--y" aria-hidden="true"><span>{timed.length ? data.scaleMs.toFixed(1) : '—'}</span><span>{timed.length ? (data.scaleMs / 2).toFixed(1) : '—'}</span><span>0 ms</span></div>
        <div className="latency-plot">
          <svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-labelledby={`${id}-title ${id}-description`}>
            <title id={`${id}-title`}>Browser response time</title>
            <desc id={`${id}-description`}>{timed.length ? `${timed.length} timed checks, oldest to newest. Average ${duration(data.meanMs)}. Failed checks use square markers. Exact outcomes and durations are listed in Response notifications.` : 'No measured runtime checks yet. Run a check or sample six requests to populate this graph.'}</desc>
            {[12, 56, 100, 144, 188].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} className="chart-gridline" vectorEffect="non-scaling-stroke" />)}
            {data.segments.filter(segment => segment.length > 1).map((segment, index) => <g key={index}>
              <polygon points={`${segment[0].x},200 ${segment.map(sample => `${sample.x},${sample.y}`).join(' ')} ${segment.at(-1).x},200`} className="chart-area" />
              <polyline points={segment.map(sample => `${sample.x},${sample.y}`).join(' ')} className="chart-line" vectorEffect="non-scaling-stroke" />
            </g>)}
            {timed.map(sample => <svg key={sample.id} x={sample.x} y={sample.y} overflow="visible" width="1" height="1">
              {sample.ok ? <circle r="3" className="chart-point" data-check-id={sample.id} data-outcome="validated" data-duration-ms={sample.durationMs}><title>{`Check ${sample.id} · ${duration(sample.durationMs)} · ${sample.hostname}`}</title></circle> : <rect x="-3" y="-3" width="6" height="6" className="chart-point chart-point--failed" data-check-id={sample.id} data-outcome="failed" data-duration-ms={sample.durationMs}><title>{`Check ${sample.id} · ${duration(sample.durationMs)} · failed`}</title></rect>}
            </svg>)}
          </svg>
          {!timed.length && <div className="chart-empty"><strong>Awaiting measured requests</strong><span>Sample 6 checks to draw your first trace.</span></div>}
        </div>
        <div className="chart-axis chart-axis--x" aria-hidden="true"><span>{data.total ? `Check ${data.samples[0].id}` : 'Oldest'}</span><span>{data.total ? `Check ${data.samples.at(-1).id}` : 'Newest'}</span></div>
      </div>
      <div className="chart-footer"><div className="chart-legend"><span><i className="chart-key" />Validated</span><span><i className="chart-key chart-key--failed" />Failed</span></div><p className="chart-caption">Most recent 12 completed checks · browser request + response in ms</p></div>
    </section>
  );
}

export function DistributionChart({ data, identities }) {
  const id = useId();
  const validatedShare = data.total ? data.successful / data.total * 100 : 0;
  return (
    <section className="dash-card card-status" aria-labelledby={`${id}-heading`}>
      <div className="dash-card__header">
        <h4 id={`${id}-heading`}>Response distribution</h4>
        <span className="cluster-summary">{identities.length} distinct {identities.length === 1 ? 'hostname' : 'hostnames'} seen this page</span>
      </div>
      <div className="distribution-layout">
        <div className="window-gauge">
          <div className="distribution-ring">
            <svg viewBox="0 0 120 120" role="img" aria-labelledby={`${id}-title`}>
              <title id={`${id}-title`}>{`${data.successful} validated and ${data.failed} failed checks in the retained window.`}</title>
              <circle cx="60" cy="60" r="48" className="ring-track" />
              {data.total > 0 && <>
                <circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="var(--pulse-accent)" strokeWidth="10" strokeDasharray={`${validatedShare} ${100 - validatedShare}`} transform="rotate(-90 60 60)" />
                <circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="var(--pulse-danger)" strokeWidth="10" strokeDasharray={`${100 - validatedShare} ${validatedShare}`} strokeDashoffset={-validatedShare} transform="rotate(-90 60 60)" />
              </>}
            </svg>
            <div className="ring-label" aria-hidden="true"><strong>{data.total ? `${data.successful}/${data.total}` : '—'}</strong><span>validated</span></div>
          </div>
          <div className="window-gauge-label"><strong>Check outcomes</strong><span>{data.successful} validated · {data.failed} failed</span></div>
        </div>
        {data.hosts.length ? <ul className="host-distribution">{data.hosts.map((host, index) => <li key={host.hostname} data-hostname={host.hostname} data-response-count={host.count} style={{ '--host-color': series(index) }}>
          <div className="host-gauge">
            <svg viewBox="0 0 72 72" role="img" aria-labelledby={`${id}-host-${index}`}>
              <title id={`${id}-host-${index}`}>{`${host.hostname}: ${host.count} of ${data.successful} validated responses, ${(host.share * 100).toFixed(0)} percent.`}</title>
              <circle cx="36" cy="36" r="28" className="ring-track" />
              <circle cx="36" cy="36" r="28" pathLength="100" fill="none" stroke={series(index)} strokeWidth="6" strokeDasharray={`${host.share * 100} ${100 - host.share * 100}`} transform="rotate(-90 36 36)" />
            </svg>
            <span className="host-gauge-value" aria-hidden="true">{(host.share * 100).toFixed(0)}<small>%</small></span>
          </div>
          <div className="host-gauge-label"><span className="host-label">{host.hostname}</span><span className="host-count">{host.count} of {data.successful} <span>validated responses</span></span></div>
        </li>)}</ul> : <div className="distribution-empty"><strong>No validated responses yet</strong><p>Per-host gauges appear after actual checks.</p></div>}
      </div>
      <p className="observation-scope">Current page observations, not a total replica count or a health assessment. Host shares exclude failed checks; all gauges use the most recent 12 checks.</p>
    </section>
  );
}
