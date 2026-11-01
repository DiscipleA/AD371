import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const moduleUrl = new URL('../server/server.mjs', import.meta.url);
let createStoreServer, root, dist, server, port;
before(async () => {
  ({ createStoreServer } = await import(moduleUrl));
  root = await mkdtemp(join(tmpdir(), 'stylestore-test-'));
  dist = join(root, 'dist');
  for (const dir of ['', 'assets', 'styles', 'docs', 'server', 'assets/nested']) await mkdir(join(dist, dir), { recursive: true });
  const files = { 'index.html': '<!doctype html><title>Store</title>', 'assets/app-ab12.js': 'export default 1;', 'styles/lab.css': 'body{}', 'assets/icon.svg': '<svg/>', 'assets/font.woff2': 'font', 'theme.js': 'theme', 'site-navigation.js': 'navigation', 'copy-code.js': 'copy', 'config.js': 'config', '.env': 'SECRET', 'docs/private.html': 'SECRET', 'server/server.mjs': 'SECRET', 'assets/app.js.map': 'SECRET', 'arbitrary.txt': 'SECRET', 'assets/.secret.js': 'SECRET' };
  for (const [name, value] of Object.entries(files)) await writeFile(join(dist, name), value);
  await writeFile(join(root, 'outside.js'), 'SECRET');
  await symlink(join(root, 'outside.js'), join(dist, 'assets', 'link.js'));
  await symlink(join(dist, 'assets', 'app-ab12.js'), join(dist, 'assets', 'inside-link.js'));
  await symlink(join(dist, 'assets'), join(dist, 'styles', 'linked'));
  server = createStoreServer({ serverId: 'store-a', distDir: dist });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); port = server.address().port;
});
after(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (root) await rm(root, { recursive: true, force: true }); });
function request(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
}
function safeHeaders(response) {
  assert.equal(response.headers['x-store-id'], 'store-a');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cache-control'], 'no-store');
}
test('health exposes the selected real replica identity', async () => {
  const r = await request('/healthz'); assert.equal(r.status, 200); safeHeaders(r);
  assert.deepEqual(JSON.parse(r.body), { status: 'ok', serverId: 'store-a' });
});
test('quote calculates exact integer cents for each allowed quantity', async () => {
  for (let n = 1; n <= 9; n++) {
    const r = await request(`/api/quote?quantity=${n}`); assert.equal(r.status, 200); safeHeaders(r);
    assert.match(r.headers['content-type'], /^application\/json/);
    assert.deepEqual(JSON.parse(r.body), { serverId: 'store-a', product: { id: 'retro-sneakers', name: 'Retro Sneakers', unitPriceCents: 8500 }, quantity: n, totalCents: 8500 * n, currency: 'USD' });
  }
});
test('quote requires exactly one known integer parameter without coercion', async () => {
  for (const query of ['', '?quantity=', '?quantity=0', '?quantity=10', '?quantity=-1', '?quantity=1.5', '?quantity=01', '?quantity=1e0', '?quantity=+1', '?quantity=%201', '?quantity=NaN', '?quantity=1&quantity=2', '?quantity=1&other=2', '?other=1', '?quantity=%', '?quantity=1&']) {
    const r = await request('/api/quote' + query); assert.equal(r.status, 400, query); safeHeaders(r); assert.deepEqual(JSON.parse(r.body), { error: 'Invalid quantity' });
  }
});
test('HEAD retains status/metadata without a body', async () => {
  for (const path of ['/', '/healthz', '/api/quote?quantity=2', '/missing']) { const r = await request(path, 'HEAD'); assert.equal(r.body, ''); safeHeaders(r); }
});
test('non-read methods are rejected safely with Allow', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) { const r = await request('/api/quote?quantity=1', method); assert.equal(r.status, 405); assert.equal(r.headers.allow, 'GET, HEAD'); safeHeaders(r); }
});
test('unknown API routes never fall through to frontend HTML', async () => {
  for (const path of ['/api/nope', '/api', '/api/health/store-b']) { const r = await request(path); assert.equal(r.status, 404); assert.deepEqual(JSON.parse(r.body), { error: 'Not found' }); }
});
test('only explicitly public build files are served with correct types', async () => {
  for (const [path, type] of [['/', 'text/html'], ['/index.html', 'text/html'], ['/assets/app-ab12.js', 'text/javascript'], ['/styles/lab.css', 'text/css'], ['/assets/icon.svg', 'image/svg+xml'], ['/assets/font.woff2', 'font/woff2'], ['/theme.js', 'text/javascript'], ['/site-navigation.js', 'text/javascript'], ['/copy-code.js', 'text/javascript'], ['/config.js', 'text/javascript']]) {
    const r = await request(path); assert.equal(r.status, 200, path); assert.ok(r.headers['content-type'].startsWith(type), path); safeHeaders(r);
    assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  }
});
test('theme-owned texture assets stay accessible inside the approved styles tree', async () => {
  const directory = join(dist, 'styles/themes/marble/assets/textures');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'veins.svg'), '<svg/>');
  const r = await request('/styles/themes/marble/assets/textures/veins.svg');
  assert.equal(r.status, 200); assert.equal(r.body, '<svg/>');
  assert.equal(r.headers['content-type'], 'image/svg+xml'); safeHeaders(r);
});
test('only the inspected theme registry and seven theme-config scripts are public', async () => {
  await mkdir(join(dist, 'styles/themes'), { recursive: true });
  await writeFile(join(dist, 'styles/themes/theme-registry.js'), 'registry');
  let r = await request('/styles/themes/theme-registry.js'); assert.equal(r.status, 200); assert.equal(r.body, 'registry');
  for (const name of ['standard', 'glossy-marble', 'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas', 'raggedy-granite', 'playful-pop', 'unknown']) {
    await mkdir(join(dist, 'styles/themes', name), { recursive: true });
    await writeFile(join(dist, 'styles/themes', name, 'theme-config.js'), 'config');
    r = await request(`/styles/themes/${name}/theme-config.js`);
    assert.equal(r.status, name === 'unknown' ? 404 : 200, name);
    if (name !== 'unknown') assert.match(r.headers['content-type'], /^text\/javascript/);
  }
  await writeFile(join(dist, 'styles/themes/standard/private.js'), 'SECRET');
  assert.equal((await request('/styles/themes/standard/private.js')).status, 404);
});
test('static boundary denies secrets, directories, source maps, traversal and all symlinks', async () => {
  for (const path of ['/.env', '/docs/private.html', '/server/server.mjs', '/assets/app.js.map', '/arbitrary.txt', '/assets/.secret.js', '/assets/link.js', '/assets/inside-link.js', '/styles/linked/app-ab12.js', '/assets/', '/styles', '/assets/../index.html', '/assets/%2e%2e/index.html', '/%2e%2e/outside.js', '/assets%2flink.js', '/assets\\app-ab12.js', '/assets/%5capp-ab12.js', '/%00', '/%', '//assets/app-ab12.js', '/assets//app-ab12.js', '/assets/app-ab12.js/extra', '/unknown-client-route']) {
    const r = await request(path); assert.equal(r.status, 404, path); safeHeaders(r); assert.equal(r.body, 'Not found\n', path); assert.match(r.headers['content-type'], /^text\/plain/); assert.ok(!r.body.includes('SECRET'));
  }
});
test('missing build files return safe 404 instead of a raw filesystem error', async () => {
  const r = await request('/assets/missing.js'); assert.equal(r.status, 404); assert.equal(r.body, 'Not found\n');
});
test('server identity is mandatory and confined to the two approved replicas', () => {
  for (const serverId of [undefined, '', 'store-c', 'A', '<script>']) assert.throws(() => createStoreServer({ serverId, distDir: dist }), /SERVER_ID/);
  const b = createStoreServer({ serverId: 'store-b', distDir: dist }); assert.ok(b); b.close();
});
test('CLI validates env, starts on an ephemeral port and exits gracefully on SIGTERM', async () => {
  const child = spawn(process.execPath, [moduleUrl.pathname], { env: { ...process.env, SERVER_ID: 'store-b', PORT: '0', DIST_DIR: dist }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { let out = ''; const timer = setTimeout(() => reject(new Error('startup timeout')), 5000); child.stdout.on('data', c => { out += c; if (/listening/.test(out)) { clearTimeout(timer); resolve(); } }); child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(new Error(`early exit ${code}`)); }); });
    child.kill('SIGTERM'); const [code, signal] = await once(child, 'exit'); assert.equal(code, 0); assert.equal(signal, null);
  } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
  for (const env of [{ SERVER_ID: 'bad', PORT: '0' }, { SERVER_ID: 'store-a', PORT: 'invalid' }]) {
    const invalid = spawn(process.execPath, [moduleUrl.pathname], { env: { ...process.env, ...env }, stdio: 'ignore' }); const [code] = await once(invalid, 'exit'); assert.equal(code, 1);
  }
});
