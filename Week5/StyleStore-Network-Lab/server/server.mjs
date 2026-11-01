import http from 'node:http';
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCT = Object.freeze({ id: 'retro-sneakers', name: 'Retro Sneakers', unitPriceCents: 8500 });
const ROOT_FILES = new Set(['index.html', 'theme.js', 'site-navigation.js', 'copy-code.js', 'config.js']);
const TYPES = Object.freeze({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' });
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

function publicFile(rawPath) {
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || /%2f|%5c/i.test(rawPath)) return null;
  let path;
  try { path = decodeURIComponent(rawPath); } catch { return null; }
  if (path === '/') return 'index.html';
  const segments = path.slice(1).split('/');
  if (segments.some(s => !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(s) || s.startsWith('.') || s.endsWith('.map'))) return null;
  const name = segments.join('/');
  if (ROOT_FILES.has(name) || name === 'styles/themes/theme-registry.js' || /^styles\/themes\/(standard|glossy-marble|luminous-midnight|gothic-stickerboard|baroque-plexiglas|raggedy-granite|playful-pop)\/theme-config\.js$/.test(name)) return name;
  if (segments.length < 2 || !['assets', 'styles'].includes(segments[0])) return null;
  const extension = extname(name);
  if (!TYPES[extension] || extension === '.html') return null;
  if (segments[0] === 'styles' && extension === '.js') return null;
  return name;
}

// Read-only image prevents filesystem mutation between these checks and open.
// Every path component is checked: even an internal symlink is not public.
async function readPublicFile(distDir, name) {
  let current = distDir;
  if ((await lstat(current)).isSymbolicLink()) throw new Error('Not public');
  const segments = name.split('/');
  for (let i = 0; i < segments.length; i++) {
    current = join(current, segments[i]);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (i < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Not public');
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return await file.readFile(); } finally { await file.close(); }
}

export function createStoreServer({ serverId, distDir = fileURLToPath(new URL('../dist', import.meta.url)) } = {}) {
  if (!['store-a', 'store-b'].includes(serverId)) throw new Error('SERVER_ID must be store-a or store-b');
  const directory = resolve(distDir);
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000, keepAliveTimeout: 2000 }, async (req, res) => {
    res.setHeader('X-Store-Id', serverId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      const payload = Buffer.isBuffer(body) ? body : Buffer.from(type.startsWith('application/json') ? JSON.stringify(body) : body);
      res.writeHead(status, { 'Content-Type': type, 'Content-Length': payload.length });
      res.end(req.method === 'HEAD' ? undefined : payload);
    };
    const notFound = () => send(404, 'Not found\n', 'text/plain; charset=utf-8');
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); send(405, { error: 'Method not allowed' }); return; }
      const rawUrl = req.url || '';
      const rawPath = rawUrl.split('?')[0];
      if (rawPath === '/healthz') { send(200, { status: 'ok', serverId }); return; }
      if (rawPath === '/api/quote') {
        // Strict grammar makes missing, duplicate, extra, empty and coerced input invalid.
        const match = /^\/api\/quote\?quantity=([1-9])$/.exec(rawUrl);
        if (!match) { send(400, { error: 'Invalid quantity' }); return; }
        const quantity = Number(match[1]);
        send(200, { serverId, product: PRODUCT, quantity, totalCents: PRODUCT.unitPriceCents * quantity, currency: 'USD' }); return;
      }
      if (rawPath === '/api' || rawPath.startsWith('/api/')) { send(404, { error: 'Not found' }); return; }
      const name = publicFile(rawPath);
      if (!name) { notFound(); return; }
      let body;
      try { body = await readPublicFile(directory, name); } catch { notFound(); return; }
      res.setHeader('Content-Security-Policy', CSP);
      send(200, body, TYPES[extname(name)]);
    } catch {
      if (!res.headersSent) send(500, { error: 'Service unavailable' });
      else res.destroy();
    }
  });
  server.maxRequestsPerSocket = 100;
  return server;
}

function start() {
  try {
    const rawPort = process.env.PORT ?? '3000';
    if (!/^\d{1,5}$/.test(rawPort) || Number(rawPort) > 65535) throw new Error('Invalid PORT');
    const server = createStoreServer({ serverId: process.env.SERVER_ID, distDir: process.env.DIST_DIR });
    server.once('error', () => { console.error('Unable to start store server'); process.exitCode = 1; });
    server.listen(Number(rawPort), '0.0.0.0', () => console.log(`${process.env.SERVER_ID} listening on ${server.address().port}`));
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      const timer = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 5000).unref();
      server.close(() => { clearTimeout(timer); process.exitCode = 0; });
      server.closeIdleConnections();
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch { console.error('Invalid server configuration (SERVER_ID or PORT)'); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
