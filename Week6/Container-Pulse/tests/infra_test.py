"""Read-only infrastructure checks and acceptance-runner safety tests (stdlib only)."""
import copy
import importlib.util
import json
import pathlib
import subprocess
import sys
import textwrap
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROJECT = 'ad371-week6-container-pulse'
RUNNER = ROOT / 'scripts' / 'verify-containers.py'


def runner_module():
    if not RUNNER.is_file():
        raise AssertionError('Scoped container acceptance runner is missing')
    spec = importlib.util.spec_from_file_location('pulse_verify', RUNNER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def compose_config():
    if not (ROOT / 'compose.yaml').is_file():
        raise AssertionError('Isolated Compose implementation is missing')
    result = subprocess.run([
        'docker', 'compose', '--project-name', PROJECT, '--file', str(ROOT / 'compose.yaml'),
        '--env-file', str(ROOT / '.env.example'), 'config', '--no-env-resolution', '--format', 'json',
    ], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


class InfrastructureTests(unittest.TestCase):
    def test_compose_has_only_project_scoped_app_gateway_and_bridge(self):
        config = compose_config()
        self.assertEqual(config['name'], PROJECT)
        self.assertEqual(set(config['services']), {'app', 'gateway'})
        self.assertEqual(set(config['networks']), {'pulse'})
        self.assertEqual(config['networks']['pulse']['driver'], 'bridge')
        self.assertEqual(config['networks']['pulse']['name'], PROJECT + '_pulse')
        self.assertNotIn('external', config['networks']['pulse'])
        self.assertFalse(config['networks']['pulse'].get('ipam'))
        self.assertFalse(config.get('volumes'))
        for service in config['services'].values():
            self.assertNotIn('container_name', service)
            self.assertEqual(set(service['networks']), {'pulse'})

    def test_only_gateway_publishes_localhost_8796(self):
        services = compose_config()['services']
        self.assertFalse(services['app'].get('ports'))
        self.assertEqual(len(services['gateway']['ports']), 1)
        port = services['gateway']['ports'][0]
        self.assertEqual((port['host_ip'], str(port['published']), port['target']), ('127.0.0.1', '8796', 8080))

    def test_services_have_enforced_budgets_and_hardening(self):
        services = compose_config()['services']
        for name, cpu, memory, user in [('app', .5, 134217728, 'node'), ('gateway', .25, 67108864, 'nginx')]:
            with self.subTest(service=name):
                service = services[name]
                self.assertEqual(service['user'], user)
                self.assertEqual(service['restart'], 'unless-stopped')
                self.assertTrue(service['read_only'])
                self.assertTrue(service['init'])
                self.assertIn('ALL', service['cap_drop'])
                self.assertIn('no-new-privileges:true', service['security_opt'])
                self.assertEqual(float(service['deploy']['resources']['limits']['cpus']), cpu)
                self.assertEqual(int(service['deploy']['resources']['limits']['memory']), memory)
                self.assertTrue(service['healthcheck']['test'])
                self.assertLessEqual(service['pids_limit'], 128)
        self.assertEqual(services['app']['deploy']['replicas'], 2)
        self.assertEqual(services['app']['image'], PROJECT + '-app:local')
        self.assertFalse(services['app'].get('volumes'))
        self.assertEqual(services['app']['env_file'][0]['path'], str(ROOT / '.env'))
        mounts = services['gateway']['volumes']
        self.assertEqual(len(mounts), 1)
        self.assertEqual(mounts[0]['type'], 'bind')
        self.assertTrue(mounts[0]['read_only'])
        self.assertEqual(mounts[0]['source'], str(ROOT / 'infra/nginx.conf'))
        self.assertIn('/tmp', services['gateway']['tmpfs'][0])

    def test_build_caches_manifests_before_source_and_excludes_build_dependencies(self):
        dockerfile = ROOT / 'Dockerfile'
        self.assertTrue(dockerfile.is_file(), 'Multi-stage Dockerfile is missing')
        text = dockerfile.read_text()
        self.assertEqual(text.count('FROM '), 2)
        self.assertIn('node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8', text)
        self.assertLess(text.index('COPY package.json package-lock.json'), text.index('npm ci --ignore-scripts'))
        self.assertLess(text.index('npm ci --ignore-scripts'), text.index('COPY . .'))
        self.assertIn('npm run build', text)
        self.assertIn('npm cache clean --force', text)
        runtime = text.split('FROM ')[2]
        self.assertIn('USER node', runtime)
        self.assertIn('HEALTHCHECK', runtime)
        self.assertIn('["node", "server/server.mjs"]', runtime)
        self.assertIn('/app/dist', runtime)
        self.assertIn('/app/server', runtime)
        self.assertNotIn('node_modules', runtime)
        self.assertNotIn('COPY . .', runtime)
        self.assertNotIn('npm ci', runtime)

    def test_gateway_has_dynamic_dns_and_no_administrative_surface(self):
        conf = ROOT / 'infra/nginx.conf'
        self.assertTrue(conf.is_file(), 'Non-root Nginx gateway configuration is missing')
        text = conf.read_text()
        self.assertIn('resolver 127.0.0.11 valid=2s ipv6=off;', text)
        self.assertIn('zone pulse_backends 64k;', text)
        self.assertIn('server app:3000 resolve;', text)
        self.assertIn('listen 8080;', text)
        self.assertIn('pid /tmp/nginx.pid;', text)
        self.assertIn('proxy_pass http://pulse_backends;', text)
        self.assertIn('proxy_pass_request_headers off;', text)
        self.assertIn('proxy_pass_request_body off;', text)
        self.assertNotIn('stub_status', text)
        self.assertNotIn('docker.sock', text)
        self.assertIn('nginx:stable-alpine@sha256:e9b2d7624fd7957f4ed44ae0a272d93fb73aeb8512ba8916f8118ae6143fd115', (ROOT / 'compose.yaml').read_text())

    def test_gateway_cors_is_an_exact_origin_allowlist_on_success_and_errors(self):
        import re
        text = (ROOT / 'infra/nginx.conf').read_text()
        mapping = re.search(r'map \$http_origin \$pulse_cors_origin \{([^}]+)\}', text)
        self.assertIsNotNone(mapping, 'Gateway needs an explicit CORS origin allowlist')
        entries = re.findall(r'(?m)^\s*(\S+)\s+([^;]+);', mapping.group(1))
        self.assertEqual(entries[0], ('default', '""'))
        allowed = ['https://chernichenkodmitriy.com',
                   'https://wild-resume-deployment.dmitriy-chernichenko.workers.dev',
                   'http://127.0.0.1:8788']
        self.assertEqual(len(entries), 4)
        patterns = []
        for pattern, value in entries[1:]:
            self.assertTrue(pattern.startswith('~^') and pattern.endswith('$'))
            patterns.append((re.compile(pattern[1:]), value.strip('"')))
        def mapped(origin):
            return next((value for pattern, value in patterns if pattern.fullmatch(origin)), '')
        for origin in allowed:
            self.assertEqual(mapped(origin), origin)
        for origin in ['', 'null', 'https://evil.test', 'http://chernichenkodmitriy.com',
                       'https://chernichenkodmitriy.com.evil.test', 'https://chernichenkodmitriy.com:443',
                       'https://CHERNICHENKODMITRIY.com', 'https://chernichenkodmitriy.com/',
                       'http://localhost:8788', 'http://127.0.0.1:8789']:
            self.assertEqual(mapped(origin), '', origin)
        self.assertIn('add_header Access-Control-Allow-Origin $pulse_cors_origin always;', text)
        self.assertIn('add_header Vary Origin always;', text)
        self.assertNotIn('Access-Control-Allow-Credentials', text)
        self.assertNotIn('Access-Control-Allow-Methods', text)
        self.assertNotIn('Access-Control-Allow-Headers', text)
        self.assertNotRegex(text, r'add_header Access-Control-Allow-Origin\s+["\']?\*')
        # No location-level add_header may shadow the server-level always headers,
        # including the named 503 fallback. Browser enforcement is tested separately.
        self.assertNotIn('add_header', text[text.index('location /'):])
        self.assertIn('proxy_pass_request_headers off;', text)
        self.assertIn('proxy_pass_request_body off;', text)
        self.assertNotRegex(text, r'proxy_set_header\s+(?:Cookie|Authorization)\s+\$')

    def test_context_excludes_secrets_local_dependencies_and_evidence(self):
        ignore = ROOT / '.dockerignore'
        example = ROOT / '.env.example'
        self.assertTrue(ignore.is_file(), 'Docker context ignore rules are missing')
        self.assertTrue(example.is_file(), 'Nonsecret environment example is missing')
        entries = ignore.read_text().splitlines()
        for entry in ['node_modules', '.env', '.env.*', '.git', 'dist', 'tests', 'docs', '*.log', '*.pem', '*.key']:
            self.assertIn(entry, entries)
        self.assertEqual(example.read_text(), 'HOST_PORT=8796\nREPLICAS=2\nAPP_VERSION=1.0.0\n')


class RunnerSafetyTests(unittest.TestCase):
    def test_platform_manifest_identity_is_not_confused_with_config_digest(self):
        module = runner_module()
        manifest, config_id = 'sha256:' + 'a' * 64, 'sha256:' + 'b' * 64
        apps = [{'service': 'app', 'id': str(i) * 64, 'hostname': 'replica-' + str(i), 'imageId': config_id,
                 'imageManifest': {'digest': manifest}} for i in (1, 2)]
        records = apps + [{'service': 'gateway', 'id': '3' * 64}]
        def observed(command, timeout=120):
            if command[1] == 'version':
                return 'linux/amd64\n'
            if command[1:3] == ['image', 'inspect']:
                return json.dumps({'id': manifest, 'user': 'node', 'sizeBytes': 123})
            if command[1] == 'exec' and command[-2:] == ['id', '-u']:
                return '101\n'
            if command[1] == 'exec':
                replica = next(row for row in apps if row['id'] == command[2])
                return json.dumps({'uid': 1000, 'hostname': replica['hostname'], 'hasBuildDependencies': False,
                    'hasBuildScript': False, 'hasSource': False, 'hasPackageCache': False, 'hasDist': True, 'hasServer': True})
            self.fail('Unexpected command: ' + str(command))
        with mock.patch.object(module, 'run', side_effect=observed) as calls:
            try:
                report = module.verify_runtime_image(records)
            except ValueError as error:
                self.fail('Matching platform manifests must not fail config-ID comparison: ' + str(error))
        self.assertEqual(report['image']['id'], manifest)
        image_command = next(call.args[0] for call in calls.call_args_list if call.args[0][1:3] == ['image', 'inspect'])
        self.assertIn('--platform', image_command)
        self.assertIn('linux/amd64', image_command)
        mismatched = copy.deepcopy(records)
        mismatched[0]['imageManifest']['digest'] = 'sha256:' + 'c' * 64
        with mock.patch.object(module, 'run', side_effect=observed), self.assertRaises(ValueError):
            module.verify_runtime_image(mismatched)

    def test_optional_docker_metadata_uses_missing_safe_lookup(self):
        module = runner_module()
        self.assertIn('json (index .HostConfig "Tmpfs")', module.INSPECT_FORMAT)
        self.assertIn('json (index .HostConfig "PortBindings")', module.INSPECT_FORMAT)
        # Docker may omit optional maps for a service with no mounts or ports.
        observed = {'id': 'a' * 64, 'networks': {'__sentinel': ''}, 'tmpfs': None, 'portBindings': None}
        with mock.patch.object(module, 'run', return_value=json.dumps(observed)):
            actual = module.inspect_containers(['a' * 64], owned_details=True)
        self.assertIsNone(actual[0]['tmpfs'])
        self.assertIsNone(actual[0]['portBindings'])

    def test_no_mutation_flag_refuses_before_any_docker_call(self):
        self.assertTrue(RUNNER.is_file(), 'Scoped container acceptance runner is missing')
        result = subprocess.run([sys.executable, str(RUNNER)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        body = json.loads(result.stdout)
        self.assertEqual(body['status'], 'refused')
        self.assertIn('--allow-mutations', body['error'])
        self.assertFalse(body['mutationsPerformed'])

    def test_all_compose_commands_pin_exact_project_and_absolute_file(self):
        module = runner_module()
        command = module.compose_command(['up', '-d', '--scale', 'app=2'])
        self.assertEqual(command[:2], ['docker', 'compose'])
        self.assertEqual(command[command.index('--project-name') + 1], PROJECT)
        self.assertEqual(command[command.index('--file') + 1], str(ROOT / 'compose.yaml'))
        self.assertTrue(pathlib.Path(command[command.index('--file') + 1]).is_absolute())
        for args in [['down'], ['kill'], ['rm'], ['--project-name', 'week5'], ['up', '--remove-orphans'], ['up', 'week5']]:
            with self.assertRaises(ValueError, msg=str(args)):
                module.compose_command(args)

    def test_effective_configuration_is_checked_before_mutation(self):
        module = runner_module()
        config = compose_config()
        module.validate_compose(config)
        unsafe = copy.deepcopy(config)
        unsafe['services']['gateway']['ports'][0]['published'] = '80'
        with self.assertRaises(ValueError):
            module.validate_compose(unsafe)
        unsafe = copy.deepcopy(config)
        unsafe['networks']['pulse']['external'] = True
        with self.assertRaises(ValueError):
            module.validate_compose(unsafe)
        unsafe = copy.deepcopy(config)
        unsafe['services']['app']['volumes'] = [{'type': 'bind', 'source': '/var/run/docker.sock', 'target': '/var/run/docker.sock'}]
        with self.assertRaises(ValueError):
            module.validate_compose(unsafe)

    def test_runtime_validation_rejects_missing_extra_and_nonfinite_values(self):
        module = runner_module()
        good = {'service': 'container-pulse', 'hostname': 'test-fixture-host', 'processUptimeSeconds': 1.5, 'nodeVersion': 'v24.0.0', 'appVersion': '1.0.0'}
        module.validate_runtime(good)
        for body in [{**good, 'environment': {}}, {**good, 'processUptimeSeconds': float('nan')}, {**good, 'processUptimeSeconds': -1}, {**good, 'processUptimeSeconds': True}, {**good, 'appVersion': '<script>'}, {key: value for key, value in good.items() if key != 'hostname'}]:
            with self.assertRaises(ValueError):
                module.validate_runtime(body)

    def test_protected_snapshots_compare_identity_restarts_status_and_networks(self):
        module = runner_module()
        records = [{'id': 'test-protected-container', 'status': 'running', 'startedAt': 'test-start-time', 'restarts': 0, 'networks': {'week5_default': 'test-network'}, 'project': 'week5'}, {'id': 'test-owned-container', 'status': 'running', 'startedAt': 'test-start-time', 'restarts': 0, 'networks': {PROJECT + '_pulse': 'test-network'}, 'project': PROJECT}]
        baseline = module.protected_snapshot(records)
        self.assertEqual(set(baseline), {'test-protected-container'})
        self.assertNotIn('project', baseline['test-protected-container'])
        module.assert_protected_unchanged(baseline, copy.deepcopy(baseline))
        for field, value in [('status', 'exited'), ('startedAt', 'different'), ('restarts', 1), ('networks', {})]:
            changed = copy.deepcopy(baseline)
            changed['test-protected-container'][field] = value
            with self.assertRaises(ValueError, msg=field):
                module.assert_protected_unchanged(baseline, changed)
        with self.assertRaises(ValueError):
            module.assert_protected_unchanged(baseline, {})

    def test_inspection_format_never_requests_container_environment(self):
        module = runner_module()
        self.assertNotIn('.Env', module.INSPECT_FORMAT)
        for field in ['.Id', '.State.StartedAt', '.RestartCount', '.NetworkSettings.Networks', '.HostConfig.Memory', '.HostConfig.NanoCpus', '.Config.User']:
            self.assertIn(field, module.INSPECT_FORMAT)
        self.assertNotIn('{{json .}}', module.INSPECT_FORMAT)

    def test_protected_inspection_never_collects_sensitive_health_commands(self):
        module = runner_module()
        self.assertTrue(hasattr(module, 'PROTECTED_INSPECT_FORMAT'), 'Protected containers need a separate minimal inspection format')
        minimal = module.PROTECTED_INSPECT_FORMAT
        for field in ['.Id', '.State.Status', '.State.StartedAt', '.RestartCount', '.NetworkSettings.Networks']:
            self.assertIn(field, minimal)
        for field in ['.Env', '.Config.Healthcheck', '.Mounts', '.HostConfig', '.Config.Image']:
            self.assertNotIn(field, minimal)

    def test_effective_configuration_rejects_hardening_and_context_drift(self):
        module = runner_module()
        config = compose_config()
        for service, field, value in [('app', 'read_only', False), ('gateway', 'user', 'root'), ('app', 'network_mode', 'host'), ('gateway', 'container_name', 'shared'), ('app', 'environment', {'SECRET': 'test-fixture-not-a-real-secret'})]:
            unsafe = copy.deepcopy(config)
            unsafe['services'][service][field] = value
            with self.assertRaises(ValueError, msg=field):
                module.validate_compose(unsafe)
        unsafe = copy.deepcopy(config)
        unsafe['services']['app']['build']['context'] = str(ROOT.parent)
        with self.assertRaises(ValueError):
            module.validate_compose(unsafe)
        unsafe = copy.deepcopy(config)
        unsafe['services']['gateway']['entrypoint'] = ['unapproved-executable']
        with self.assertRaises(ValueError):
            module.validate_compose(unsafe)

    def test_evidence_can_never_overwrite_existing_project_json(self):
        module = runner_module()
        # package.json is parent owned. This test does not write or change it.
        if not (ROOT / 'package.json').exists():
            self.skipTest('Parent package manifest is not present yet')
        with self.assertRaises(ValueError):
            module.validate_output_path(ROOT / 'package.json')

    def test_interrupted_scaling_restores_two_without_touching_other_projects(self):
        # Explicit unit-test fixtures: this is NOT a live Docker acceptance result.
        module = runner_module()
        config = compose_config()
        commands = []
        protected = [{'id': 'test-protected', 'status': 'running', 'startedAt': 'test-start', 'restarts': 0, 'networks': {'week5_default': 'test-network'}, 'project': 'week5'}]
        owned = [{'id': 'test-owned-a', 'service': 'app', 'hostname': 'test-host-a'}, {'id': 'test-owned-b', 'service': 'app', 'hostname': 'test-host-b'}, {'id': 'test-gateway', 'service': 'gateway', 'hostname': 'test-gateway'}]
        def command_fixture(command, **_kwargs):
            commands.append(command)
            if command[-3:] == ['config', '--format', 'json']:
                return json.dumps(config)
            if command[:3] == ['docker', 'context', 'inspect']:
                return json.dumps('unix:///var/run/docker.sock')
            if 'app=3' in command:
                raise KeyboardInterrupt()
            return ''
        report = {'mutationsPerformed': False}
        caught = None
        with mock.patch.object(module, 'run', side_effect=command_fixture), mock.patch.object(module, 'all_containers', return_value=protected), mock.patch.object(module, 'week5_identity', return_value={'testIdentity': 'stable'}), mock.patch.object(module, 'wait_ready', return_value=owned), mock.patch.object(module, 'sample_hostnames', return_value={'testOnly': True}), mock.patch.dict(module.os.environ, {'DOCKER_HOST': ''}):
            try:
                module.execute_acceptance(report)
            except BaseException as error:
                caught = error
        self.assertIsInstance(caught, ValueError, 'Interruptions must become a controlled failure after restoration')
        self.assertEqual(report['restoration']['status'], 'two-healthy-replicas')
        self.assertTrue(report['protectedUnchanged'])
        mutation_commands = [command for command in commands if 'build' in command or 'up' in command]
        self.assertEqual(mutation_commands[-1][mutation_commands[-1].index('--scale') + 1], 'app=2')
        for command in mutation_commands:
            self.assertEqual(command[command.index('--project-name') + 1], PROJECT)
            self.assertNotIn('down', command)
            self.assertNotIn('week5', command)

    def test_sigterm_subprocess_restores_with_repeated_cleanup_signals(self):
        # Real process signals; all Docker/HTTP boundaries are explicit fixtures.
        fixture = textwrap.dedent('''\
            import contextlib
            import importlib.util
            import io
            import json
            import os
            import signal
            import sys
            from unittest import mock

            spec = importlib.util.spec_from_file_location('pulse_verify', sys.argv[1])
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            mode = sys.argv[2]
            commands, readiness, previous_calls = [], [], []
            interrupted = False
            def previous_handler(signum, frame):
                previous_calls.append(signum)
            previous = signal.SIG_DFL if mode == 'single' else previous_handler
            signal.signal(signal.SIGTERM, previous)
            previous_int = signal.getsignal(signal.SIGINT)
            protected = [{'id': 'test-protected', 'status': 'running', 'startedAt': 'test-start', 'restarts': 0, 'networks': {'week5_default': 'test-network'}, 'project': 'week5'}]
            def cleanup_signals():
                if mode in ('repeated', 'restore-timeout') and interrupted:
                    os.kill(os.getpid(), signal.SIGTERM)
                    os.kill(os.getpid(), signal.SIGINT)
                    os.kill(os.getpid(), signal.SIGTERM)
            def command_fixture(command, timeout=120):
                global interrupted
                commands.append({'argv': command, 'timeout': timeout})
                if 'config' in command:
                    return '{}'
                if command[:3] == ['docker', 'context', 'inspect']:
                    return json.dumps('unix:///var/run/docker.sock')
                if 'app=3' in command and mode not in ('success', 'preflight'):
                    interrupted = True
                    print('fixture: SIGTERM at app=3', file=sys.stderr, flush=True)
                    os.kill(os.getpid(), signal.SIGTERM)
                elif 'app=2' in command and interrupted:
                    cleanup_signals()
                    if mode == 'restore-timeout':
                        raise ValueError('A bounded Docker operation timed out')
                return ''
            def ready_fixture(replicas, timeout=90):
                readiness.append({'replicas': replicas, 'timeout': timeout})
                cleanup_signals()
                return [{'id': 'test-app-' + str(i), 'service': 'app', 'hostname': 'test-host-' + str(i)} for i in range(replicas)] + [{'id': 'test-gateway', 'service': 'gateway', 'hostname': 'test-gateway'}]
            def protected_fixture():
                cleanup_signals()
                return protected
            def identity_fixture():
                cleanup_signals()
                if mode == 'preflight':
                    raise ValueError('test unavailable baseline')
                return {'testIdentity': 'stable'}
            output = io.StringIO()
            with mock.patch.object(module, 'run', side_effect=command_fixture), mock.patch.object(module, 'validate_compose'), mock.patch.object(module, 'all_containers', side_effect=protected_fixture), mock.patch.object(module, 'week5_identity', side_effect=identity_fixture), mock.patch.object(module, 'wait_ready', side_effect=ready_fixture), mock.patch.object(module, 'sample_hostnames', return_value={'testOnly': True}), mock.patch.object(module, 'verify_http_contract', return_value=[]), mock.patch.object(module, 'verify_runtime_image', return_value={}), mock.patch.object(module, 'verify_network', return_value={}), mock.patch.dict(module.os.environ, {'DOCKER_HOST': ''}), contextlib.redirect_stdout(output):
                code = module.main(['--allow-mutations'])
            print(json.dumps({'code': code, 'report': json.loads(output.getvalue()), 'commands': commands, 'readiness': readiness, 'termHandlerRestored': signal.getsignal(signal.SIGTERM) == previous, 'intHandlerRestored': signal.getsignal(signal.SIGINT) == previous_int, 'previousHandlerCalls': previous_calls}))
            sys.exit(code)
        ''')
        for mode in ('single', 'repeated', 'restore-timeout', 'success', 'preflight'):
            with self.subTest(mode=mode):
                result = subprocess.run([sys.executable, '-B', '-c', fixture, str(RUNNER), mode], capture_output=True, text=True, timeout=10)
                expected_code = 0 if mode == 'success' else 1
                self.assertEqual(result.returncode, expected_code, f'Catchable signals must finish bounded cleanup; stderr={result.stderr!r}')
                evidence = json.loads(result.stdout)
                report = evidence['report']
                self.assertEqual(evidence['code'], expected_code)
                self.assertTrue(evidence['termHandlerRestored'])
                self.assertTrue(evidence['intHandlerRestored'])
                self.assertEqual(evidence['previousHandlerCalls'], [])
                self.assertEqual(report['status'], 'passed' if mode == 'success' else 'failed')
                mutations = [item for item in evidence['commands'] if 'build' in item['argv'] or 'up' in item['argv']]
                if mode == 'preflight':
                    self.assertFalse(mutations)
                    self.assertFalse(report['mutationsPerformed'])
                    continue
                self.assertTrue(report['protectedUnchanged'])
                self.assertEqual(report['protectedBefore'], report['protectedAfter'])
                self.assertEqual(report['week5Before'], report['week5After'])
                self.assertEqual(report['restoration']['status'], 'failed' if mode == 'restore-timeout' else 'two-healthy-replicas')
                if mode != 'success':
                    self.assertIn('interrupted', report['error'])
                self.assertEqual(mutations[-1]['argv'][mutations[-1]['argv'].index('--scale') + 1], 'app=2')
                self.assertEqual(mutations[-1]['timeout'], 120)
                if mode != 'restore-timeout':
                    self.assertEqual(evidence['readiness'][-1], {'replicas': 2, 'timeout': 90})
                    self.assertEqual(report['restoration']['appContainerIds'], ['test-app-0', 'test-app-1'])
                for item in mutations:
                    command = item['argv']
                    self.assertEqual(command[command.index('--project-name') + 1], PROJECT)
                    self.assertEqual(command[command.index('--file') + 1], str(ROOT / 'compose.yaml'))
                    self.assertEqual(command[command.index('--project-directory') + 1], str(ROOT))
                    self.assertEqual(command[command.index('--env-file') + 1], str(ROOT / '.env'))
                    for forbidden in ('down', 'prune', 'sudo', 'week5'):
                        self.assertNotIn(forbidden, command)

    def test_failed_week5_baseline_prevents_build_or_up(self):
        module = runner_module()
        config = compose_config()
        commands = []
        def command_fixture(command, **_kwargs):
            commands.append(command)
            return json.dumps(config) if 'config' in command else json.dumps('unix:///var/run/docker.sock')
        report = {'mutationsPerformed': False}
        with mock.patch.object(module, 'run', side_effect=command_fixture), mock.patch.object(module, 'all_containers', return_value=[]), mock.patch.object(module, 'week5_identity', side_effect=ValueError('test-fixture unavailable baseline')), mock.patch.dict(module.os.environ, {'DOCKER_HOST': ''}):
            with self.assertRaises(ValueError):
                module.execute_acceptance(report)
        self.assertFalse(report['mutationsPerformed'])
        self.assertFalse(any('build' in command or 'up' in command for command in commands))

    def test_actual_network_has_only_owned_members_and_matching_ids(self):
        module = runner_module()
        self.assertTrue(hasattr(module, 'validate_network'), 'Actual network membership validation is missing')
        owned = [{'id': 'test-owned-a', 'project': PROJECT, 'networks': {PROJECT + '_pulse': 'test-network'}}]
        network = {'id': 'test-network', 'name': PROJECT + '_pulse', 'driver': 'bridge', 'project': PROJECT, 'members': {'test-owned-a': 'test-app'}}
        module.validate_network(network, owned)
        foreign = copy.deepcopy(network)
        foreign['members']['test-protected'] = 'test-week5'
        with self.assertRaises(ValueError):
            module.validate_network(foreign, owned)
        mismatch = copy.deepcopy(network)
        mismatch['id'] = 'different-network'
        with self.assertRaises(ValueError):
            module.validate_network(mismatch, owned)

    def test_evidence_can_never_be_written_into_the_public_dist_tree(self):
        module = runner_module()
        with self.assertRaises(ValueError):
            module.validate_output_path(ROOT / 'dist/report.json')
        with self.assertRaises(ValueError):
            module.validate_output_path(ROOT / 'dist/assets/report.json')
        with self.assertRaises(ValueError):
            module.validate_output_path(ROOT / 'server/server.mjs')
        self.assertEqual(module.validate_output_path(ROOT / 'container-verification.json'), ROOT / 'container-verification.json')


if __name__ == '__main__':
    unittest.main(verbosity=2)
