import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.json':'application/json; charset=utf-8'};
export function safePublicPath(raw){
  try{
    const path=decodeURIComponent(raw.split('?')[0]);
    if(!path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part=>part==='..'||part==='.'||part.startsWith('.')))return null;
    const clean=path==='/'?'index.html':path.slice(1);
    if(['index.html','theme.js','site-navigation.js','copy-code.js','config.js'].includes(clean))return clean;
    if(!/^(styles|assets)\/[a-zA-Z0-9_./-]+$/.test(clean) || !types[extname(clean)] || /\.(?:map|html|mjs|json)$/.test(clean))return null;
    return clean;
  }catch{return null;}
}
export async function makeServer(){
  let allowed='';
  try{
    const context={window:{}};vm.runInNewContext(await readFile(resolve(out,'config.js'),'utf8'),context,{timeout:1000});
    const parsed=new URL(context.window.SavedOrdersConfig?.supabaseUrl);
    if(parsed.protocol==='https:' && parsed.pathname==='/' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash)allowed=` ${parsed.origin}`;
  }catch{/* Empty public configuration is deliberately disconnected. */}
  const csp=`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'${allowed}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
  return createServer(async(req,res)=>{
    const headers={'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
    const reply=(status,text)=>{res.writeHead(status,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
    if(!['GET','HEAD'].includes(req.method)){reply(405,'Read-only static preview.');return;}
    const path=safePublicPath(req.url);if(!path){reply(404,'Not found.');return;}
    try{
      const file=resolve(out,path),actual=await realpath(file),base=await realpath(out);
      if(!actual.startsWith(base+sep) || !(await stat(actual)).isFile()){reply(404,'Not found.');return;}
      const data=await readFile(actual);res.writeHead(200,{...headers,'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':data.byteLength});res.end(req.method==='HEAD'?undefined:data);
    }catch{reply(404,'Not found. Build the showcase before starting the preview.');}
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||8797);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be an integer between 1024 and 65535.');
  const server=await makeServer();server.listen(port,'127.0.0.1',()=>console.log(`StyleStore Saved Orders: http://127.0.0.1:${port} (dist only; loopback)`));
  server.on('error',error=>{console.error(`Preview could not start: ${error.code||error.message}`);process.exitCode=1;});
}
