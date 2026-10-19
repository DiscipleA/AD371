"""Dependency-free contract for the standalone extraction. Run with a project path."""
from pathlib import Path
from html.parser import HTMLParser
import re
import sys
import unittest

ROOT = Path(sys.argv.pop(1)) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]

class Contract(unittest.TestCase):
    def test_root_artifact_exists(self):
        self.assertTrue((ROOT / 'index.html').is_file(), 'Standalone root index.html is missing')

    def test_seven_sections_and_prompt_workflow(self):
        text = (ROOT / 'index.html').read_text()
        self.assertEqual(len(re.findall(r'data-architecture-section=', text)), 7)
        for word in ['Review', 'Plan', 'Build', 'Verify']:
            self.assertIn(word.lower(), text.lower())
        self.assertIn('App Engineering Showcases', text)

    def test_root_paths_and_no_other_showcases(self):
        text = (ROOT / 'index.html').read_text()
        self.assertNotIn('../../', text)
        self.assertNotIn('resume.html', text)
        self.assertFalse((ROOT / 'resume.html').exists())
        self.assertFalse((ROOT / 'CNAME').exists())
        self.assertFalse((ROOT / 'trading-dashboard').exists())
        for url in re.findall(r'(?:src|href)="([^"]+)"', text):
            if not url.startswith(('http', '#', 'data:')):
                self.assertTrue((ROOT / url).is_file(), url)

    def test_seven_local_renderers(self):
        themes = ROOT / 'styles/themes'
        self.assertEqual(len(list(themes.glob('*/theme-config.js'))), 7)
        self.assertEqual(len(list(themes.glob('*/theme.css'))), 7)

    def test_navigation_is_standalone(self):
        text = (ROOT / 'site-navigation.js').read_text()
        for dead in ['resume.html', 'trading-dashboard', 'showcases/fluid-typography']:
            self.assertNotIn(dead, text)
        for hook in ['data-theme-toggle', 'data-style-theme-option', 'Escape', 'inert']:
            self.assertIn(hook, text)

if __name__ == '__main__':
    unittest.main()
