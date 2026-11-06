import test from 'node:test';
import assert from 'node:assert/strict';

// Controlled observations exercise the chart maths; these are never live-runtime evidence.
const charts = await import('../src/charts.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const summarize = events => {
  assert.equal(typeof charts.summarizeObservations, 'function', 'Real observation chart model is not implemented');
  return charts.summarizeObservations(events);
};
const notice = (id, hostname = 'replica-a', durationMs = id * 10, ok = true) => ({ id, hostname: ok ? hostname : null, durationMs, ok, status: ok ? 200 : 503 });

test('empty graphs have no invented samples, hostnames or successful responses', () => {
  const data = summarize([]);
  assert.deepEqual(data.samples, []);
  assert.deepEqual(data.hosts, []);
  assert.equal(data.total, 0);
  assert.equal(data.successful, 0);
  assert.equal(data.failed, 0);
  assert.equal(data.meanMs, null);
  assert.equal(data.maxMs, null);
});

test('latency samples are chronological measured values and preserve exact check identity', () => {
  const events = Object.freeze([Object.freeze(notice(3, 'replica-b', 30)), Object.freeze(notice(2, 'replica-a', 0)), Object.freeze(notice(1, 'replica-a', 15))]);
  const data = summarize(events);
  assert.deepEqual(data.samples.map(x => [x.id, x.durationMs]), [[1, 15], [2, 0], [3, 30]]);
  assert.equal(data.meanMs, 15);
  assert.equal(data.maxMs, 30);
  assert.equal(events[0].id, 3, 'Never reverse the store-owned array in place');
});

test('response distribution counts only validated successes with the same retained-window denominator', () => {
  const data = summarize([notice(4, 'replica-b'), notice(3, 'replica-a', 30, false), notice(2), notice(1)]);
  assert.equal(data.total, 4);
  assert.equal(data.successful, 3);
  assert.equal(data.failed, 1);
  assert.deepEqual(data.hosts.map(x => [x.hostname, x.count]), [['replica-a', 2], ['replica-b', 1]]);
  assert.equal(data.hosts.reduce((n, x) => n + x.share, 0), 1);
  assert.equal(data.hosts[0].share, 2 / 3);
  assert.equal(data.samples[2].ok, false);
});

test('graphs retain at most the newest twelve completed checks, not cumulative page totals', () => {
  const events = Array.from({ length: 20 }, (_, i) => notice(20 - i, i < 12 ? 'recent' : 'expired'));
  const data = summarize(events);
  assert.equal(data.total, 12);
  assert.deepEqual(data.samples.map(x => x.id), Array.from({ length: 12 }, (_, i) => i + 9));
  assert.deepEqual(data.hosts.map(x => x.hostname), ['recent']);
});

test('missing or invalid timing stays unplotted instead of becoming zero milliseconds', () => {
  const values = [null, undefined, NaN, Infinity, -1, '25', 0, 25];
  const data = summarize(values.map((value, index) => ({ ...notice(values.length - index), durationMs: value })));
  assert.deepEqual(data.samples.map(x => x.durationMs), [25, 0, null, null, null, null, null, null]);
  assert.equal(data.meanMs, 12.5);
  assert.equal(data.maxMs, 25);
});

test('failed measured requests remain in latency history but never become replica responses', () => {
  const data = summarize([notice(2, null, 15, false), notice(1, null, null, false)]);
  assert.equal(data.failed, 2);
  assert.equal(data.successful, 0);
  assert.deepEqual(data.hosts, []);
  assert.equal(data.samples[1].durationMs, 15);
  assert.equal(data.meanMs, 15);
});

test('chart coordinates are finite, bounded and break the line at unavailable timing', () => {
  const data = summarize([notice(3, 'replica-a', 0), notice(2, 'replica-a', null), notice(1, 'replica-a', 30)]);
  assert.equal(data.scaleMs, 30);
  assert.equal(data.segments.length, 2);
  assert.equal(data.samples[1].y, null);
  for (const sample of data.samples.filter(x => x.y !== null)) {
    assert.ok(Number.isFinite(sample.x) && Number.isFinite(sample.y));
    assert.ok(sample.x >= 12 && sample.x <= 588 && sample.y >= 12 && sample.y <= 188);
  }
  const zero = summarize([notice(1, 'replica-a', 0)]);
  assert.equal(zero.scaleMs, 1);
  assert.equal(zero.samples[0].x, 300);
  assert.equal(zero.samples[0].y, 188);
});

test('hostname grouping does not confuse object prototype property names with existing groups', () => {
  const data = summarize([notice(3, '__proto__'), notice(2, 'constructor'), notice(1, '__proto__')]);
  assert.deepEqual(data.hosts.map(x => [x.hostname, x.count]), [['__proto__', 2], ['constructor', 1]]);
});
