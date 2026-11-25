import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { writeFileSync } from 'node:fs';

// nginx accepts a single IP or CIDR, never arbitrary configuration text.
const proxy = process.env.HOMORA_TRUSTED_PROXY || '127.0.0.1';
const [address, prefix, ...extra] = proxy.split('/');
const family = isIP(address);
if (
  !family ||
  extra.length > 0 ||
  (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))
) {
  console.error('HOMORA_TRUSTED_PROXY must be an IP address or CIDR.');
  process.exit(1);
}
const config = `
pid /tmp/homora-nginx.pid;
error_log /dev/stderr warn;
worker_processes 1;
events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log off;
  client_body_temp_path /tmp/homora-client-body;
  proxy_temp_path /tmp/homora-proxy;
  fastcgi_temp_path /tmp/homora-fastcgi;
  uwsgi_temp_path /tmp/homora-uwsgi;
  scgi_temp_path /tmp/homora-scgi;
  set_real_ip_from ${proxy};
  real_ip_header X-Forwarded-For;
  real_ip_recursive on;
  server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location = /api/appearance/background {
      client_max_body_size 3m;
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $remote_addr;
    }
    location ~ ^/(api/|mcp$|docker-push/inventory$) {
      client_max_body_size 1m;
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { try_files $uri $uri/ /index.html; }
  }
}`;
writeFileSync('/tmp/homora-nginx.conf', config, { mode: 0o600 });
const env = {
  ...process.env,
  HOMORA_BIND_HOST: '127.0.0.1',
  HOMORA_API_PORT: '3000',
  HOMORA_WEB_PORT: '8080',
  HOMORA_TRUST_PROXY: 'true',
};
const children = [
  spawn(process.execPath, ['apps/backend/dist/server.js'], { env, stdio: 'inherit' }),
  spawn('nginx', ['-c', '/tmp/homora-nginx.conf', '-g', 'daemon off;'], { env, stdio: 'inherit' }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  }, 10000);
  timer.unref();
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`Homora process exited (${signal || code})`);
      stop(code || 1);
    }
  });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop(0));
