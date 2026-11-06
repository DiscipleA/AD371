import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
});
const PUBLIC_FILES = new Set([
  '/index.html', '/theme.js', '/site-navigation.js', '/copy-code.js', '/config.js',
  '/styles/shared/base.css', '/styles/shared/navigation.css',
  '/styles/auth-rbac-showcase.css', '/styles/pulse-showcase.css', '/styles/pulse-dashboard.css',
  '/styles/themes/theme-registry.js',
]);
const PUBLIC_THEMES = new Set([
  'standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
  'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas',
]);

function publicFile(target) {
  if (target === '/') return 'index.html';
  // Browsers may request this even when the document declares an SVG favicon.
  if (target === '/favicon.ico') return 'styles/themes/standard/assets/icons/favicon.svg';
  if (PUBLIC_FILES.has(target) || /^\/assets\/[A-Za-z0-9][A-Za-z0-9_-]*\.(?:js|css|svg|png|jpe?g|webp|ico|woff2)$/.test(target)) return target.slice(1);
  const theme = /^\/styles\/themes\/([^/]+)\/(.+)$/.exec(target);
  if (theme && PUBLIC_THEMES.has(theme[1]) && (
    theme[2] === 'theme.css' || theme[2] === 'theme-config.js'
    || /^assets\/(?:icons|textures)\/[A-Za-z0-9][A-Za-z0-9_-]*\.svg$/.test(theme[2])
  )) return target.slice(1);
  return null;
}

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'",
});

function send(req, res, status, value, contentType = 'application/json; charset=utf-8', extra = {}) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': contentType, 'Content-Length': body.length, ...extra });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** A deliberately small HTTP surface: no environment dumps, SPA fallback, or directory listing. */
export function createPulseServer({ distDir = DEFAULT_DIST, appVersion = process.env.APP_VERSION ?? '1.0.0' } = {}) {
  const version = typeof appVersion === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(appVersion) ? appVersion : '1.0.0';
  const root = path.resolve(distDir);

  async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(req, res, 405, { error: 'Method not allowed' }, undefined, { Allow: 'GET, HEAD' });
      return;
    }
    // Validate the raw request target before any URL normalization can erase traversal.
    const target = req.url ?? '';
    if (!target.startsWith('/') || target.startsWith('//') || target.length > 2048 || /[%?#\\\x00-\x20\x7f]/.test(target) || target.split('/').some(part => part === '.' || part === '..')) {
      send(req, res, 400, { error: 'Bad request' });
      return;
    }
    if (target === '/healthz') {
      send(req, res, 200, { status: 'ok', service: 'container-pulse' });
      return;
    }
    if (target === '/api/runtime') {
      send(req, res, 200, {
        service: 'container-pulse',
        hostname: os.hostname(),
        processUptimeSeconds: process.uptime(),
        nodeVersion: process.version,
        appVersion: version,
      });
      return;
    }
    const relative = publicFile(target);
    if (!relative) {
      send(req, res, 404, { error: 'Not found' });
      return;
    }
    let file;
    try {
      const candidate = path.join(root, relative);
      const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(candidate)]);
      if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) {
        send(req, res, 404, { error: 'Not found' });
        return;
      }
      file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile()) {
        send(req, res, 404, { error: 'Not found' });
        return;
      }
      send(req, res, 200, await file.readFile(), MIME_TYPES[path.extname(relative)]);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) {
        send(req, res, 404, { error: 'Not found' });
      } else {
        throw error;
      }
    } finally {
      await file?.close();
    }
  }

  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000, keepAliveTimeout: 5000 }, (req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(req, res, 500, { error: 'Internal server error' });
      else res.destroy();
    });
  });
  server.on('connect', (_req, socket) => {
    // CONNECT bypasses the HTTP response lifecycle; end its detached socket directly.
    const body = JSON.stringify({ error: 'Method not allowed' });
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      Allow: 'GET, HEAD',
      Connection: 'close',
    };
    socket.end(`HTTP/1.1 405 Method Not Allowed\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n${body}`);
  });
  server.on('clientError', (_error, socket) => {
    const headers = { ...SECURITY_HEADERS, Connection: 'close', 'Content-Length': 0 };
    socket.end(`HTTP/1.1 400 Bad Request\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`);
  });
  return server;
}

function start() {
  const configured = process.env.PORT ?? '3000';
  if (!/^\d{1,5}$/.test(configured) || Number(configured) > 65535) {
    console.error('Invalid PORT configuration');
    process.exitCode = 1;
    return;
  }
  const server = createPulseServer();
  server.on('error', () => {
    console.error('Container Pulse could not start');
    process.exitCode = 1;
  });
  server.listen(Number(configured), '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'listening', port: server.address().port }));
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 5000);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      process.exitCode = 0;
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
