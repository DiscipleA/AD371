import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const text=(p)=>existsSync(resolve(root,p))?readFileSync(resolve(root,p),'utf8'):'';
test('standalone page has seven ordered engineering sections and React mount',()=>{
 const html=text('index.html');
 assert.equal((html.match(/class="section-card"/g)||[]).length,7);
 const headings=['Problem &amp; Scope','Architecture Concepts','System Architecture','AI Prompt','Audit','Working System','Verification'];
 let previous=-1;
 for(const heading of headings){const index=html.indexOf('>'+heading+'</h2>');assert.ok(index>previous,heading);previous=index;}
 assert.match(html,/id="pulse-root"/);assert.match(html,/type="module" src="\.\/src\/main\.jsx"/);
});
test('concept cards have relevant official source destinations',()=>{
 const html=text('index.html');
 const cards=[...html.matchAll(/<a class="concept-card[^>]+href="([^"]+)"/g)];
 assert.equal(cards.length,6);
 assert.ok(cards.every(([,url])=>/^https:\/\/(docs\.docker\.com|react\.dev|nodejs\.org|nginx\.org)\//.test(url)));
});
test('appearance uses isolated storage and does not bootstrap previous cloud/auth feature',()=>{
 const theme=text('theme.js');assert.match(theme,/pulse-theme/);assert.match(theme,/pulse-style-theme/);
 assert.doesNotMatch(theme,/gk-theme|gk-style-theme|theme-cloud|Supabase/);
 assert.doesNotMatch(text('site-navigation.js'),/Gatekeeper/);
});
test('architecture is explanatory, accessible and preserves one scaled composition',()=>{
 const html=text('index.html');assert.match(html,/not live telemetry/i);assert.match(html,/<svg[^>]+role="img"/);
 assert.match(html,/preserveAspectRatio="xMidYMid meet"/);assert.doesNotMatch(html,/class="pulse-map-mobile"/);
 assert.match(html,/Build, lifecycle &amp; observation ownership/);
});
test('only reusable public workflow prompts appear',()=>{
 const html=text('index.html');for(const stage of ['Review','Plan','Build','Verify'])assert.match(html,new RegExp('id="pulse'+stage+'Prompt"'));
 assert.match(html,/Reusable showcase prompts/);assert.doesNotMatch(html,/Verbatim user|actual submitted prompt|@session:|ggewxly/);
});
test('build resolves React production mode and only publishes explicit static assets',()=>{
 const build=text('scripts/build.mjs');assert.match(build,/'process\.env\.NODE_ENV'/);assert.match(build,/JSON\.stringify\('production'\)/);
 assert.match(build,/publicDir: false/);assert.match(build,/styles/);assert.doesNotMatch(build,/cp\(root,|cp\(resolve\(root, '\.'\)/);
});
test('runtime connection is local and contains no privileged operations',()=>{
 const config=text('config.js');assert.match(config,/ContainerPulseConfig/);assert.match(config,/apiBase: ''/);
 assert.doesNotMatch(config,/docker\.sock|supabase|cloudflare|service.role/i);
});
test('page describes process uptime and observations without placeholder infrastructure claims',()=>{
 const html=text('index.html');assert.match(html,/process uptime/i);assert.match(html,/current page/i);
 assert.doesNotMatch(html,/4,821|0\.04%|US-East|DB Backup completed|bar-chart-mock/);
});
