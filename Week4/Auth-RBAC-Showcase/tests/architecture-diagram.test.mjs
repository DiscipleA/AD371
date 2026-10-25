import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/auth-rbac-showcase.css', import.meta.url), 'utf8');
const section = html.match(/<section\b[^>]*data-architecture-section="architecture"[\s\S]*?<\/section>/)?.[0] ?? '';

test('architecture is a connected inline topology, not a row of pseudo-arrow cards', () => {
  assert.match(section, /<svg\b[^>]*class="gk-map__desktop"[^>]*viewBox=/);
  for (const id of ['hosting', 'browser', 'auth', 'credentials', 'edge', 'rpc', 'private', 'public']) {
    assert.match(section, new RegExp(`data-diagram-node="${id}"`), id);
  }
  for (const flow of ['static-assets','credentials','session','resource','verify-caller','caller-rpc','private-lookup','public-bypass','response']) {
    assert.match(section, new RegExp(`<path\\b[^>]*data-diagram-flow="${flow}"[^>]*d="[^\"]+"`), flow);
  }
  assert.doesNotMatch(section, /auth-flow__nodes/);
});

test('diagram explains actual identity and authorization boundaries with honest deployment scope', () => {
  for (const label of ['Cloudflare','Supabase Auth','PostgREST','gatekeeper_resource','auth.sessions','user_roles','admin_briefing','Default: User','Owner-managed','Public bypass','503','Not live telemetry']) assert.ok(section.includes(label), label);
  assert.match(section, /deployment target/i);
  assert.match(section, /role="img" aria-labelledby="auth-diagram-title auth-diagram-description"/);
  assert.match(section, /Caller JWT/);
  assert.match(section, /No browser table access/);
  assert.doesNotMatch(section, /<script|<foreignObject|<image|\son[a-z]+\s*=/i);
});

test('mobile uses readable reflow, themed native diagram marks and text equivalent', () => {
  assert.match(section, /class="gk-map__mobile" aria-hidden="true"/);
  assert.match(section, /id="auth-diagram-description"/);
  assert.match(css, /@media\s*\(max-width:\s*60rem\)/);
  assert.match(css, /\.gk-map__desktop\s*\{\s*display:\s*none/);
  assert.match(css, /\.gk-map__mobile\s*\{\s*display:\s*grid/);
  assert.match(css, /\.gk-map[\s\S]*?var\(--flex-color-/);
  assert.match(section, /Read the request path and trust contract/);
});
