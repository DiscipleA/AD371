#!/usr/bin/env python3
"""Bounded, opt-in Docker acceptance for this project only. No third-party modules.

Run: python3 scripts/verify-containers.py --allow-mutations [--output /path/report.json]
The flag permits building/up/scaling ONLY this project. No down, prune, daemon
operations, privilege escalation, or commands targeting another project's IDs.
An existing successful Week5 response on localhost:80 is a required baseline.
"""
import argparse
import hashlib
import http.client
import json
import math
import os
import pathlib
import re
import signal
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROJECT = 'ad371-week6-container-pulse'
APP_IMAGE = PROJECT + '-app:local'
GATEWAY_IMAGE = 'nginx:stable-alpine@sha256:e9b2d7624fd7957f4ed44ae0a272d93fb73aeb8512ba8916f8118ae6143fd115'
HOST_PORT = 8796
NETWORK_NAME = PROJECT + '_pulse'

PROTECTED_INSPECT_FORMAT = '''{"id":{{json .Id}},"status":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"restarts":{{json .RestartCount}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"networks":{"__sentinel":""{{range $name, $network := .NetworkSettings.Networks}},{{json $name}}:{{json $network.NetworkID}}{{end}}}}'''

# Explicit fields only: never inspect .Config.Env, full Config, or full inspect JSON.
INSPECT_FORMAT = '''{"id":{{json .Id}},"status":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"restarts":{{json .RestartCount}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"hostname":{{json .Config.Hostname}},"user":{{json .Config.User}},"imageId":{{json .Image}},"imageManifest":{{json (index . "ImageManifestDescriptor")}},"imageName":{{json .Config.Image}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"networks":{"__sentinel":""{{range $name, $network := .NetworkSettings.Networks}},{{json $name}}:{{json $network.NetworkID}}{{end}}},"readOnly":{{json .HostConfig.ReadonlyRootfs}},"capDrop":{{json .HostConfig.CapDrop}},"securityOpt":{{json .HostConfig.SecurityOpt}},"init":{{json .HostConfig.Init}},"restartPolicy":{{json .HostConfig.RestartPolicy.Name}},"memory":{{json .HostConfig.Memory}},"nanoCpus":{{json .HostConfig.NanoCpus}},"pidsLimit":{{json .HostConfig.PidsLimit}},"mounts":{{json .Mounts}},"tmpfs":{{json (index .HostConfig "Tmpfs")}},"portBindings":{{json (index .HostConfig "PortBindings")}},"healthcheck":{{json .Config.Healthcheck}}}'''


def require(condition, message):
    if not condition:
        raise ValueError(message)


def compose_command(args):
    args = list(args)
    allowed = False
    if args == ['build', 'app'] or args == ['config', '--format', 'json']:
        allowed = True
    elif args and args[0] == 'up':
        tokens = {'-d', '--no-build', '--scale', 'app=2', 'app=3', '--wait', '--wait-timeout', '90', 'app', 'gateway'}
        allowed = all(token in tokens for token in args[1:]) and '--scale' in args and any(token in args for token in ('app=2', 'app=3'))
    require(allowed, 'Refused an out-of-scope Compose command')
    return ['docker', 'compose', '--project-name', PROJECT, '--file', str(ROOT / 'compose.yaml'), '--project-directory', str(ROOT), '--env-file', str(ROOT / '.env'), *args]


def run(command, timeout=120):
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise ValueError('A bounded Docker operation timed out') from error
    except OSError as error:
        raise ValueError('The required local Docker executable is unavailable') from error
    if result.returncode:
        # Do not copy arbitrary CLI logs (which could contain configuration) into evidence.
        if 'permission denied' in result.stderr.lower() or 'permission denied' in result.stdout.lower():
            raise ValueError('Docker access denied; obtain normal OS authorization outside this runner')
        raise ValueError(f'Docker operation failed with exit status {result.returncode}')
    return result.stdout


def validate_compose(config):
    require(config.get('name') == PROJECT, 'Wrong Compose project')
    services = config.get('services', {})
    require(set(services) == {'app', 'gateway'}, 'Unexpected Compose services')
    build = services['app'].get('build', {})
    require(build.get('context') == str(ROOT) and build.get('target') == 'runtime' and not build.get('dockerfile_inline') and not build.get('additional_contexts') and build.get('dockerfile', 'Dockerfile') == 'Dockerfile', 'Build context must be this exact project and runtime stage')
    require(services['gateway'].get('entrypoint') == ['nginx'] and services['gateway'].get('command') == ['-g', 'daemon off;'], 'Unexpected gateway executable or command')
    require(not services['app'].get('entrypoint') and not services['app'].get('command'), 'App must use the reviewed image entrypoint')
    require(not config.get('volumes'), 'Persistent or shared volumes are not allowed')
    networks = config.get('networks', {})
    require(set(networks) == {'pulse'}, 'Exactly one project network is required')
    network = networks['pulse']
    require(network.get('name') == NETWORK_NAME and network.get('driver') == 'bridge', 'Wrong project bridge')
    require(not network.get('external') and not network.get('ipam'), 'Shared networks and static subnets are forbidden')
    require(not services['app'].get('ports') and not services['app'].get('volumes'), 'App must have no host ports or mounts')
    ports = services['gateway'].get('ports', [])
    require(len(ports) == 1 and ports[0].get('host_ip') == '127.0.0.1' and str(ports[0].get('published')) == str(HOST_PORT) and ports[0].get('target') == 8080 and ports[0].get('protocol', 'tcp') == 'tcp', 'Only localhost:8796 may be published')
    require(services['app'].get('image') == APP_IMAGE and services['gateway'].get('image') == GATEWAY_IMAGE, 'Unexpected application or gateway image')
    require(set(services['app'].get('environment', {})) <= {'APP_VERSION', 'HOST_PORT', 'REPLICAS', 'NODE_ENV', 'PORT'}, 'Unexpected app environment keys')
    mounts = services['gateway'].get('volumes', [])
    require(len(mounts) == 1 and mounts[0].get('type') == 'bind' and mounts[0].get('source') == str(ROOT / 'infra/nginx.conf') and mounts[0].get('target') == '/etc/nginx/nginx.conf' and mounts[0].get('read_only') is True, 'Gateway mount must be the scoped read-only configuration')
    for name, cpu, memory, user in [('app', .5, 128 * 1024 * 1024, 'node'), ('gateway', .25, 64 * 1024 * 1024, 'nginx')]:
        service = services[name]
        require(set(service.get('networks', {})) == {'pulse'} and not service.get('network_mode') and not service.get('container_name'), 'Service networking is not project scoped')
        require(service.get('user') == user and service.get('read_only') is True and service.get('init') is True, 'Non-root, read-only and init settings are required')
        require(service.get('restart') == 'unless-stopped' and 'ALL' in service.get('cap_drop', []) and 'no-new-privileges:true' in service.get('security_opt', []) and not service.get('privileged'), 'Missing runtime hardening')
        limits = service.get('deploy', {}).get('resources', {}).get('limits', {})
        require(float(limits.get('cpus', 0)) == cpu and int(limits.get('memory', 0)) == memory, 'Unexpected resource budgets')
        require(bool(service.get('healthcheck', {}).get('test')) and 0 < service.get('pids_limit', 0) <= 128, 'Healthcheck and PID limits are required')


def validate_runtime(body):
    keys = {'service', 'hostname', 'processUptimeSeconds', 'nodeVersion', 'appVersion'}
    require(isinstance(body, dict) and set(body) == keys, 'Runtime response has an unexpected schema')
    require(body['service'] == 'container-pulse', 'Wrong runtime service')
    require(isinstance(body['hostname'], str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,252}', body['hostname']) is not None, 'Invalid runtime hostname')
    uptime = body['processUptimeSeconds']
    require(type(uptime) in (int, float) and math.isfinite(uptime) and uptime >= 0, 'Invalid process uptime')
    require(isinstance(body['nodeVersion'], str) and re.fullmatch(r'v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', body['nodeVersion']) is not None, 'Invalid Node version')
    require(isinstance(body['appVersion'], str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+-]{0,63}', body['appVersion']) is not None, 'Invalid app version')


def inspect_containers(ids, *, owned_details=False):
    if not ids:
        return []
    require(all(re.fullmatch(r'[a-f0-9]{64}', value) for value in ids), 'Refused malformed container IDs')
    template = INSPECT_FORMAT if owned_details else PROTECTED_INSPECT_FORMAT
    output = run(['docker', 'inspect', '--format', template, *ids])
    records = [json.loads(line) for line in output.splitlines() if line.strip()]
    for record in records:
        record['networks'].pop('__sentinel', None)
    require({record['id'] for record in records} == set(ids), 'Incomplete container inspection')
    return records


def all_containers():
    return inspect_containers(run(['docker', 'ps', '-aq', '--no-trunc']).split())


def project_containers():
    ids = run(['docker', 'ps', '-aq', '--no-trunc', '--filter', f'label=com.docker.compose.project={PROJECT}']).split()
    records = inspect_containers(ids, owned_details=True)
    require(all(record['project'] == PROJECT for record in records), 'Container ownership mismatch')
    return records


def protected_snapshot(records):
    keys = ('status', 'startedAt', 'restarts', 'networks')
    return {record['id']: {key: record[key] for key in keys} for record in records if record.get('project') != PROJECT}


def assert_protected_unchanged(before, after):
    require(before == after, 'A protected container identity, status, start time, restart count, or network changed')


def fetch_http(port, target='/', method='GET'):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        connection.request(method, target, headers={'Connection': 'close'})
        response = connection.getresponse()
        body = response.read(1024 * 1024 + 1)
        require(len(body) <= 1024 * 1024, 'HTTP response exceeded the evidence size limit')
        return {'status': response.status, 'headers': {name.lower(): value for name, value in response.getheaders()}, 'body': body}
    finally:
        connection.close()


def week5_identity():
    response = fetch_http(80)
    require(response['status'] == 200, 'Existing Week5 localhost:80 must return HTTP 200 before acceptance')
    return {'status': response['status'], 'contentType': response['headers'].get('content-type'), 'bodySha256': hashlib.sha256(response['body']).hexdigest(), 'bodyBytes': len(response['body'])}


def validate_container(record):
    require(record['project'] == PROJECT and record['service'] in ('app', 'gateway'), 'Unexpected owned container')
    app = record['service'] == 'app'
    require(record['status'] == 'running' and record['health'] == 'healthy', 'Owned container is not healthy')
    require(record['user'] == ('node' if app else 'nginx'), 'Container must use its unprivileged named user')
    require(record['readOnly'] is True and record['init'] is True and record['restartPolicy'] == 'unless-stopped', 'Runtime policy differs from Compose')
    require('ALL' in (record['capDrop'] or []) and any(value in ('no-new-privileges', 'no-new-privileges:true') for value in (record['securityOpt'] or [])), 'Runtime capability hardening is missing')
    require(record['memory'] == (128 if app else 64) * 1024 * 1024 and record['nanoCpus'] == (500000000 if app else 250000000), 'Runtime CPU or memory limit mismatch')
    require(isinstance(record['pidsLimit'], int) and 0 < record['pidsLimit'] <= (128 if app else 64), 'Runtime PID limit mismatch')
    require(set(record['networks']) == {NETWORK_NAME}, 'A container is attached to an unexpected network')
    require(bool(record['healthcheck'].get('Test')), 'Runtime healthcheck is missing')
    if app:
        require(not record['mounts'] and not record['portBindings'], 'App acquired a mount or published port')
    else:
        binds = [mount for mount in record['mounts'] if mount['Type'] == 'bind']
        others = [mount for mount in record['mounts'] if mount['Type'] not in ('bind', 'tmpfs')]
        require(not others and len(binds) == 1 and binds[0]['Source'] == str(ROOT / 'infra/nginx.conf') and binds[0]['Destination'] == '/etc/nginx/nginx.conf' and binds[0]['RW'] is False, 'Runtime gateway mounts are not scoped read-only')
        require(record['tmpfs'] and set(record['tmpfs']) == {'/tmp'}, 'Gateway must use only its /tmp tmpfs')
        require(record['portBindings'] == {'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(HOST_PORT)}]}, 'Runtime gateway published unexpected host ports')


def wait_ready(replicas, timeout=90):
    deadline = time.monotonic() + timeout
    last_error = 'No healthy owned containers observed'
    while time.monotonic() < deadline:
        records = project_containers()
        try:
            require(sum(record['service'] == 'app' for record in records) == replicas and sum(record['service'] == 'gateway' for record in records) == 1 and len(records) == replicas + 1, 'Replica count has not converged')
            for record in records:
                validate_container(record)
            return records
        except ValueError as error:
            last_error = str(error)
        time.sleep(1)
    raise ValueError('Readiness deadline exceeded: ' + last_error)


def sample_hostnames(expected, timeout=30):
    # Wait out the gateway's two-second DNS TTL, then require a stable response window.
    time.sleep(3)
    deadline = time.monotonic() + timeout
    seen, successful = set(), 0
    while time.monotonic() < deadline:
        try:
            response = fetch_http(HOST_PORT, '/api/runtime')
            require(response['status'] == 200, 'Gateway runtime endpoint is not ready')
            body = json.loads(response['body'])
            validate_runtime(body)
            require(body['hostname'] in expected, 'Gateway reached a stale or unexpected replica')
            seen.add(body['hostname'])
            successful += 1
            if seen == expected and successful >= 24:
                return {'expectedHostnames': sorted(expected), 'observedHostnames': sorted(seen), 'successfulRequestsInStableWindow': successful, 'sample': body}
        except (ValueError, OSError, http.client.HTTPException):
            seen, successful = set(), 0
        time.sleep(.1)
    raise ValueError('Gateway did not converge to every expected live replica within the deadline')


def verify_http_contract():
    results = []
    for target, method, expected in [('/', 'GET', 200), ('/', 'HEAD', 200), ('/healthz', 'GET', 200), ('/api/runtime', 'HEAD', 200), ('/api/unknown', 'GET', 404), ('/api/runtime?debug=1', 'GET', 400), ('/api/runtime', 'POST', 405), ('/.env', 'GET', 404), ('/package.json', 'GET', 404)]:
        response = fetch_http(HOST_PORT, target, method)
        require(response['status'] == expected, 'Gateway HTTP contract check failed')
        require(response['headers'].get('cache-control') == 'no-store' and response['headers'].get('x-content-type-options') == 'nosniff', 'Gateway security headers are missing')
        csp = response['headers'].get('content-security-policy', '')
        require("connect-src 'self'" in csp and 'unsafe-eval' not in csp, 'Gateway CSP is not same-origin')
        if method == 'HEAD':
            require(not response['body'], 'HEAD unexpectedly returned a body')
        if target == '/healthz':
            require(json.loads(response['body']) == {'status': 'ok', 'service': 'container-pulse'}, 'Health response has an unexpected schema')
        if target == '/' and method == 'GET':
            require(b'<!doctype html' in response['body'].lower(), 'Landing page is not the real built HTML')
        results.append({'path': target, 'method': method, 'status': response['status']})
    return results


def verify_runtime_image(records):
    apps = [record for record in records if record['service'] == 'app']
    platform = run(['docker', 'version', '--format', '{{.Server.Os}}/{{.Server.Arch}}']).strip()
    require(re.fullmatch(r'[a-z0-9]+/[a-z0-9]+(?:/v[0-9]+)?', platform) is not None, 'Invalid local Docker platform')
    image_format = '{"id":{{json .Id}},"user":{{json .Config.User}},"sizeBytes":{{json .Size}}}'
    image = json.loads(run(['docker', 'image', 'inspect', '--platform', platform, APP_IMAGE, '--format', image_format]))
    # Current Docker distinguishes index, platform-manifest and config digests.
    # Compare the running manifest with the selected platform, not unlike IDs.
    matches = all(record['imageManifest'].get('digest') == image['id'] if record.get('imageManifest')
                  else record['imageId'] == image['id'] for record in apps)
    require(image['user'] == 'node' and matches and len({record['imageId'] for record in apps}) == 1, 'Unexpected runtime image or root image user')
    image['platform'] = platform
    probes = []
    for record in apps:
        # These IDs came from the exact project label filter and were ownership-validated.
        script = "const fs=require('node:fs'); console.log(JSON.stringify({uid:process.getuid(),hostname:require('node:os').hostname(),hasBuildDependencies:fs.existsSync('/app/node_modules'),hasBuildScript:fs.existsSync('/app/scripts/build.mjs'),hasSource:fs.existsSync('/app/src'),hasPackageCache:fs.existsSync('/app/.npm'),hasDist:fs.existsSync('/app/dist/index.html'),hasServer:fs.existsSync('/app/server/server.mjs')}))"
        probe = json.loads(run(['docker', 'exec', record['id'], 'node', '-e', script]))
        require(probe['uid'] != 0 and probe['hostname'] == record['hostname'] and probe['hasDist'] and probe['hasServer'], 'Runtime image content or actual execution user mismatch')
        require(not any(probe[key] for key in ('hasBuildDependencies', 'hasBuildScript', 'hasSource', 'hasPackageCache')), 'Build-only artifacts leaked into runtime image')
        probes.append(probe)
    gateway = next(record for record in records if record['service'] == 'gateway')
    gateway_uid = run(['docker', 'exec', gateway['id'], 'id', '-u']).strip()
    require(gateway_uid.isdigit() and int(gateway_uid) != 0, 'Gateway is actually running as root')
    return {'image': image, 'appExecutionProbes': probes, 'gatewayUid': int(gateway_uid), 'restartPolicy': 'unless-stopped', 'restartDisruptionTestPerformed': False}


def validate_network(network, records):
    require(network['name'] == NETWORK_NAME and network['driver'] == 'bridge' and network['project'] == PROJECT, 'Actual bridge is not owned exclusively by this project')
    require(set(network['members']) == {record['id'] for record in records}, 'Bridge contains an unexpected container or is missing an owned member')
    require(all(record['project'] == PROJECT and record['networks'] == {NETWORK_NAME: network['id']} for record in records), 'Container network IDs differ from the owned bridge')


def verify_network(records):
    template = '{"id":{{json .Id}},"name":{{json .Name}},"driver":{{json .Driver}},"project":{{json (index .Labels "com.docker.compose.project")}},"members":{"__sentinel":""{{range $id, $container := .Containers}},{{json $id}}:{{json $container.Name}}{{end}}}}'
    network = json.loads(run(['docker', 'network', 'inspect', NETWORK_NAME, '--format', template]))
    network['members'].pop('__sentinel', None)
    validate_network(network, records)
    return network


def validate_output_path(value):
    output = pathlib.Path(value).resolve()
    require(output.suffix == '.json', 'Evidence output must be a JSON file')
    require(not output.exists(), 'Evidence output cannot overwrite an existing file')
    require(not output.is_relative_to((ROOT / 'dist').resolve()), 'Evidence cannot be stored in the public dist tree')
    return output


def execute_acceptance(report):
    # Catch termination only for this acceptance call; never leak handler changes.
    signals = (signal.SIGTERM, signal.SIGINT)
    previous_handlers = {signum: signal.getsignal(signum) for signum in signals}

    def interrupt_acceptance(signum, frame):
        # Shield the transition into finally as well as cleanup from repeated signals.
        for caught_signal in signals:
            signal.signal(caught_signal, signal.SIG_IGN)
        raise KeyboardInterrupt

    try:
        for signum in signals:
            signal.signal(signum, interrupt_acceptance)
        _execute_acceptance(report)
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)


def _execute_acceptance(report):
    config = json.loads(run(compose_command(['config', '--format', 'json'])))
    validate_compose(config)
    docker_host = os.environ.get('DOCKER_HOST', '')
    require(not docker_host or docker_host.startswith('unix://'), 'Only a local Unix Docker endpoint is allowed')
    endpoint = json.loads(run(['docker', 'context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']))
    require(isinstance(endpoint, str) and endpoint.startswith('unix://'), 'The selected Docker context is not local')
    baseline = protected_snapshot(all_containers())
    before_http = week5_identity()
    require(bool(baseline), 'No protected Week5 containers were available for the safety baseline')
    report['protectedBefore'] = baseline
    report['week5Before'] = before_http
    runtime_mutated = False
    failure = None
    try:
        report['mutationsPerformed'] = True
        run(compose_command(['build', 'app']), timeout=600)
        runtime_mutated = True
        run(compose_command(['up', '-d', '--no-build', '--scale', 'app=2', '--wait', '--wait-timeout', '90']), timeout=120)
        report['stages'] = []
        for replicas in (2, 3, 2):
            if report['stages']:
                run(compose_command(['up', '-d', '--no-build', '--scale', f'app={replicas}', '--wait', '--wait-timeout', '90', 'app']), timeout=120)
            records = wait_ready(replicas)
            expected = {record['hostname'] for record in records if record['service'] == 'app'}
            require(len(expected) == replicas, 'Replicas do not have unique Docker hostnames')
            observations = sample_hostnames(expected)
            report['stages'].append({'replicas': replicas, 'containers': records, 'gatewayObservations': observations})
            assert_protected_unchanged(baseline, protected_snapshot(all_containers()))
            require(before_http == week5_identity(), 'Protected Week5 HTTP identity changed')
        report['httpChecks'] = verify_http_contract()
        report['runtimeImage'] = verify_runtime_image(records)
        report['network'] = verify_network(records)
    except KeyboardInterrupt:
        failure = 'Acceptance interrupted; owned replicas were scheduled for restoration'
    except (ValueError, OSError, http.client.HTTPException) as error:
        failure = str(error)
    finally:
        # Keep the existing bounded restore and protected checks uninterruptible by
        # catchable termination, including when cleanup follows an ordinary error.
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, signal.SIG_IGN)
        if runtime_mutated:
            try:
                # Never "down": leave exactly two healthy owned replicas even after a failed stage.
                run(compose_command(['up', '-d', '--no-build', '--scale', 'app=2', '--wait', '--wait-timeout', '90']), timeout=120)
                final_records = wait_ready(2)
                report['restoration'] = {'status': 'two-healthy-replicas', 'appContainerIds': sorted(record['id'] for record in final_records if record['service'] == 'app')}
            except (ValueError, OSError, http.client.HTTPException) as error:
                report['restoration'] = {'status': 'failed', 'error': str(error)}
                failure = failure or 'Could not restore two healthy owned replicas'
        try:
            report['protectedAfter'] = protected_snapshot(all_containers())
            report['week5After'] = week5_identity()
            assert_protected_unchanged(baseline, report['protectedAfter'])
            require(before_http == report['week5After'], 'Protected Week5 HTTP identity changed')
            report['protectedUnchanged'] = True
        except (ValueError, OSError, http.client.HTTPException) as error:
            report['protectedUnchanged'] = False
            failure = failure or str(error)
    if failure:
        raise ValueError(failure)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-mutations', action='store_true', help='explicitly allow this project only to build/up/scale 2 -> 3 -> 2')
    parser.add_argument('--output', type=pathlib.Path, help='optional JSON evidence path outside public dist')
    args = parser.parse_args(argv)
    report = {'project': PROJECT, 'status': 'refused', 'mutationsPerformed': False}
    if not args.allow_mutations:
        report['error'] = 'Explicit --allow-mutations is required; no Docker commands were run'
        print(json.dumps(report, indent=2, allow_nan=False))
        return 2
    output = None
    try:
        if args.output:
            output = validate_output_path(args.output)
            require(output.parent.is_dir(), 'Evidence output parent directory must already exist')
        execute_acceptance(report)
        report['status'] = 'passed'
    except KeyboardInterrupt:
        report['status'] = 'failed'
        report['error'] = 'Acceptance interrupted'
    except (ValueError, OSError, http.client.HTTPException) as error:
        report['status'] = 'failed'
        report['error'] = str(error)
    rendered = json.dumps(report, indent=2, sort_keys=True, allow_nan=False)
    if output:
        try:
            with output.open('x', encoding='utf-8') as handle:
                handle.write(rendered + '\n')
        except OSError:
            report['status'] = 'failed'
            report['error'] = 'Could not write the requested evidence file'
            rendered = json.dumps(report, indent=2, sort_keys=True, allow_nan=False)
    print(rendered)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
