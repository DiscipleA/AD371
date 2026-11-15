import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const html=await read('index.html');
const css=await read('styles/saved-orders-showcase.css');
const hash=value=>createHash('sha256').update(value).digest('hex');
const section=name=>html.match(new RegExp(`<section\\b[^>]*data-architecture-section="${name}"[^>]*>[\\s\\S]*?</section>`))?.[0]??'';
const concepts=section('concepts'),architecture=section('architecture');
const plain=value=>value.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const destinations=[
  'https://react.dev/learn/state-as-a-snapshot',
  'https://supabase.com/docs/guides/auth/auth-anonymous',
  'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
  'https://www.postgresql.org/docs/current/tutorial-transactions.html',
  'https://www.mongodb.com/docs/manual/core/write-operations-atomicity/',
  'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch'
];
test('six whole-card native links teach distinct boundaries in the approved order',()=>{
  const cards=[...concepts.matchAll(/<a\b([^>]*class="concept-card"[^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length,6);
  assert.deepEqual(cards.map(m=>m[1].match(/href="([^"]+)"/)?.[1]),destinations);
  assert.equal(new Set(cards.map(m=>m[1].match(/href="([^"]+)"/)?.[1])).size,6);
  for(const [,attrs,body] of cards){
    assert.match(attrs,/target="_blank"/);assert.match(attrs,/rel="noopener noreferrer"/);
    for(const pattern of [/<h3>/,/<p>/,/class="concept-token"/,/class="concept-source"/])assert.match(body,pattern);
    assert.doesNotMatch(body,/<a\b|<button\b|tabindex=/);
    assert.match(body,/class="concept-source">[^<]*&nbsp;↗<\/span>/,'keep external-link glyph with its source label');
    const words=plain(body.match(/<p>([\s\S]*?)<\/p>/)?.[1]??'').split(/\s+/).length;
    assert.ok(words>=10&&words<=26,`compact project-specific card: ${words} words`);
  }
});
test('concepts connect each primary reference to this project rather than generic claims',()=>{
  const text=plain(concepts);
  for(const phrase of ['page memory','database commit','fresh read','Anonymous sign-in','verifies its token','ownership','known products','quantities server-side','backend catalog','integer-cent totals','Foreign keys','immutable products','SQL transactions','Embedded items','atomic','owner quota','Validate responses','stale replies','refresh before repeating'])assert.ok(text.includes(phrase),phrase);
});
test('one accessible expanded SVG preserves five nodes, internal models and seven main flows',()=>{
  assert.equal((html.match(/<svg\b/g)||[]).length,1);
  assert.match(architecture,/viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="sso-map-title sso-map-desc"/);
  assert.match(architecture,/<title id="sso-map-title">[^<]+<\/title>/);assert.match(architecture,/<desc id="sso-map-desc">[^<]+<\/desc>/);
  assert.deepEqual([...architecture.matchAll(/data-diagram-node="([^"]+)"/g)].map(m=>m[1]),['browser','auth','api','sql','mongo']);
  assert.deepEqual([...architecture.matchAll(/data-diagram-flow="([^"]+)"/g)].map(m=>m[1]),['start-session','auth-session','authenticated-request','verify-user','sql','mongo','verified-response']);
  for(const id of ['draft','session','verify','validate','catalog-router','orders','order-items','products','embedded-order','owner-cap'])assert.ok(architecture.includes(`data-diagram-part="${id}"`),id);
  assert.ok(architecture.indexOf('data-diagram-flow=')<architecture.indexOf('data-diagram-node='),'arrows behind opaque nodes');
  assert.match(architecture,/<g data-diagram-legend/);
  assert.doesNotMatch(architecture,/<script\b|foreignObject|onclick=|tabindex=|network-map__mobile|service.role/i);
});
test('architecture text explains actual authorization, storage and failure boundaries',()=>{
  const text=plain(architecture);
  for(const phrase of ['GET /auth/v1/user','caller JWT','public project key','ss_orders_api','SECURITY DEFINER','auth.uid()','explicit owner checks','RLS','direct table grants','immutable products','product_id','unit_price_cents','name','unitPriceCents','quantity','ss_owner_caps','single-document atomic','two-document transaction','withTransaction','eligible transaction errors','no automatic browser HTTP write retries','refresh before repeating','fresh record or list read','no cross-engine synchronization','MongoDB URI stays server-side'])assert.ok(text.includes(phrase),phrase);
  for(const label of ['Request / selected engine','Response','Trust boundary'])assert.ok(architecture.includes(label),label);
  assert.match(css,/\.map-zone\s*\{[^}]*stroke-dasharray:\s*2 6/);
  assert.match(css,/\.map-response\s*\{[^}]*stroke-dasharray:\s*8 6/);
  for(const [selector,size] of [['map-title',26],['map-small',18],['map-label',18]])assert.match(css,new RegExp(`\\.${selector}\\s*\\{[^}]*font-size:\\s*${size}px`));
  assert.doesNotMatch(css,/non-scaling-stroke|@font-face|@import|network-map__mobile/);
});
test('commit, observable confirmation and selected-backend price provenance stay distinct',()=>{
  const text=plain(architecture);
  for(const phrase of ['Database persistence happens at commit','read-back confirms subsequent observable committed state','Cancellation does not undo a committed write','selected trusted backend path','SQL RPC computes totals','MongoDB server catalog','retryWrites'])assert.ok(text.includes(phrase),phrase);
  assert.doesNotMatch(architecture,/not persisted until|prices before routing|uses server catalog cents before routing/i);
});
test('five other sections, prompt bytes and surrounding shell remain frozen',()=>{
  assert.equal(hash(architecture),'12c517019ec18b1edb95fce5995e1991e8ca61c0cf625238bfb4a35744b01544');
  const codeHashes={"ssoReviewPrompt": "bfdbdcc7800ea99c0e925b15725d137db7d6a317972286f27395bbbbf4b2c290", "ssoPlanPrompt": "40da10a2af9edda23c8f57d8e0c15141b445d76bfd18ceaa5c57d42d028b1d25", "ssoShortBuildPrompt": "dc0b1d9f71fc10d4ec41316e0eac5723de39388a9ff32f8fbbc0f7622f31dd44", "ssoVerifyPrompt": "b82c855be2bc79879049b16eaa3778d2dd3581d967faf6b56a175502663bccf9", "ssoBuildPrompt": "5411bbdfa1bf8835b46f89e0937a1d339f469620c795c18481793a7a3e7cd0a5"};
  for(const [id,expected] of Object.entries(codeHashes))assert.equal(hash(html.match(new RegExp(`<code id="${id}">([\\s\\S]*?)</code>`))[1]),expected,id);
  const frozen={problem:'01f8c6c729c79ef065a0340b528e4b31e563e74ad69d9f54d817049b89484b36',prompt:'9eb5b05d186ba0dce47b519f2929990d77f73a74c531e874b337dd48afb39e40',audit:'b554396d866cc0aad5bc13adadbd9a5ac76f769cc07f314de1382dcd99579bcb',working:'2d5ee47d71ef497abb4759f6a9d9cab48df3235d375375ab318c507deb66ee20',verification:'a336c51ecbfdcef7d8244325789b05e54c19ac66e8fe6ac6813c05bae964e19e'};
  for(const [name,expected] of Object.entries(frozen))assert.equal(hash(section(name)),expected,name);
  assert.equal(hash(html.replace('data-implementation-spec open>','data-implementation-spec>').replace(/<section\b[^>]*data-architecture-section="(?:concepts|architecture)"[^>]*>[\s\S]*?<\/section>/g,'')),'8cc61a1daacaf9b24cff5e3f2cfac68050712990669bb404852aabff4b452f88');
});
test('React island, client, storefront and public configuration bytes remain frozen',async()=>{
  const frozen={'src/App.jsx':'0a4de328669c86822f90dffe8131d2874b161e3b40e515da73bb9666f338ba82','src/orders-client.mjs':'40c18f882c7ea1edca16e01b8f3d6e3b624f91a286909ca262e06ac303cca46b','src/main.jsx':'dae6b31d785110af46ad6f49b0d7f417370eccbf01eb642ef322302c2aef8203','styles/storefront.css':'4defa7e78634d330c6d04ff94bd3147d74f4c16db109d78d71f7b574b83e1386','config.js':'97a8f502dd9b5d2f04ccdfaf147380a289daf784b5d3520d70a93899def06561'};
  for(const [file,expected] of Object.entries(frozen))assert.equal(hash(await read(file)),expected,file);
});
