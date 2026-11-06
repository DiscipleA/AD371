import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const implementation = new URL('../server/server.mjs', import.meta.url);
const scratch = path.join(os.tmpdir(), 'ad371-week6-container-pulse');

async function fixture(t, options = {}) {
  assert.ok(existsSync(implementation), 'Container Pulse server implementation is missing');
  const { createPulseServer } = await import(implementation);
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, 'backend-test-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const distDir = path.join(directory, 'dist');
  await mkdir(path.join(distDir, 'assets'), { recursive: true });
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Container Pulse</title>');
  await writeFile(path.join(distDir, 'assets', 'app-123.js'), 'console.log("pulse");');
  await writeFile(path.join(distDir, 'assets', 'app-123.css'), ':root{color:blue}');
  await writeFile(path.join(directory, 'private.txt'), 'DO_NOT_EXPOSE');
  await writeFile(path.join(distDir, 'assets', 'app.js.map'), 'DO_NOT_EXPOSE');
  await writeFile(path.join(distDir, '.env'), 'SECRET=DO_NOT_EXPOSE');
  const server = createPulseServer({ distDir, appVersion: '1.2.3-test', ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { server, distDir, request: (pathname, method = 'GET') => request(server.address().port, pathname, method) };
}

function request(port, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('health endpoint returns the exact public health contract', async t => {
  const f = await fixture(t);
  const response = await f.request('/healthz');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok', service: 'container-pulse' });
});

test('runtime exposes only the five approved live values', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/runtime');
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(Object.keys(body).sort(), ['appVersion', 'hostname', 'nodeVersion', 'processUptimeSeconds', 'service']);
  assert.equal(body.service, 'container-pulse');
  assert.equal(body.hostname, os.hostname());
  assert.equal(body.nodeVersion, process.version);
  assert.equal(body.appVersion, '1.2.3-test');
  assert.equal(typeof body.processUptimeSeconds, 'number');
  assert.ok(Number.isFinite(body.processUptimeSeconds) && body.processUptimeSeconds >= 0);
});

test('unsafe configured versions are replaced with a safe default', async t => {
  const f = await fixture(t, { appVersion: '<script>secret</script>\n' });
  assert.equal(JSON.parse((await f.request('/api/runtime')).body).appVersion, '1.0.0');
});

test('runtime uptime advances rather than returning a fixture value', async t => {
  const f = await fixture(t);
  const first = JSON.parse((await f.request('/api/runtime')).body).processUptimeSeconds;
  await new Promise(resolve => setTimeout(resolve, 30));
  const second = JSON.parse((await f.request('/api/runtime')).body).processUptimeSeconds;
  assert.ok(second > first);
});

test('landing and allowlisted bundled files are served with correct MIME types', async t => {
  const f = await fixture(t);
  for (const [pathname, contentType, body] of [
    ['/', 'text/html; charset=utf-8', '<!doctype html>'],
    ['/index.html', 'text/html; charset=utf-8', '<!doctype html>'],
    ['/assets/app-123.js', 'text/javascript; charset=utf-8', 'console.log'],
    ['/assets/app-123.css', 'text/css; charset=utf-8', ':root'],
  ]) {
    const response = await f.request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers['content-type'], contentType);
    assert.ok(response.body.includes(body));
  }
});

test('production-layout shared scripts, styles and all seven theme packages are public', async t => {
  const f = await fixture(t);
  const themes = ['standard', 'playful-pop', 'raggedy-granite', 'glossy-marble', 'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'];
  const publicFiles = [
    ...['theme.js', 'site-navigation.js', 'copy-code.js', 'config.js', 'styles/themes/theme-registry.js'].map(name => [name, 'text/javascript; charset=utf-8']),
    ...['shared/base.css', 'shared/navigation.css', 'auth-rbac-showcase.css', 'pulse-showcase.css', 'pulse-dashboard.css'].map(name => [`styles/${name}`, 'text/css; charset=utf-8']),
    ...themes.flatMap(theme => [
      [`styles/themes/${theme}/theme-config.js`, 'text/javascript; charset=utf-8'],
      [`styles/themes/${theme}/theme.css`, 'text/css; charset=utf-8'],
      [`styles/themes/${theme}/assets/icons/favicon.svg`, 'image/svg+xml'],
      [`styles/themes/${theme}/assets/icons/apple-touch-icon.svg`, 'image/svg+xml'],
    ]),
    ...[
      ['glossy-marble', 'marble-veins.svg'],
      ['luminous-midnight', 'luminous-grid.svg'],
      ['gothic-stickerboard', 'cathedral-collage.svg'],
      ['baroque-plexiglas', 'filigree-refraction.svg'],
      ['baroque-plexiglas', 'prism-facets.svg'],
    ].map(([theme, name]) => [`styles/themes/${theme}/assets/textures/${name}`, 'image/svg+xml']),
  ];
  for (const [name] of publicFiles) {
    await mkdir(path.dirname(path.join(f.distDir, name)), { recursive: true });
    await writeFile(path.join(f.distDir, name), `public fixture: ${name}`);
  }
  for (const [name, contentType] of publicFiles) {
    const response = await f.request(`/${name}`);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers['content-type'], contentType, name);
    assert.equal(response.body, `public fixture: ${name}`);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(response.headers['content-security-policy'].includes("script-src 'self'"));
    const head = await f.request(`/${name}`, 'HEAD');
    assert.equal(head.status, 200, name);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], response.headers['content-length']);
  }
});

test('automatic favicon requests serve only the known standard-theme icon', async t => {
  const f = await fixture(t);
  const icon = path.join(f.distDir, 'styles/themes/standard/assets/icons/favicon.svg');
  await mkdir(path.dirname(icon), { recursive: true });
  await writeFile(icon, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await writeFile(path.join(f.distDir, 'favicon.ico'), 'DO_NOT_EXPOSE');
  const response = await f.request('/favicon.ico');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'image/svg+xml');
  assert.equal(response.body, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await rm(icon);
  assert.equal((await f.request('/favicon.ico')).status, 404);
});

test('production layout does not expose arbitrary scripts, styles, themes or protected directories', async t => {
  const f = await fixture(t);
  for (const name of [
    'debug.js', 'theme.js.map', 'other.html', 'config.json', 'styles/debug.js', 'styles/private.css',
    'styles/shared/private.css', 'styles/themes/debug.js', 'styles/themes/theme-registry.js.map',
    'styles/themes/unknown/theme-config.js', 'styles/themes/unknown/theme.css',
    'styles/themes/standard/server.js', 'styles/themes/standard/private.css', 'styles/themes/standard/index.html',
    'styles/themes/standard/theme-config.js.map', 'styles/themes/standard/assets/icons/server.js',
    'styles/themes/standard/assets/textures/server.js', 'styles/themes/standard/assets/icons/private.svg.map',
    'styles/themes/standard/assets/icons/.private.svg', 'styles/themes/standard/assets/icons/nested/private.svg',
    'styles/themes/standard/node_modules/private.svg', 'styles/themes/standard/assets/node_modules/private.svg',
    'node_modules/private.js', 'docs/private.css', 'env/private.js', 'src/private.js',
    'server/private.js', 'infra/private.css', '.env', 'styles/.env',
  ]) {
    await mkdir(path.dirname(path.join(f.distDir, name)), { recursive: true });
    await writeFile(path.join(f.distDir, name), 'DO_NOT_EXPOSE');
    const response = await f.request(`/${name}`);
    assert.equal(response.status, 404, name);
    assert.deepEqual(JSON.parse(response.body), { error: 'Not found' }, name);
  }
});

test('production-layout allowlisted files retain symlink containment and no-follow protection', async t => {
  const f = await fixture(t);
  for (const name of ['theme.js', 'styles/shared/base.css', 'styles/themes/standard/theme-config.js', 'styles/themes/standard/assets/icons/favicon.svg']) {
    await mkdir(path.dirname(path.join(f.distDir, name)), { recursive: true });
    // Both an outside target and an otherwise-public inside target must stay blocked.
    for (const target of [path.join(f.distDir, '..', 'private.txt'), path.join(f.distDir, 'assets/app-123.js')]) {
      await symlink(target, path.join(f.distDir, name));
      const response = await f.request(`/${name}`);
      assert.equal(response.status, 404, name);
      assert.ok(!response.body.includes('DO_NOT_EXPOSE'));
      await rm(path.join(f.distDir, name));
    }
  }
  const outside = path.join(f.distDir, '..', 'outside-theme');
  await mkdir(outside);
  await writeFile(path.join(outside, 'theme-config.js'), 'DO_NOT_EXPOSE');
  await symlink(outside, path.join(f.distDir, 'styles/themes/playful-pop'));
  assert.equal((await f.request('/styles/themes/playful-pop/theme-config.js')).status, 404);
});

test('HEAD preserves status and content length but never sends a body', async t => {
  const f = await fixture(t);
  for (const pathname of ['/', '/healthz', '/api/runtime', '/assets/app-123.js', '/missing']) {
    const response = await f.request(pathname, 'HEAD');
    assert.equal(response.status, pathname === '/missing' ? 404 : 200);
    assert.equal(response.body, '');
    assert.ok(Number(response.headers['content-length']) > 0);
  }
});

test('methods other than GET and HEAD are rejected with a safe Allow header', async t => {
  const f = await fixture(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await f.request('/api/runtime', method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.deepEqual(JSON.parse(response.body), { error: 'Method not allowed' });
  }
});

test('CONNECT cannot create a tunnel and receives an explicit 405', async t => {
  const f = await fixture(t);
  const response = await new Promise((resolve, reject) => {
    let response = '';
    const socket = net.connect(f.server.address().port, '127.0.0.1', () => {
      socket.end('CONNECT example.invalid:443 HTTP/1.1\r\nHost: example.invalid\r\nConnection: close\r\n\r\n');
    });
    socket.setTimeout(2000, () => { socket.destroy(new Error('CONNECT response timed out')); });
    socket.on('data', chunk => { response += chunk; });
    socket.once('error', reject);
    socket.once('end', () => resolve(response));
  });
  assert.match(response, /^HTTP\/1\.1 405 Method Not Allowed/);
  assert.match(response.toLowerCase(), /allow: get, head/);
  assert.match(response.toLowerCase(), /cache-control: no-store/);
});

test('malformed HTTP receives sanitized security headers without reflecting input', async t => {
  const f = await fixture(t);
  const response = await new Promise((resolve, reject) => {
    let output = '';
    const socket = net.connect(f.server.address().port, '127.0.0.1', () => {
      socket.end('GET / HTTP/1.1\r\nHost: localhost\r\nBad Header: SHOULD_NOT_REFLECT\r\n\r\n');
    });
    socket.setTimeout(2000, () => { socket.destroy(new Error('Malformed HTTP response timed out')); });
    socket.on('data', chunk => { output += chunk; });
    socket.once('error', reject);
    socket.once('end', () => resolve(output));
  });
  assert.match(response, /^HTTP\/1\.1 400 Bad Request/);
  assert.match(response.toLowerCase(), /content-security-policy:/);
  assert.match(response.toLowerCase(), /x-content-type-options: nosniff/);
  assert.ok(!response.includes('SHOULD_NOT_REFLECT'));
});

test('unexpected query strings including an empty delimiter are rejected', async t => {
  const f = await fixture(t);
  for (const pathname of ['/?debug=true', '/healthz?', '/api/runtime?env=1', '/assets/app-123.js?v=1']) {
    assert.equal((await f.request(pathname)).status, 400, pathname);
  }
});

test('unknown API routes do not fall back to the HTML landing page', async t => {
  const f = await fixture(t);
  for (const pathname of ['/api', '/api/', '/api/environment', '/api/runtime/']) {
    const response = await f.request(pathname);
    assert.equal(response.status, 404, pathname);
    assert.deepEqual(JSON.parse(response.body), { error: 'Not found' });
  }
});

test('private files, maps, dotfiles and traversal are never served', async t => {
  const f = await fixture(t);
  for (const pathname of ['/.env', '/package.json', '/server/server.mjs', '/assets/app.js.map', '/assets/../index.html', '/../private.txt', '/%2e%2e/private.txt', '/assets/%2e%2e/index.html', '/assets/app%2d123.js', '//assets/app-123.js', '/assets/nested/no.js', '/bad%00.js', '/%zz']) {
    const response = await f.request(pathname);
    assert.ok([400, 404].includes(response.status), `${pathname}: ${response.status}`);
    assert.ok(!response.body.includes('DO_NOT_EXPOSE'));
  }
});

test('allowlisted filenames cannot escape dist through a symlink', async t => {
  const f = await fixture(t);
  try {
    await symlink(path.join(f.distDir, '..', 'private.txt'), path.join(f.distDir, 'assets', 'leak.js'));
  } catch (error) {
    if (['EPERM', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Scratch filesystem does not support symlinks (${error.code})`);
      return;
    }
    throw error;
  }
  const response = await f.request('/assets/leak.js');
  assert.equal(response.status, 404);
  assert.ok(!response.body.includes('DO_NOT_EXPOSE'));
});

test('success and errors carry restrictive same-origin security headers', async t => {
  const f = await fixture(t);
  for (const pathname of ['/', '/healthz', '/api/runtime', '/missing', '/?x=1']) {
    const response = await f.request(pathname);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    const csp = response.headers['content-security-policy'];
    assert.ok(csp.includes("connect-src 'self'"));
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.ok(!csp.includes('unsafe-eval'));
    assert.ok(!csp.includes('unsafe-inline'));
    assert.ok(!csp.includes('https://'));
  }
});

test('missing build files return sanitized errors with no filesystem disclosure', async t => {
  const f = await fixture(t);
  await rm(path.join(f.distDir, 'index.html'));
  const response = await f.request('/');
  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'Not found' });
  assert.ok(!response.body.includes(f.distDir));
});

test('invalid entrypoint port exits with a sanitized configuration error', async () => {
  assert.ok(existsSync(implementation), 'Container Pulse server implementation is missing');
  const child = spawn(process.execPath, ['server/server.mjs'], { cwd: root, env: { ...process.env, PORT: 'not-a-port' } });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(stderr, /Invalid PORT configuration/);
  assert.ok(!stderr.includes(root));
});

test('container health probe accepts the exact live health endpoint', async t => {
  const f = await fixture(t);
  const probe = new URL('../server/healthcheck.mjs', import.meta.url);
  assert.ok(existsSync(probe), 'Container health probe is missing');
  const child = spawn(process.execPath, [fileURLToPath(probe)], { env: { ...process.env, PORT: String(f.server.address().port) } });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
});

test('container health probe rejects a misleading or non-200 endpoint', async t => {
  const probe = new URL('../server/healthcheck.mjs', import.meta.url);
  assert.ok(existsSync(probe), 'Container health probe is missing');
  let status = 200;
  let body = '{"status":"ok","service":"different-service"}';
  const server = http.createServer((_req, res) => { res.writeHead(status); res.end(body); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const scenario of [0, 1]) {
    if (scenario === 1) { status = 503; body = '{"status":"ok","service":"container-pulse"}'; }
    const child = spawn(process.execPath, [fileURLToPath(probe)], { env: { ...process.env, PORT: String(server.address().port) } });
    const [code] = await once(child, 'exit');
    assert.equal(code, 1);
  }
});

test('entrypoint shuts down cleanly on SIGTERM after handling a real request', { timeout: 10000 }, async t => {
  assert.ok(existsSync(implementation), 'Container Pulse server implementation is missing');
  const child = spawn(process.execPath, ['server/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', APP_VERSION: '2.0.0' } });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const exited = once(child, 'exit');
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.on('data', chunk => {
      output += chunk;
      const line = output.split('\n').find(value => value.startsWith('{'));
      if (line) {
        try { resolve(JSON.parse(line).port); } catch { /* wait for a complete line */ }
      }
    });
    child.once('exit', () => reject(new Error('Server exited before listening')));
  });
  assert.equal((await request(port, '/healthz')).status, 200);
  child.kill('SIGTERM');
  const [code, signal] = await exited;
  assert.equal(code, 0);
  assert.equal(signal, null);
});
