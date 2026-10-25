import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => existsSync(path.join(root, name)) ? readFileSync(path.join(root, name), 'utf8') : '';
const html = read('index.html');
const themes = ['standard', 'playful-pop', 'raggedy-granite', 'glossy-marble', 'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'];
const tag = (id) => html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] || '';

test('seven full-width narrative sections retain reference order and compatibility hooks', () => {
  assert.ok(html, 'index.html must exist');
  assert.deepEqual([...html.matchAll(/<section\b[^>]*data-architecture-section="([^"]+)"/g)].map((m) => m[1]), ['problem', 'concepts', 'architecture', 'prompt', 'audit', 'working', 'verification']);
  for (const label of ['Problem &amp; Scope', 'Architecture Concepts', 'System Architecture', 'AI Prompt', 'Audit', 'Working System', 'Verification']) assert.ok(html.includes(label), label);
  assert.match(html, /<title>Gatekeeper Lab \| App Engineering Showcases<\/title>/);
  assert.match(html, /Know the user\. Guard the boundary\./);
  assert.match(html, /<body[^>]*flexbox-interfaces-page[^>]*application-architecture-page/);
  assert.match(tag('final-result'), /data-architecture-section="working"/);
  assert.match(html, /class="site-footer"/);
});

test('auth form exposes parent runtime contract without a role selector or inline execution', () => {
  assert.match(tag('auth-form'), /novalidate/);
  for (const [id, type, autocomplete, maximum] of [['auth-email', 'email', 'username', 254], ['auth-password', 'password', 'current-password', 72]]) {
    const input = tag(id);
    assert.match(input, new RegExp(`type="${type}"`));
    assert.match(input, new RegExp(`autocomplete="${autocomplete}"`));
    assert.match(input, new RegExp(`maxlength="${maximum}"`));
    assert.match(input, /required/);
    assert.match(html, new RegExp(`<label[^>]+for="${id}"`));
  }
  assert.doesNotMatch(tag('auth-password'), /minlength/);
  for (const id of ['auth-register', 'auth-logout', 'request-public', 'request-user', 'request-admin']) assert.match(tag(id), /type="button"/);
  assert.match(tag('auth-login'), /type="submit"/);
  for (const id of ['auth-message', 'request-message']) {
    assert.match(tag(id), /role="status"/);
    assert.match(tag(id), /aria-live="polite"/);
  }
  for (const id of ['auth-session', 'auth-role', 'auth-action', 'request-status', 'request-output', 'connection-status']) assert.ok(tag(id), id);
  assert.match(html, /id="auth-session"[^>]*>Signed out/);
  assert.match(html, /id="request-status"[^>]*>Not requested/);
  assert.match(html, /id="connection-status"[^>]*>Not connected/);
  assert.doesNotMatch(html, /<select|\son[a-z]+\s*=|<script\b(?![^>]*\bsrc=)/i);
  assert.match(html, /12.{0,30}characters/);
  assert.match(html, /72 UTF-8 bytes/);
  assert.match(html, /[Rr]eloading signs (?:you )?out/);
});

test('runtime loads external config, local SDK and module in explicit order', () => {
  const config = html.indexOf('src="./config.js"');
  const sdk = html.indexOf('src="./vendor/supabase.js"');
  const runtime = html.indexOf('src="./scripts/showcase.js"');
  assert.ok(config >= 0 && sdk > config && runtime > sdk);
  assert.match(html, /<script[^>]*src="\.\/config.js"[^>]*defer/);
  assert.match(html, /<script[^>]*type="module"[^>]*src="\.\/scripts\/showcase.js"/);
});

test('copyable teaching prompts are complete, keyboard accessible, and honestly labeled', () => {
  const targets = [...html.matchAll(/data-copy-target="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 5, 'Review, Plan, Build, Verify and audit contract must be copyable');
  for (const id of targets) assert.match(html, new RegExp(`<pre[^>]*tabindex="0"[^>]*>\\s*<code id="${id}">[\\s\\S]+?<\\/code>`));
  for (const pre of html.matchAll(/<pre\b[^>]*>/g)) assert.match(pre[0], /tabindex="0"/);
  assert.match(html, /Suggested prompts/);
  assert.match(html, /design contract/i);
  assert.doesNotMatch(html, /href="[^"#]*(?:qa\/|AI-PROMPTS|setup\.sql)|all tests pass|verified live|audit passed/i);
  assert.match(read('copy-code.js'), /writeText\(target.textContent\)/);
});

test('architecture is accessible, theme-aware and explanatory, including 401 and 403 boundaries', () => {
  assert.match(html, /role="img" aria-labelledby="auth-diagram-title auth-diagram-description"/);
  for (const text of ['Untrusted browser', 'Supabase Auth', 'Edge / RPC guard', 'Private roles table', '401', '403']) assert.ok(html.includes(text), text);
  assert.match(html, /not live telemetry/);
  const css = read('styles/auth-rbac-showcase.css');
  assert.match(css, /\.auth-flow/);
  assert.match(css, /var\(--flex-color-/);
  assert.match(css, /@media[^{}]*max-width/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
});

test('all seven local packages, icons and texture URLs are available', () => {
  assert.ok(existsSync(path.join(root, 'styles/shared/base.css')));
  assert.ok(existsSync(path.join(root, 'styles/shared/navigation.css')));
  assert.match(html, /rel="icon"[^>]*href="\.\/styles\/themes\/standard\/assets\/icons\/favicon.svg"/);
  for (const id of themes) {
    assert.match(html, new RegExp(`<script src="\\.\\/styles\\/themes\\/${id}\\/theme-config.js"`));
    for (const file of ['theme.css', 'theme-config.js', 'assets/icons/favicon.svg', 'assets/icons/apple-touch-icon.svg']) assert.ok(existsSync(path.join(root, 'styles/themes', id, file)), `${id}/${file}`);
    const css = read(`styles/themes/${id}/theme.css`);
    for (const match of css.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g)) {
      if (!/^(?:data:|https?:)/.test(match[1])) assert.ok(existsSync(path.resolve(root, 'styles/themes', id, match[1])), `${id}: ${match[1]}`);
    }
  }
});

test('appearance registry/controller are standalone and use distinct local preference keys', () => {
  const controller = read('theme.js');
  const registry = read('styles/themes/theme-registry.js');
  const navigation = read('site-navigation.js');
  assert.ok(controller && registry && navigation, 'standalone controllers must exist');
  for (const source of [controller, registry]) {
    assert.ok(source.includes('"gk-theme"'));
    assert.ok(source.includes('"gk-style-theme"'));
    assert.doesNotMatch(source, /resume-theme|resume-style-theme/);
  }
  for (const source of [controller, navigation, html]) assert.doesNotMatch(source, /portfolioThemeCloud|theme-cloud|cloudthemechange|loadCloudScript|getOrderedThemes/);
  assert.match(navigation, /Gatekeeper/);
  assert.match(navigation, /Escape/);
  assert.match(navigation, /\.inert = !open/);
  assert.match(controller, /portfolio-navigationready/);
});

test('registry prepaint and seven metadata packages resolve local asset URLs', () => {
  const writes = [];
  const document = { currentScript: { src: 'https://example.test/lab/styles/themes/theme-registry.js' }, documentElement: { dataset: {} }, baseURI: 'https://example.test/lab/', write: (value) => writes.push(value) };
  const window = { localStorage: { getItem: (key) => key === 'gk-theme' ? 'dark' : key === 'gk-style-theme' ? 'luminous-midnight' : null } };
  const context = vm.createContext({ window, document, URL, console });
  assert.ok(read('styles/themes/theme-registry.js'), 'registry must exist');
  vm.runInContext(read('styles/themes/theme-registry.js'), context);
  for (const id of themes) {
    document.currentScript.src = `https://example.test/lab/styles/themes/${id}/theme-config.js`;
    vm.runInContext(read(`styles/themes/${id}/theme-config.js`), context);
  }
  assert.equal(window.PortfolioThemeRegistry.getAll().length, 7);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.dataset.styleTheme, 'luminous-midnight');
  assert.match(writes.join(''), /https:\/\/example.test\/lab\/styles\/themes\/luminous-midnight\/theme.css/);
  for (const definition of window.PortfolioThemeRegistry.getAll()) {
    for (const asset of [definition.stylesheet, ...definition.icons.map((icon) => icon.href)]) assert.ok(existsSync(path.join(root, new URL(asset).pathname.replace('/lab/', ''))), asset);
  }
});

test('all owned HTML IDs are unique and section/copy anchors resolve', () => {
  assert.ok(html);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/(?:href="#|aria-labelledby=")([^"]+)"/g)) for (const id of match[1].split(' ')) assert.ok(ids.includes(id), id);
});
