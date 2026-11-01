import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
test('production build emits a runnable static React island without shipping infrastructure or dependencies', () => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8', timeout: 90000 });
  assert.equal(result.status, 0, `Build failed: ${result.stdout}\n${result.stderr}`);
  const html = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
  assert.match(html, /id="stylestore-root"/);
  assert.doesNotMatch(html, /src="\.\/src\/main\.jsx"/);
  assert.match(html, /assets\/stylestore\.js/);
  for (const name of ['theme.js', 'site-navigation.js', 'copy-code.js', 'config.js', 'styles/themes/theme-registry.js', 'assets/sneaker.svg']) {
    assert.ok(existsSync(resolve(root, 'dist', name)), `Missing built public asset ${name}`);
  }
  for (const name of ['server', 'infra', 'tests', 'docs', 'node_modules', '.git', 'compose.yaml', 'package.json']) {
    assert.ok(!existsSync(resolve(root, 'dist', name)), `Private/build input shipped: ${name}`);
  }
  assert.ok(readdirSync(resolve(root, 'dist/assets')).some(name => name.endsWith('.css')), 'React island stylesheet is emitted');
  assert.doesNotMatch(readFileSync(resolve(root, 'dist/assets/stylestore.js'), 'utf8'), /process\.env\.NODE_ENV/, 'Browser bundle must resolve React production mode without a Node process global');
  assert.match(readFileSync(resolve(root, 'dist/theme.js'), 'utf8'), /ssn-style-theme/);
});
