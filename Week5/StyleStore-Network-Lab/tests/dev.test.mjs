import test from 'node:test';
import assert from 'node:assert/strict';

test('development server stays loopback-only and proxies actual lab API without invented responses', async () => {
  const { developmentConfig } = await import('../scripts/dev.mjs');
  const config = developmentConfig();
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.port, 8785);
  assert.equal(config.server.strictPort, true);
  assert.equal(config.server.proxy['/api'].target, 'http://127.0.0.1:80');
  assert.equal(config.server.proxy['/healthz'].target, 'http://127.0.0.1:80');
  assert.equal(config.server.fs.strict, true);
});
