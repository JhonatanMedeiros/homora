// Optional validation: requires OpenSSL and permission to bind local sockets.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';

if (process.argv[2] === 'client') {
  const { getAuthorizedJson } = await import('../apps/backend/dist/network-request.js');
  const url = process.argv[3];
  const result = await getAuthorizedJson(url, {
    origins: [new URL(url).origin],
    allowPrivate: true,
  });
  if (JSON.stringify(result) !== '{"ok":true}') throw new Error('Incorrect response');
  process.exit(0);
}

const ip = Object.values(networkInterfaces())
  .flat()
  .find((item) => item && item.family === 'IPv4' && !item.internal)?.address;
if (!ip) throw new Error('A private, non-loopback IPv4 address is required for this test.');
const dir = mkdtempSync(join(tmpdir(), 'homora-tls-test-'));
let server;
try {
  const caKey = join(dir, 'ca.key'),
    ca = join(dir, 'ca.pem'),
    key = join(dir, 'server.key'),
    csr = join(dir, 'server.csr'),
    cert = join(dir, 'server.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      caKey,
      '-out',
      ca,
      '-days',
      '1',
      '-subj',
      '/CN=Homora Test CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      csr,
      '-subj',
      '/CN=Homora Test Server',
      '-addext',
      `subjectAltName=IP:${ip}`,
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'x509',
      '-req',
      '-in',
      csr,
      '-CA',
      ca,
      '-CAkey',
      caKey,
      '-CAcreateserial',
      '-out',
      cert,
      '-days',
      '1',
      '-copy_extensions',
      'copy',
    ],
    { stdio: 'ignore' },
  );
  server = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, ip, resolve);
  });
  const url = `https://${ip}:${server.address().port}/`;
  const run = (trust) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [import.meta.filename, 'client', url], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: trust ? ca : '' },
        stdio: 'ignore',
      });
      child.on('error', reject);
      child.on('exit', resolve);
    });
  if ((await run(false)) === 0) throw new Error('Untrusted certificate was accepted.');
  if ((await run(true)) !== 0) throw new Error('Trusted certificate was rejected.');
  console.log('TLS: Untrusted CA rejected; temporary trusted CA accepted.');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
