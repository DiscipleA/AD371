import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const html = read('index.html');
const decode = text => text.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, entity => ({
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'",
})[entity]);
const match = /<code id="pulseBuildPrompt">([\s\S]*?)<\/code>/.exec(html);
assert.ok(match, 'The public full specification must remain in its existing copy target.');
const spec = decode(match[1]);
const prose = spec.replace(/\s+/g, ' ');
const includes = terms => {
  for (const term of terms) assert.ok(prose.includes(term), `Full specification is missing concrete requirement: ${term}`);
};

test('full specification has sequential numbered requirements separated by blank lines', () => {
  const requirements = [...spec.matchAll(/^(\d+)\. /gm)];
  assert.ok(requirements.length >= 10, 'A complete brief must cover more than a short summary.');
  requirements.forEach((requirement, index) => {
    assert.equal(Number(requirement[1]), index + 1, 'Requirement numbering must not repeat or skip.');
    assert.ok(spec.slice(0, requirement.index).endsWith('\n\n'), `Requirement ${index + 1} needs a blank line before it.`);
  });
  assert.doesNotMatch(match[1], /[<>]/, 'Code text must be HTML-escaped, not parsed as markup.');
});

test('full specification pins the implemented build and distinguishes gateway from equivalent replicas', () => {
  const dockerfile = read('Dockerfile');
  const compose = read('compose.yaml');
  const images = new Set([...dockerfile.matchAll(/^FROM (\S+)/gm)].map(item => item[1]));
  for (const image of images) assert.ok(spec.includes(image), `Missing actual image: ${image}`);
  assert.ok(spec.includes(/image: (nginx:\S+)/.exec(compose)[1]));
  includes(['interchangeable app replicas', 'gateway', 'package.json', 'package-lock.json',
    'npm ci --ignore-scripts', 'npm cache clean --force', 'COPY . .', 'npm run build',
    'dist/', 'server/', 'USER node', 'no application node_modules', 'React 19.3.1',
    'react-dom 19.3.1', 'Vite 8.3.6', 'Node.js >=22.12.0', 'assets/pulse.js',
    'publicDir: false', 'sourcemap: false', 'non-root', 'read_only', 'cap_drop: [ALL]',
    'no-new-privileges:true', 'no Docker socket']);
});

test('full specification states actual configuration limits, ports, probes and restart boundaries', () => {
  for (const setting of read('.env.example').trim().split('\n')) assert.ok(spec.includes(setting), setting);
  includes(['ad371-week6-container-pulse', 'ad371-week6-container-pulse-app:local',
    '127.0.0.1:${HOST_PORT:-8796}:8080', 'app:3000', 'REPLICAS:-2',
    '0.50 CPU', '128M', '128 PIDs', '0.25 CPU', '64M', '64 PIDs',
    'init: true', 'unless-stopped', '10s', '5s interval', '3s timeout', '5s start period',
    '6 retries', 'server/healthcheck.mjs', '2000 ms', '1024', 'service_healthy',
    '/tmp:rw,noexec,nosuid,size=16m,mode=1777', '127.0.0.11', 'valid=2s',
    'proxy_next_upstream_tries 3', 'Service unavailable', 'configured limits, not usage',
    'unhealthy status alone does not restart', 'apiBase', 'PORT', 'APP_VERSION']);
});

test('full specification spells out exact JSON fields, types and safe HTTP behavior', () => {
  includes(['{"status":"ok","service":"container-pulse"}',
    'service: "container-pulse"', 'hostname: string', 'processUptimeSeconds: number',
    'nodeVersion: string', 'appVersion: string', 'os.hostname()', 'process.uptime()', 'process.version',
    'GET and HEAD', 'Content-Length', '405', 'Allow: GET, HEAD', 'Method not allowed',
    '400', 'Bad request', '404', 'Not found', '500', 'Internal server error',
    '503', '2048', '8192', 'O_NOFOLLOW', 'no SPA fallback', 'no directory listing',
    'Cache-Control: no-store', 'X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer',
    "connect-src 'self'", "frame-ancestors 'none'", 'query', 'percent', 'symlink']);
});

test('full specification defines validation, on-demand state, cancellation and graph provenance', () => {
  includes(['validateRuntime', 'finite nonnegative', '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$',
    '^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$', 'extra fields', '8000 ms',
    'cache: no-store', 'credentials: same-origin', 'mode: same-origin', 'redirect: error',
    'Accept: application/json', 'Check runtime', 'Sample 6 checks', 'six sequential',
    'Clear', 'AbortController', 'epoch', 'Acknowledge', 'checkbox', 'idle', 'checking',
    'success', 'failed', 'latest: null', 'http', 'invalid-response', 'network',
    'timeout', 'cancelled', 'configuration', '12 completed checks', 'newest first',
    'oldest to newest', 'square', 'null', 'validated responses only',
    'page-memory', 'process uptime, not container uptime', 'not a replica inventory',
    'not CPU or RAM utilization', 'does not tick']);
});

test('full specification distinguishes standalone and approved split-host transport without weakening security', () => {
  includes(['reviewed static config', 'HTTPS', 'credentials: omit', 'mode: cors',
    'never URL query', 'Vary: Origin', 'Access-Control-Allow-Origin',
    'https://chernichenkodmitriy.com',
    'https://wild-resume-deployment.dmitriy-chernichenko.workers.dev',
    'http://127.0.0.1:8788', 'no wildcard', 'unknown origins',
    'static Resume', 'tunnel', 'browser-enforced CORS']);
  assert.doesNotMatch(prose, /does not implement remote-origin\/CORS/);
});

test('full specification prevents visual drift without reopening approved presentation', () => {
  includes(['Problem & Scope', 'Architecture Concepts', 'System Architecture', 'AI Prompt',
    'Audit', 'Working System', 'Verification', '1440 1180', 'xMidYMid meet',
    'one fixed-composition SVG', 'no mobile panel swap', 'four unboxed',
    'Review → Plan → Build → Verify', 'initially closed', 'bounded', 'copy target IDs',
    'four compact Audit checks', 'three compact notes', 'one desktop/tablet row',
    '600px', 'one-sentence', 'pulse-theme', 'pulse-style-theme', 'seven local themes',
    'light/dark', 'keyboard', 'focus', 'aria-live', 'reduced-motion', 'storage']);
  assert.match(html, /<details class="ai-build-prompt" data-implementation-spec>/);
});

test('full specification requires real source, build and scale evidence with restoration', () => {
  includes(['npm ci --ignore-scripts --no-bin-links', 'npm test', 'npm run build',
    'python3 -B tests/infra_test.py', 'docker compose --project-name ad371-week6-container-pulse config',
    'docker compose --project-name ad371-week6-container-pulse build',
    'docker compose --project-name ad371-week6-container-pulse up --detach',
    '--scale app=3', '--scale app=2', '2 → 3 → 2',
    'python3 -B scripts/verify-containers.py --allow-mutations', 'SIGTERM', 'SIGINT', 'SIGKILL',
    'restore two healthy replicas', 'image identity', 'protected projects',
    'source tests are not runtime evidence', 'blocked', 'no fabricated']);
});

test('full specification gives relative-file full-content deliverables and public/private output boundaries', () => {
  includes(['Reusable', 'fresh conversation', 'relative path', 'complete contents', 'no pseudocode',
    'no ellipses', 'no unrelated edits', 'README.md', 'AI-PROMPTS.md', '.env.example',
    'src/main.jsx', 'src/App.jsx', 'src/ObservationCharts.jsx', 'src/charts.mjs',
    'src/client.mjs', 'src/model.mjs', 'scripts/build.mjs', 'server/server.mjs',
    'server/healthcheck.mjs', 'infra/nginx.conf', 'tests/implementation_spec.test.mjs',
    'reusable public prompts', 'not historical submissions', 'private conversations',
    'account', 'tool/model/session', 'master prompts unchanged', 'publication', 'explicit approval']);
});

test('public appendix preserves all five literal blocks in Review Plan Build short/full Verify order', () => {
  const ids = ['pulseReviewPrompt', 'pulsePlanPrompt', 'pulseShortBuildPrompt', 'pulseBuildPrompt', 'pulseVerifyPrompt'];
  const expected = ids.map(id => {
    const block = new RegExp(`<code id="${id}">([\\s\\S]*?)<\\/code>`).exec(html);
    assert.ok(block, id);
    return decode(block[1]);
  });
  const appendix = read('AI-PROMPTS.md');
  const actual = [...appendix.matchAll(/```text\n([\s\S]*?)\n```/g)].map(block => block[1]);
  assert.deepEqual(actual, expected);
  assert.match(appendix, /Reusable showcase prompts — not historical submissions/);
});
