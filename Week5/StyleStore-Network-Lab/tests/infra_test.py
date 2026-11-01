"""Static contracts; live topology evidence comes only from verify-containers.py."""
import pathlib
import re
import unittest
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]

class InfraContracts(unittest.TestCase):
    def setUp(self):
        self.compose = yaml.safe_load((ROOT / 'compose.yaml').read_text())
        self.nginx = (ROOT / 'infra/nginx.conf').read_text()

    def test_only_gateway_bridges_networks_and_publishes_loopback(self):
        c = self.compose
        self.assertEqual(c['name'], 'stylestore-network-lab')
        self.assertEqual(set(c['services']), {'nginx', 'store-a', 'store-b'})
        for name, service in c['services'].items():
            self.assertNotIn('network_mode', service)
            self.assertNotIn('privileged', service)
            self.assertNotIn('container_name', service)
            if name == 'nginx':
                self.assertEqual(set(service['networks']), {'public_subnet', 'private_subnet'})
                self.assertEqual(service['ports'], ['${HOST_BIND:-127.0.0.1}:${HOST_PORT:-80}:80'])
            else:
                self.assertEqual(service['networks'], ['private_subnet'])
                self.assertNotIn('ports', service)
                self.assertEqual(service['expose'], ['3000'])

    def test_bridge_networks_have_distinct_configurable_cidrs(self):
        nets = self.compose['networks']
        self.assertEqual(set(nets), {'public_subnet', 'private_subnet'})
        for net in nets.values():
            self.assertEqual(net['driver'], 'bridge')
            self.assertRegex(net['ipam']['config'][0]['subnet'], r'^\$\{[A-Z_]+:-172\.30\.5[12]\.0/24\}$')
        self.assertTrue(nets['private_subnet']['internal'])
        self.assertNotEqual(nets['public_subnet']['ipam'], nets['private_subnet']['ipam'])

    def test_replicas_share_image_build_and_are_hardened(self):
        a, b = (self.compose['services'][n] for n in ('store-a', 'store-b'))
        self.assertEqual(a['image'], b['image'])
        self.assertEqual(a['build'], b['build'])
        for name, s in [('store-a', a), ('store-b', b)]:
            self.assertEqual(s['environment']['SERVER_ID'], name)
            self.assertEqual(str(s['environment']['PORT']), '3000')
            self.assertEqual(s['user'], 'node')
            self.assertTrue(s['read_only'])
            self.assertEqual(s['cap_drop'], ['ALL'])
            self.assertIn('no-new-privileges:true', s['security_opt'])
            self.assertIn('mem_limit', s)
            self.assertIn('pids_limit', s)
            self.assertTrue(any(t.startswith('/tmp:') for t in s['tmpfs']))
            self.assertIn('/healthz', ' '.join(s['healthcheck']['test']))
            self.assertNotIn('volumes', s)

    def test_gateway_is_readonly_with_required_writable_runtime_paths(self):
        s = self.compose['services']['nginx']
        self.assertTrue(s['read_only'])
        for directory in ['/var/cache/nginx', '/var/run', '/tmp']:
            self.assertTrue(any(t.split(':')[0] == directory for t in s['tmpfs']), directory)
        self.assertEqual(s['cap_drop'], ['ALL'])
        self.assertIn('no-new-privileges:true', s['security_opt'])
        self.assertEqual(set(s['depends_on']), {'store-a', 'store-b'})

    def test_balancer_uses_equal_roundrobin_shared_state_and_docker_dns(self):
        n = self.nginx
        self.assertIn('resolver 127.0.0.11', n)
        self.assertRegex(n, r'upstream stores\s*\{[^}]*zone stores')
        for name in ['store-a', 'store-b']:
            self.assertRegex(n, rf'server {name}:3000 resolve max_fails=1 fail_timeout=2s;')
        self.assertNotRegex(n, r'ip_hash|least_conn|weight=|172\.30\.')
        self.assertIn('proxy_pass http://stores;', n)
        self.assertRegex(n, r'proxy_next_upstream_tries\s+2;')
        for setting in ['proxy_connect_timeout', 'proxy_read_timeout', 'proxy_send_timeout', 'proxy_next_upstream_timeout']:
            self.assertRegex(n, setting + r'\s+[1-5]s;')
        self.assertIn('proxy_buffering on;', n)
        self.assertNotIn('proxy_cache_path', n)

    def test_exact_individual_health_probes_cannot_fallback(self):
        for name in ['store-a', 'store-b']:
            block = re.search(r'location = /api/health/' + name + r'\s*\{([^}]+)\}', self.nginx).group(1)
            self.assertIn(f'proxy_pass http://{name.replace("-", "_")}_probe/healthz;', block)
            self.assertIn('proxy_next_upstream off;', block)

    def test_gateway_enforces_methods_rate_limits_and_safe_error_metadata(self):
        n = self.nginx
        self.assertIn('X-Lab-Gateway nginx always', n)
        self.assertIn('Cache-Control "no-store" always', n)
        self.assertIn('X-Content-Type-Options nosniff always', n)
        self.assertRegex(n, r'limit_req_zone[^;]+rate=10r/s;')
        self.assertIn('burst=20 nodelay', n)
        self.assertIn('limit_req_status 429;', n)
        self.assertIn('GET|HEAD|OPTIONS', n)
        self.assertIn('return 405;', n)
        self.assertIn('return 204;', n)
        self.assertIn('proxy_hide_header Cache-Control;', n)
        for code in [400, 403, 404, 405, 408, 413, 414, 429, 500, 502, 503, 504]:
            self.assertIn(f'error_page {code} = @gateway_{code};', n)
            self.assertRegex(n, rf'location @gateway_{code}\s*\{{[^}}]*return {code} ')
        self.assertNotRegex(n, r'stub_status|/admin|proxy_store\s+on')

    def test_cors_uses_exact_origin_map_not_wildcard_or_arbitrary_echo(self):
        n = self.nginx
        self.assertIn('map $http_origin $cors_origin', n)
        for origin in ['http://127.0.0.1:8785', 'http://localhost:8785', 'https://chernichenkodmitriy.com', 'https://www.chernichenkodmitriy.com']:
            self.assertIn(f'"{origin}" "{origin}";', n)
        self.assertRegex(n, r'default\s+"";')
        self.assertIn('Access-Control-Allow-Origin $cors_origin always', n)
        self.assertIn('Access-Control-Expose-Headers "X-Store-Id, X-Lab-Gateway" always', n)
        self.assertNotIn('Access-Control-Allow-Origin *', n)
        self.assertNotRegex(n, r'Access-Control-Allow-Origin\s+\$http_origin')

    def test_docker_runtime_contains_only_server_and_compiled_dist(self):
        d = (ROOT / 'Dockerfile').read_text()
        self.assertRegex(d, r'FROM node:24-alpine@sha256:[a-f0-9]{64} AS build')
        self.assertIn('RUN npm ci', d)
        self.assertIn('RUN npm run build', d)
        self.assertRegex(d, r'FROM node:24-alpine@sha256:[a-f0-9]{64} AS runtime')
        self.assertIn('COPY --from=build --chown=node:node /app/dist ./dist', d)
        self.assertIn('COPY --chown=node:node server/ ./server/', d)
        self.assertIn('USER node', d)
        self.assertIn('CMD ["node", "server/server.mjs"]', d)
        runtime = d.split('AS runtime', 1)[1]
        self.assertNotRegex(runtime, r'COPY\s+\.\s|node_modules|npm install')
        ignore = (ROOT / '.dockerignore').read_text()
        for item in ['node_modules', '.git', '.env*', 'docs', 'tests', 'dist']:
            self.assertIn(item, ignore)

    def test_images_are_pinned_to_verified_registry_manifests(self):
        node = 'node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85'
        nginx = 'nginx:stable-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949'
        dockerfile = (ROOT / 'Dockerfile').read_text()
        self.assertIn(f'FROM {node} AS build', dockerfile)
        self.assertIn(f'FROM {node} AS runtime', dockerfile)
        self.assertEqual(self.compose['services']['nginx']['image'], nginx)

    def test_nginx_worker_count_fits_bounded_pid_limit_on_large_hosts(self):
        workers = re.search(r'worker_processes\s+(\d+);', self.nginx)
        self.assertIsNotNone(workers, 'Do not use host CPU auto count inside a pids-limited container')
        self.assertLessEqual(int(workers.group(1)), 4)

    def test_safe_backend_errors_are_not_replaced_by_gateway_html_or_success(self):
        self.assertIn('proxy_intercept_errors off;', self.nginx)

    def test_live_verifier_forces_new_ip_before_claiming_dns_recovery(self):
        script = (ROOT / 'scripts/verify-containers.py').read_text()
        self.assertIn('address-holder', script)
        self.assertIn("'--ip', old_ip", script)
        self.assertIn("require(old_ip != new_ip", script)
        self.assertIn('self.cleanup_helper(self.holder_name)', script)

    def test_live_verifier_has_explicit_scope_and_no_implicit_report_write(self):
        script = (ROOT / 'scripts/verify-containers.py').read_text()
        for token in ['--output', 'stylestore-network-lab', 'compose.yaml', 'private_subnet', 'public_subnet', 'finally:', 'stop', 'start', 'force-recreate']:
            self.assertIn(token, script)
        self.assertNotRegex(script, r'system\s+prune|volume\s+prune|docker.sock|shell=True')

if __name__ == '__main__':
    unittest.main(verbosity=2)
