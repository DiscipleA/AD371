import { createServer } from 'vite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

export function developmentConfig() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  return {
    root,
    configFile: false,
    oxc: { jsx: { runtime: 'automatic' } },
    server: {
      host: '127.0.0.1', port: 8785, strictPort: true,
      fs: { strict: true, allow: [root] },
      proxy: {
        '/api': { target: 'http://127.0.0.1:80', changeOrigin: true },
        '/healthz': { target: 'http://127.0.0.1:80', changeOrigin: true }
      }
    }
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = await createServer(developmentConfig());
  await server.listen();
  server.printUrls();
  console.log('API requests use the real Docker Nginx lab on 127.0.0.1:80. No offline responses are substituted.');
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => { await server.close(); process.exit(0); });
  }
}
