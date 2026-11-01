#!/usr/bin/env python3
"""Run real local Lighthouse audits with isolated loopback-CDP Chromium instances."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = Path('/media/reader/DEVELOP/data/cache/scratch/stylestore-week5-20261028')
parser = argparse.ArgumentParser()
parser.add_argument('--output', default=str(ROOT / 'docs/qa/lighthouse'))
args = parser.parse_args()
OUT = Path(args.output).resolve()
OUT.mkdir(parents=True, exist_ok=True)
CHROMIUM = '/media/reader/DEVELOP/.cache/runtimes/linux-x64/playwright/chromium-1234/chrome-linux64/chrome'
NODE = '/media/reader/DEVELOP/.cache/runtimes/linux-x64/node/bin/node'
CLI = SCRATCH / 'lighthouse/node_modules/lighthouse/cli/index.js'
results = []
with sync_playwright() as p:
    for mode in ['mobile', 'desktop']:
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            port = s.getsockname()[1]
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=[f'--remote-debugging-port={port}', '--remote-debugging-address=127.0.0.1'])
        try:
            command = [NODE, str(CLI), 'http://127.0.0.1/', f'--port={port}', '--hostname=127.0.0.1', '--output=json', '--output=html', f'--output-path={OUT / mode}', '--only-categories=performance,accessibility,best-practices,seo', '--quiet']
            if mode == 'desktop':
                command.append('--preset=desktop')
            run = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=180, env={**os.environ, 'TMPDIR': str(SCRATCH)})
            (OUT / f'{mode}-run.log').write_text(run.stdout + run.stderr)
            entry = {'mode': mode, 'exit_code': run.returncode, 'captured_utc': datetime.now(timezone.utc).isoformat(), 'browser': browser.version, 'url': 'http://127.0.0.1/', 'method': 'Lighthouse CLI through an isolated Playwright Chromium CDP port; not branded Chrome DevTools or a physical device.'}
            report = OUT / f'{mode}.report.json'
            if report.is_file():
                data = json.loads(report.read_text())
                entry['lighthouse_version'] = data['lighthouseVersion']
                entry['scores'] = {k: v['score'] for k, v in data['categories'].items()}
                entry['warnings'] = data.get('runWarnings', [])
                entry['runtime_error'] = data.get('runtimeError')
                entry['form_factor'] = data.get('configSettings', {}).get('formFactor')
                entry['failed_audits'] = [{'id': k, 'title': v['title'], 'score': v.get('score'), 'value': v.get('displayValue')} for k, v in data['audits'].items() if v.get('score') is not None and v['score'] < 1 and v.get('scoreDisplayMode') not in ['informative', 'notApplicable']]
            results.append(entry)
            print(json.dumps(entry), flush=True)
        finally:
            browser.close()
(OUT / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
if any(r['exit_code'] != 0 or r.get('runtime_error') for r in results):
    raise SystemExit(1)
