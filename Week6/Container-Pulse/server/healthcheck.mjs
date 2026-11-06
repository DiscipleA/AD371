import http from 'node:http';

const configured = process.env.PORT ?? '3000';
if (!/^\d{1,5}$/.test(configured) || Number(configured) > 65535) {
  process.exitCode = 1;
} else {
  const request = http.get({ hostname: '127.0.0.1', port: Number(configured), path: '/healthz', timeout: 2000, agent: false }, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => {
      body += chunk;
      if (body.length > 1024) request.destroy();
    });
    response.on('error', () => { process.exitCode = 1; });
    response.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        process.exitCode = response.statusCode === 200 && Object.keys(parsed).length === 2 && parsed.status === 'ok' && parsed.service === 'container-pulse' ? 0 : 1;
      } catch {
        process.exitCode = 1;
      }
    });
  });
  request.on('timeout', () => { request.destroy(); });
  request.on('error', () => { process.exitCode = 1; });
}
