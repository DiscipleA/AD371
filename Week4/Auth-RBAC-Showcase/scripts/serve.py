"""Loopback-only static server. Never serves secrets/backend source or lists directories."""
import argparse
import functools
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT=Path(__file__).resolve().parents[1]
PUBLIC_FILES={'/','/index.html','/config.js','/theme.js','/site-navigation.js','/copy-code.js','/favicon.ico','/scripts/showcase.js','/scripts/auth-client.mjs','/scripts/callback-cleanup.js'}

def is_public_path(raw):
    path=unquote(urlsplit(raw).path)
    if raw.startswith('//') or '\\' in path or '\x00' in path:
        return False
    parts=path.split('/')
    if any(part.startswith('.') or part in ('..','.') for part in parts if part):
        return False
    return path in PUBLIC_FILES or path.startswith(('/styles/','/vendor/','/docs/qa/'))

def security_headers(api_origin):
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co',api_origin):
        api_origin="'none'"
    return {
        'Content-Security-Policy':f"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src {api_origin}; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
        'X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'no-referrer',
        'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
        'Cache-Control':'no-store',
    }

class Handler(SimpleHTTPRequestHandler):
    api_origin="'none'"
    def do_GET(self):
        if not is_public_path(self.path):
            self.send_error(404);return
        return super().do_GET()
    def do_HEAD(self):
        if not is_public_path(self.path):
            self.send_error(404);return
        return super().do_HEAD()
    def list_directory(self,path):
        self.send_error(404);return None
    def end_headers(self):
        for key,value in security_headers(self.api_origin).items():
            self.send_header(key,value)
        super().end_headers()
    def log_message(self,format,*args):
        # No credentials are ever accepted in URL query parameters by this app.
        super().log_message(format,*args)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8771)
    args=parser.parse_args()
    config=(ROOT/'config.js').read_text()
    match=re.search(r"supabaseUrl:\s*['\"](https://[a-z0-9-]+\.supabase\.co)['\"]",config)
    Handler.api_origin=match.group(1) if match else "'none'"
    server=ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(Handler,directory=str(ROOT)))
    print(f'Gatekeeper Lab: http://127.0.0.1:{args.port}/ (loopback only; protected source paths)',flush=True)
    server.serve_forever()
