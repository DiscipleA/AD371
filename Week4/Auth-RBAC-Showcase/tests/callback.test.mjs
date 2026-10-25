import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path=new URL('../scripts/callback-cleanup.js',import.meta.url);
const code=fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
function clean(href){assert.ok(code,'Callback URL cleanup is missing');const location=new URL(href);let replacement=null;vm.runInNewContext(code,{URL,URLSearchParams,location,history:{replaceState:(_state,_title,value)=>{replacement=value;}}});return replacement;}
test('removes provider callback tokens and auth codes without consuming them',()=>{
 assert.equal(clean('https://site.test/showcases/gatekeeper/?code=secret&view=lab#access_token=secret&refresh_token=secret'),'/showcases/gatekeeper/?view=lab');
 assert.equal(clean('https://site.test/showcases/gatekeeper/#error=access_denied&error_description=private'),'/showcases/gatekeeper/');
});
test('leaves normal showcase anchors and unrelated query values intact',()=>{
 assert.equal(clean('https://site.test/showcases/gatekeeper/?view=lab#final-result'),null);
 assert.equal(clean('https://site.test/showcases/gatekeeper/?code=secret#final-result'),'/showcases/gatekeeper/#final-result');
});
