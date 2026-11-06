/** Derive both graphs from the same bounded, newest-first notification window. */
export function summarizeObservations(notifications) {
  const samples = notifications.slice(0, 12).reverse().map(event => ({
    id: event.id, ok: event.ok, hostname: event.hostname,
    durationMs: Number.isFinite(event.durationMs) && event.durationMs >= 0 ? event.durationMs : null,
  }));
  const timed = samples.filter(sample => sample.durationMs !== null);
  const maxMs = timed.length ? Math.max(...timed.map(sample => sample.durationMs)) : null;
  const scaleMs = Math.max(1, maxMs ?? 0);
  const segments = [];
  let segment = [];
  for (const [index, sample] of samples.entries()) {
    sample.x = samples.length === 1 ? 300 : 12 + index / (samples.length - 1) * 576;
    sample.y = sample.durationMs === null ? null : 188 - sample.durationMs / scaleMs * 176;
    if (sample.y === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(sample);
  }
  if (segment.length) segments.push(segment);
  const counts = new Map();
  let successful = 0;
  for (const sample of samples) {
    if (!sample.ok) continue;
    successful++;
    counts.set(sample.hostname, (counts.get(sample.hostname) ?? 0) + 1);
  }
  let offset = 0;
  const hosts = [...counts].map(([hostname, count]) => {
    const share = count / successful;
    const host = { hostname, count, share, offset };
    offset += share;
    return host;
  });
  return {
    samples, segments, hosts, total: samples.length, successful, failed: samples.length - successful,
    meanMs: timed.length ? timed.reduce((sum, sample) => sum + sample.durationMs, 0) / timed.length : null,
    maxMs, scaleMs,
  };
}
