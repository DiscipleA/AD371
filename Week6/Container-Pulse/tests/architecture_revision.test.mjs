import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/pulse-showcase.css', import.meta.url), 'utf8');
const section = title => html.split('<section class="section-card"').find(s => s.includes(`id="${title}-title"`)) ?? '';

test('container architecture has a single fixed-composition SVG at every viewport', () => {
  const map = section('architecture');
  assert.equal((map.match(/<svg\b/g) ?? []).length, 1);
  assert.match(map, /preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(map, /pulse-map-mobile/);
  assert.doesNotMatch(css, /pulse-map-mobile|\.pulse-map-desktop\s*\{\s*display:\s*none/);
  assert.match(map, /not live telemetry/i);
});

test('diagram explains build, image, orchestration, container internals and observation provenance', () => {
  const map = section('architecture');
  for (const node of ['build-inputs', 'dependency-layer', 'react-build', 'runtime-image', 'compose-contract', 'docker-lifecycle', 'app-a', 'app-b', 'assets-a', 'assets-b', 'process-a', 'process-b', 'gateway', 'browser', 'process-fields', 'browser-measurements', 'pulse-ui']) {
    assert.match(map, new RegExp(`data-map-node="${node}"`), node);
  }
  for (const term of ['Alpine', 'npm ci', '.env', 'USER node', '/healthz', '/api/runtime', '128 MiB', 'process uptime', 'not CPU or RAM usage']) assert.ok(map.includes(term), term);
  assert.match(map, /unhealthy[^<]*restart|Unhealthy[^<]*restart/i);
  assert.match(map, /2[^<]*3[^<]*2/);
});

test('AI Prompt preserves the unboxed reference workflow and separate full specification', () => {
  const prompt = section('prompt');
  assert.match(prompt, /data-architecture-section="prompt"/);
  assert.match(prompt, /class="prompt-build architecture-ai-workflow"/);
  assert.match(prompt, /<ol class="architecture-ai-steps">/);
  assert.equal((prompt.match(/data-ai-step/g) ?? []).length, 4);
  assert.equal((prompt.match(/class="ai-step-prompt"/g) ?? []).length, 4);
  assert.match(prompt, /<\/ol>\s*<details class="ai-build-prompt" data-implementation-spec/);
  assert.doesNotMatch(prompt, /pulse-details|pulse-prompt-steps/);
  for (const target of ['pulseReviewPrompt', 'pulsePlanPrompt', 'pulseShortBuildPrompt', 'pulseBuildPrompt', 'pulseVerifyPrompt']) assert.match(prompt, new RegExp(`data-copy-target="${target}"`));
});

test('Audit keeps the actual excerpt and four reference-style checks inside audit-layout', () => {
  const audit = section('audit');
  assert.match(audit, /data-architecture-section="audit"/);
  assert.match(audit, /<div class="audit-layout">[\s\S]*<div class="code-panel">[\s\S]*<div class="audit-grid">/);
  assert.equal((audit.match(/class="audit-item"/g) ?? []).length, 4);
  assert.equal((audit.match(/<article class="audit-item"><h3>/g) ?? []).length, 4);
  assert.match(audit, /data-copy-target="pulseAuditContract"/);
  assert.match(audit, /<code id="pulseAuditContract">/);
  assert.doesNotMatch(audit, /pulse-audit-notes/);
});

test('public prompt appendix reproduces every published prompt literally', () => {
  const decode = text => text.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'"})[entity]);
  const prompts = [...section('prompt').matchAll(/<code id="[^"]+">([\s\S]*?)<\/code>/g)].map(match => decode(match[1]));
  const appendix = readFileSync(new URL('../AI-PROMPTS.md', import.meta.url), 'utf8');
  const published = [...appendix.matchAll(/```text\n([\s\S]*?)\n```/g)].map(match => match[1]);
  assert.equal(prompts.length, 5);
  assert.deepEqual(published.sort(), prompts.sort());
});

