import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async path=>readFile(new URL(`../${path}`,import.meta.url),'utf8').catch(()=> '');
test('Deno entrypoint pins MongoDB npm driver and wires controller, verified auth and lazy adapters',async()=>{
  const source=await load('supabase/functions/saved-orders/index.ts');assert.ok(source.length>0);
  for(const pattern of [/npm:mongodb@7\.8\.0/,/createHandler\(/,/createVerifyUser\(/,/createSqlAdapter\(/,/createMongoAdapter\(/,/createLazyMongo\(/,/Deno\.serve\(/])assert.match(source,pattern);
  assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE_ROLE_KEY|console\.log/);
});
test('function platform JWT check is explicitly replaced by handler verification and environment template has exact CORS',async()=>{
  const config=await load('supabase/config.toml');assert.match(config,/\[functions\.saved-orders\]/);assert.match(config,/verify_jwt\s*=\s*false/);
  const env=await load('supabase/functions/.env.example');assert.match(env,/ALLOWED_ORIGINS=http:\/\/localhost:8797,http:\/\/127\.0\.0\.1:8797/);assert.match(env,/MONGODB_URI=/);assert.match(env,/MONGODB_DB=stylestore/);
});
