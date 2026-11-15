import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
let html=await read('index.html').catch(()=>'');
test('standalone HTML exists',async()=>{try{html=await read('index.html');}catch{} assert.ok(html.includes('<!DOCTYPE html>'),'missing standalone shell');});
test('exact seven source-derived sections and compatibility hooks',()=>{
  assert.deepEqual([...html.matchAll(/data-architecture-section="([^"]+)"/g)].map(m=>m[1]),['problem','concepts','architecture','prompt','audit','working','verification']);
  assert.match(html,/class="flexbox-interfaces-page application-architecture-page saved-orders-page"/);
  for(const name of ['architecture-ai-workflow','architecture-ai-steps','ai-step-prompt','ai-build-prompt','audit-layout','audit-grid']) assert.ok(html.includes(name),name);
  assert.equal((html.match(/data-ai-step/g)||[]).length,4);
  const initiallyOpen=[...html.matchAll(/<details[^>]*\sopen[\s>]/g)].map(m=>m[0]);
  assert.equal(initiallyOpen.length,1);
  assert.match(initiallyOpen[0],/data-implementation-spec/);
  assert.equal((html.match(/<details class="ai-step-prompt"[^>]*\sopen[\s>]/g)||[]).length,0);
  assert.match(html,/Reusable showcase prompts — not historical submissions/);
});
test('all copy targets unique and complete multiline specification',()=>{
  const targets=[...html.matchAll(/data-copy-target="([^"]+)"/g)].map(m=>m[1]); assert.equal(targets.length,6);assert.equal(new Set(targets).size,6);
  for(const id of targets)assert.ok(html.includes(`<code id="${id}">`),id);
  assert.match(html,/<code id="ssoBuildPrompt">[\s\S]*\n\n1\.[\s\S]*\n\n8\./);
});
test('one fixed accessible architecture SVG without mobile replacement',()=>{
  assert.equal((html.match(/<svg\b/g)||[]).length,1);
  assert.match(html,/viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid meet"/);
  assert.match(html,/<title id="sso-map-title">/);assert.match(html,/<desc id="sso-map-desc">/);
  assert.doesNotMatch(html,/network-map__mobile|nginx|private_subnet|store-a|theme-cloud/i);
  for(const text of ['Supabase Auth','Edge Function','order_items','MongoDB','No synchronization','ss_owner_caps','unit_price_cents','two-doc transaction'])assert.ok(html.includes(text),text);
});
test('exactly four bundled product illustrations and no old service coupling',async()=>{
  for(const name of ['sneakers','tee','hoodie','backpack'])assert.match(await read(`assets/${name}.svg`),/<svg/);
  for(const name of ['theme.js','site-navigation.js','config.js']){
    const source=await read(name);assert.doesNotMatch(source,/theme-cloud|ssn-theme|ssn-style|Gatekeeper|api\/quote/);
  }
  assert.match(await read('theme.js'),/saved-orders-theme/);
  assert.match(await read('config.js'),/publishableKey:\s*'sb_publishable_/);
});
test('working explanation remains three compact columns until phone breakpoint',async()=>{
  const css=await read('styles/saved-orders-showcase.css');
  assert.match(css,/\.working-notes\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css,/@media\s*\(max-width:\s*480px\)/);
  assert.doesNotMatch(css,/non-scaling-stroke|network-map__mobile/);
});
test('public output is allowlisted, production-only and server path traversal denied',async()=>{
  assert.match(await read('scripts/build.mjs'),/process\.env\.NODE_ENV/);
  const server=await import(new URL('../scripts/serve.mjs',import.meta.url));
  assert.equal(server.safePublicPath('/docs/assignment-plan.md'),null);
  assert.equal(server.safePublicPath('/src/main.jsx'),null);
  assert.equal(server.safePublicPath('/supabase/functions/saved-orders/index.ts'),null);
  assert.equal(server.safePublicPath('/styles/../config.js'),null);
  assert.equal(server.safePublicPath('/assets/%2e%2e/config.js'),null);
  assert.equal(server.safePublicPath('/styles/themes/standard/theme.css'),'styles/themes/standard/theme.css');
});
