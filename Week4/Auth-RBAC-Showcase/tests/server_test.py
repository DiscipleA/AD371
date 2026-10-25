"""Local static server protects source-only and secret paths."""
import importlib.util, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('gatekeeper_serve',ROOT/'scripts/serve.py')
try:
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
except FileNotFoundError: module=None
class ServerTests(unittest.TestCase):
 def need(self):self.assertIsNotNone(module,'Secure local server implementation is missing');return module
 def test_browser_paths(self):
  allowed=self.need().is_public_path
  for p in ['/','/index.html','/config.js','/scripts/showcase.js','/scripts/auth-client.mjs','/scripts/callback-cleanup.js','/styles/themes/standard/theme.css','/vendor/supabase.js','/docs/qa/qa-report.html']:
   self.assertTrue(allowed(p),p)
 def test_sensitive_paths_and_traversals(self):
  allowed=self.need().is_public_path
  for p in ['/.env','/supabase/functions/.env','/.git/config','/docs/assignment-plan.md','/scripts/serve.py','/styles/../../.env','/%2eenv','/styles/%2e%2e/.env','/styles/test/.secret','//outside.test/test','/styles/a\\..\\.env']:
   self.assertFalse(allowed(p),p)
 def test_csp_is_local_script_only(self):
  h=self.need().security_headers('https://example.supabase.co')
  self.assertIn("script-src 'self'",h['Content-Security-Policy'])
  self.assertNotIn("'unsafe-inline'",h['Content-Security-Policy'].split('script-src')[1].split(';')[0])
  self.assertIn('https://example.supabase.co',h['Content-Security-Policy'])
  self.assertEqual(h['X-Content-Type-Options'],'nosniff')
if __name__=='__main__':unittest.main()
