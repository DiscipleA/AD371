#!/usr/bin/env python3
"""Exercise only this Compose project. Never fabricates evidence.

Requires an already built/running lab and Docker privileges. This script stops,
starts and recreates ONLY store-a in this project and finally starts both stores.
Use --output explicitly to retain a JSON report; otherwise writes only stdout.
The public-only probe uses the already-built backend image (--pull=never).
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import ipaddress
import json
from pathlib import Path
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

PROJECT = 'stylestore-network-lab'
ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / 'compose.yaml'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def require(condition, message):
    if not condition:
        raise AssertionError(message)


class Verifier:
    def __init__(self, args):
        self.args = args
        self.docker = shlex.split(args.docker_command)
        require(bool(self.docker), 'Missing Docker command')
        self.compose = self.docker + ['compose', '--project-name', PROJECT,
                                     '--project-directory', str(ROOT), '--file', str(COMPOSE_FILE)]
        self.report = {'project': PROJECT, 'compose_file': str(COMPOSE_FILE),
                       'started_at': datetime.now(timezone.utc).isoformat(),
                       'checks': {}, 'success': False,
                       'scope': 'Container bridge isolation, not isolation from the privileged host'}
        self.config = None
        self.base = None
        self.mutated = False
        self.probe_name = f'{PROJECT}-public-probe-{uuid.uuid4().hex[:12]}'
        self.holder_name = f'{PROJECT}-address-holder-{uuid.uuid4().hex[:12]}'

    def run(self, command, timeout=60):
        result = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
        if result.returncode:
            raise RuntimeError(f'Command failed ({result.returncode}): {shlex.join(command)}\n{result.stderr.strip()}\n{result.stdout.strip()}')
        return result.stdout.strip()

    def dc(self, *arguments, timeout=60):
        return self.run(self.compose + list(arguments), timeout)

    def inspect(self, service):
        ids = self.dc('ps', '--all', '--quiet', service).splitlines()
        require(len(ids) == 1, f'Expected one {service} container, got {len(ids)}')
        data = json.loads(self.run(self.docker + ['inspect', ids[0]]))[0]
        require(data['Config']['Labels'].get('com.docker.compose.project') == PROJECT, 'Unexpected project ownership')
        require(data['Config']['Labels'].get('com.docker.compose.service') == service, 'Unexpected service ownership')
        return data

    def request(self, path, method='GET', headers=None):
        started = time.monotonic()
        request = urllib.request.Request(self.base + path, method=method, headers=headers or {})
        try:
            response = OPENER.open(request, timeout=8)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read(1024 * 1024)
            result = {'status': response.status, 'headers': dict(response.headers.items()),
                      'body': body.decode('utf-8', errors='replace'),
                      'elapsed_ms': round((time.monotonic() - started) * 1000, 3)}
        # urllib's original-case header dictionary is preserved for evidence.
        lower = {key.lower(): value for key, value in result['headers'].items()}
        require(lower.get('x-lab-gateway') == 'nginx', f'Gateway marker missing for {path}: {result}')
        require(lower.get('cache-control') == 'no-store', f'Unsafe caching for {path}')
        require(lower.get('x-content-type-options') == 'nosniff', f'Nosniff missing for {path}')
        return result

    def quote(self):
        response = self.request('/api/quote?quantity=2')
        require(response['status'] == 200, f'Quote failed: {response}')
        headers = {key.lower(): value for key, value in response['headers'].items()}
        require(headers.get('content-type', '').startswith('application/json'), 'Non-JSON quote')
        body = json.loads(response['body'])
        require(body.get('serverId') in ['store-a', 'store-b'], 'Invalid server identity')
        expected = {'serverId': body['serverId'], 'product': {'id': 'retro-sneakers', 'name': 'Retro Sneakers', 'unitPriceCents': 8500},
                    'quantity': 2, 'totalCents': 17000, 'currency': 'USD'}
        require(body == expected, f'Invalid quote contract: {body}')
        require(headers.get('x-store-id') == body['serverId'], 'Replica marker/body mismatch')
        return {'serverId': body['serverId'], 'status': 200, 'elapsed_ms': response['elapsed_ms'], 'body': body}

    def batch(self, count=10):
        replies = []
        for _ in range(count):
            replies.append(self.quote())
            time.sleep(0.13)
        return {'valid_200_json_count': len(replies),
                'distribution': dict(Counter(item['serverId'] for item in replies)), 'responses': replies}

    def wait_healthy(self, services=('store-a', 'store-b'), timeout=60):
        deadline = time.monotonic() + timeout
        last = ''
        while time.monotonic() < deadline:
            try:
                observations = {}
                for service in services:
                    container = self.inspect(service)
                    require(container['State']['Running'], f'{service} is not running')
                    require(container['State'].get('Health', {}).get('Status') == 'healthy', f'{service} not healthy yet')
                    response = self.request('/api/health/' + service)
                    require(response['status'] == 200, f'{service} gateway probe {response["status"]}')
                    require(json.loads(response['body']) == {'status': 'ok', 'serverId': service}, 'Probe identity mismatch')
                    observations[service] = {'container_id': container['Id'], 'health': 'healthy', 'gateway_probe': 200}
                return observations
            except (AssertionError, RuntimeError, OSError, ValueError) as error:
                last = str(error)
                time.sleep(1)
        raise TimeoutError(f'Healthy wait expired: {last}')

    def topology(self):
        self.config = json.loads(self.dc('config', '--format', 'json'))
        require(self.config.get('name') == PROJECT, 'Wrong normalized project')
        require(set(self.config['services']) == {'nginx', 'store-a', 'store-b'}, 'Unexpected service set')
        require(set(self.config['networks']) == {'public_subnet', 'private_subnet'}, 'Unexpected network set')
        normalized_ports = self.config['services']['nginx'].get('ports', [])
        require(len(normalized_ports) == 1, 'Gateway must publish exactly one port')
        publish = normalized_ports[0]
        require(str(publish['target']) == '80' and publish.get('protocol', 'tcp') == 'tcp', 'Unexpected gateway target')
        require(publish.get('host_ip') == '127.0.0.1', 'Refusing non-loopback host publication')
        default_base = f'http://127.0.0.1:{publish["published"]}'
        self.base = (self.args.base_url or default_base).rstrip('/')
        parsed = urllib.parse.urlsplit(self.base)
        require(parsed.scheme == 'http' and parsed.hostname in ['127.0.0.1', 'localhost'] and parsed.path in ['', '/'] and not parsed.query and not parsed.fragment and not parsed.username,
                'Base URL must be this local HTTP gateway')
        require((parsed.port or 80) == int(publish['published']), 'Base URL port does not match normalized Compose publication')
        containers = {name: self.inspect(name) for name in ['nginx', 'store-a', 'store-b']}
        owned_ids = self.run(self.docker + ['ps', '--all', '--quiet', '--filter', f'label=com.docker.compose.project={PROJECT}']).splitlines()
        require(len(owned_ids) == 3, f'Expected exactly three project containers, got {len(owned_ids)}')
        network_info = {}
        cidrs = []
        for key in ['public_subnet', 'private_subnet']:
            config = self.config['networks'][key]
            actual = json.loads(self.run(self.docker + ['network', 'inspect', config['name']]))[0]
            require(actual['Labels'].get('com.docker.compose.project') == PROJECT, 'Unexpected network owner')
            require(actual['Driver'] == 'bridge', 'Network is not a bridge')
            require(actual['Internal'] == (key == 'private_subnet'), 'Internal network boundary mismatch')
            expected_cidr = str(ipaddress.ip_network(config['ipam']['config'][0]['subnet']))
            require(any(item.get('Subnet') == expected_cidr for item in actual['IPAM']['Config']), 'Live IPAM differs from normalized config')
            cidrs.append(ipaddress.ip_network(expected_cidr))
            network_info[key] = {'name': config['name'], 'id': actual['Id'], 'cidr': expected_cidr, 'internal': actual['Internal']}
        require(not cidrs[0].overlaps(cidrs[1]), 'Bridge CIDRs overlap')
        public = network_info['public_subnet']['name']
        private = network_info['private_subnet']['name']
        for name, container in containers.items():
            require(container['State']['Running'], f'{name} is not running')
            attached = set(container['NetworkSettings']['Networks'])
            require(attached == ({public, private} if name == 'nginx' else {private}), f'{name} network leakage: {attached}')
            bindings = container['HostConfig'].get('PortBindings') or {}
            live_ports = container['NetworkSettings'].get('Ports') or {}
            if name == 'nginx':
                require(set(bindings) == {'80/tcp'}, 'Unexpected gateway host bindings')
                require(bindings['80/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': str(publish['published'])}], 'Unsafe live gateway bind')
            else:
                require(not bindings and not any(live_ports.values()), f'Backend {name} port leaked to host')
                require(not self.config['services'][name].get('ports'), f'{name} normalized ports leaked')
                require(container['Config']['User'] == 'node', 'Backend is not nonroot')
                require(container['HostConfig']['ReadonlyRootfs'], 'Backend rootfs is writable')
                require(container['HostConfig']['CapDrop'] == ['ALL'], 'Backend capabilities not dropped')
        require(containers['store-a']['Image'] == containers['store-b']['Image'], 'Replicas do not use identical immutable image ID')
        self.report['checks']['topology'] = {'gateway': self.base, 'networks': network_info,
            'containers': {name: {'id': c['Id'], 'image_id': c['Image'],
                                  'networks': {k: v['IPAddress'] for k, v in c['NetworkSettings']['Networks'].items()},
                                  'host_ports': c['HostConfig'].get('PortBindings') or {}} for name, c in containers.items()}}
        return containers, public, private

    def http_contracts(self):
        observations = []
        for path, method, status in [('/api/quote', 'GET', 400), ('/api/quote?quantity=0', 'GET', 400),
                 ('/api/quote?quantity=10', 'GET', 400), ('/api/quote?quantity=1&quantity=2', 'GET', 400),
                 ('/api/quote?quantity=1&extra=2', 'GET', 400), ('/api/unknown', 'GET', 404),
                 ('/.env', 'GET', 404), ('/server/server.mjs', 'GET', 404),
                 ('/docs/assignment-plan.md', 'GET', 404), ('/assets/not-real.js.map', 'GET', 404),
                 ('/api/quote?quantity=2', 'POST', 405), ('/api/quote?quantity=2', 'HEAD', 200)]:
            response = self.request(path, method)
            require(response['status'] == status, f'Wrong status for {method} {path}: {response}')
            if method == 'HEAD': require(not response['body'], 'HEAD contains a body')
            observations.append({'method': method, 'path': path, 'status': response['status']})
            time.sleep(0.13)
        approved = ['http://127.0.0.1:8785', 'http://localhost:8785', 'https://chernichenkodmitriy.com', 'https://www.chernichenkodmitriy.com']
        for origin in approved:
            response = self.request('/api/quote?quantity=2', 'OPTIONS', {'Origin': origin, 'Access-Control-Request-Method': 'GET'})
            require(response['status'] == 204 and not response['body'], f'Preflight failed for {origin}')
            headers = {k.lower(): v for k, v in response['headers'].items()}
            require(headers.get('access-control-allow-origin') == origin, 'CORS allowlist mismatch')
            get = self.request('/api/quote?quantity=2', headers={'Origin': origin})
            require(get['status'] == 200 and {k.lower(): v for k, v in get['headers'].items()}.get('access-control-allow-origin') == origin, 'Approved-origin GET failed')
            observations.append({'origin': origin, 'preflight': 204, 'get': 200})
            time.sleep(0.13)
        for origin in ['https://attacker.invalid', 'http://localhost:8785.attacker.invalid']:
            response = self.request('/api/quote?quantity=2', 'OPTIONS', {'Origin': origin, 'Access-Control-Request-Method': 'GET'})
            require(response['status'] == 403, 'Unapproved-origin preflight must be rejected')
            require('access-control-allow-origin' not in {k.lower() for k in response['headers']}, 'Origin reflected')
            observations.append({'origin': origin, 'preflight': response['status']})
        page = self.request('/')
        require(page['status'] == 200 and '<!doctype html' in page['body'].lower(), 'Compiled frontend is not served')
        self.report['checks']['http_contracts'] = observations

    def public_probe(self, containers, public, private):
        targets = [containers[name]['NetworkSettings']['Networks'][private]['IPAddress'] for name in ['store-a', 'store-b']]
        # Positive control proves the probe runs and the public network reaches nginx.
        gateway_ip = containers['nginx']['NetworkSettings']['Networks'][public]['IPAddress']
        source = """const gateway=process.argv[1], targets=process.argv.slice(2);const results=[];
const control=await fetch('http://'+gateway+'/',{signal:AbortSignal.timeout(2500)});
if(!control.ok||control.headers.get('x-lab-gateway')!=='nginx')throw Error('positive control failed');
for(const ip of targets){let reachable=false;try{await fetch('http://'+ip+':3000/healthz',{signal:AbortSignal.timeout(2000)});reachable=true}catch{}results.push({ip,port:3000,reachable});}
console.log(JSON.stringify({positiveControl:'gateway-reachable',targets:results}));if(results.some(x=>x.reachable))process.exit(1);"""
        self.mutated = True
        output = self.run(self.docker + ['run', '--rm', '--pull=never', '--name', self.probe_name,
                   '--label', f'lab.verifier.project={PROJECT}', '--network', public, '--user', 'node',
                   '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
                   '--memory=64m', '--pids-limit=32', '--entrypoint', 'node', containers['store-a']['Image'],
                   '--input-type=module', '-e', source, gateway_ip, *targets], timeout=20)
        result = json.loads(output)
        require(result['positiveControl'] == 'gateway-reachable', 'Probe positive control failed')
        require(all(not item['reachable'] for item in result['targets']), 'Private backend reachable from public-only bridge')
        self.report['checks']['public_only_probe'] = result

    def failover(self):
        self.mutated = True
        self.dc('stop', '--timeout', '8', 'store-a')
        require(not self.inspect('store-a')['State']['Running'], 'store-a did not stop')
        probe = self.request('/api/health/store-a')
        require(probe['status'] in [502, 503, 504], f'Individual stopped probe incorrectly fell back: {probe}')
        b_probe = self.request('/api/health/store-b')
        require(b_probe['status'] == 200 and json.loads(b_probe['body'])['serverId'] == 'store-b', 'Surviving individual probe failed')
        failed = self.batch()
        require(failed['distribution'] == {'store-b': 10}, f'Stopped-A requests did not all reach B: {failed}')
        self.report['checks']['stop_a_failover'] = {'individual_a_status': probe['status'], 'individual_b_status': 200, **failed}
        self.dc('start', 'store-a')
        self.wait_healthy()
        restored = self.wait_distribution()
        self.report['checks']['restore_a'] = restored
        previous = self.inspect('store-a')
        private = self.config['networks']['private_subnet']['name']
        old_ip = previous['NetworkSettings']['Networks'][private]['IPAddress']
        # Reserve the old address with a scoped no-listener helper. This forces
        # a genuinely new IP instead of mistaking same-IP recreation for DNS proof.
        self.dc('stop', '--timeout', '8', 'store-a')
        self.dc('rm', '--force', 'store-a')
        self.run(self.docker + ['run', '--detach', '--pull=never', '--name', self.holder_name,
                  '--label', f'lab.verifier.project={PROJECT}', '--network', private, '--ip', old_ip,
                  '--user', 'node', '--read-only', '--cap-drop=ALL',
                  '--security-opt=no-new-privileges:true', '--memory=64m', '--pids-limit=32',
                  '--entrypoint', 'node', previous['Image'], '-e', 'setTimeout(()=>{},120000)'])
        holder = json.loads(self.run(self.docker + ['inspect', self.holder_name]))[0]
        require(set(holder['NetworkSettings']['Networks']) == {private}, 'Address holder network mismatch')
        require(holder['NetworkSettings']['Networks'][private]['IPAddress'] == old_ip, 'Old IP was not reserved')
        self.dc('up', '--detach', '--no-deps', '--no-build', '--force-recreate', 'store-a', timeout=90)
        healthy = self.wait_healthy()
        current = self.inspect('store-a')
        require(previous['Id'] != current['Id'], 'Recreate did not create a new container')
        new_ip = current['NetworkSettings']['Networks'][private]['IPAddress']
        require(old_ip != new_ip, 'Recreation did not change the backend IP')
        self.report['checks']['recreate_a'] = {'old_id': previous['Id'], 'new_id': current['Id'],
            'old_ip': old_ip, 'new_ip': new_ip, 'ip_changed': True,
            'dns_new_ip_recovery_proven': True,
            'healthy': healthy, 'batch': self.wait_distribution()}
        self.cleanup_helper(self.holder_name)

    def wait_distribution(self, timeout=35):
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            last = self.batch()
            if set(last['distribution']) == {'store-a', 'store-b'}:
                return last
            time.sleep(2)
        raise AssertionError(f'Both replicas did not rejoin distribution: {last}')

    def cleanup_helper(self, name):
        require(name in [self.probe_name, self.holder_name], 'Unscoped helper cleanup')
        result = subprocess.run(self.docker + ['inspect', name], cwd=ROOT,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if result.returncode == 0:
            container = json.loads(result.stdout)[0]
            require(container['Config']['Labels'].get('lab.verifier.project') == PROJECT, 'Helper cleanup ownership mismatch')
            self.run(self.docker + ['rm', '--force', name])

    def execute(self):
        try:
            containers, public, private = self.topology()
            self.report['checks']['initial_health'] = self.wait_healthy()
            batch = self.batch()
            require(set(batch['distribution']) == {'store-a', 'store-b'}, 'Initial batch did not reach both stores')
            # A gateway healthcheck can insert a page GET during the batch.
            require(abs(batch['distribution']['store-a'] - batch['distribution']['store-b']) <= 2,
                    f'Initial distribution is unexpectedly skewed: {batch}')
            self.report['checks']['round_robin'] = batch
            self.http_contracts()
            self.public_probe(containers, public, private)
            self.failover()
            self.report['success'] = True
        except Exception as error:
            self.report['error'] = f'{type(error).__name__}: {error}'
        finally:
            if self.mutated:
                try:
                    self.cleanup_helper(self.probe_name)
                    self.cleanup_helper(self.holder_name)
                    # Re-create only A if interrupted between its removal and recreation.
                    if not self.dc('ps', '--all', '--quiet', 'store-a'):
                        self.dc('up', '--detach', '--no-deps', '--no-build', 'store-a', timeout=90)
                    self.dc('start', 'store-a', 'store-b')
                    self.report['restoration'] = self.wait_healthy()
                except Exception as error:
                    self.report['success'] = False
                    self.report['restoration_error'] = f'{type(error).__name__}: {error}'
            self.report['finished_at'] = datetime.now(timezone.utc).isoformat()
        return self.report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--docker-command', default='docker', help='Docker command/prefix, e.g. "sudo docker"; parsed without a shell')
    parser.add_argument('--base-url', help='Optional loopback gateway URL; port must match Compose')
    parser.add_argument('--output', type=Path, help='Explicit JSON output path; default is stdout only')
    args = parser.parse_args()
    report = Verifier(args).execute()
    text = json.dumps(report, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    sys.stdout.write(text)
    return 0 if report['success'] else 1


if __name__ == '__main__':
    sys.exit(main())
