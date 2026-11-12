import test from 'node:test';
import assert from 'node:assert/strict';
import { selectInventory, publish } from '../docker-push-agent.mjs';

test('sends only discovery labels, strips environment and unrelated labels', () => {
  const result = selectInventory([
    {
      Id: 'a'.repeat(64),
      Names: ['/one', '/other'],
      Labels: { 'homora.url': 'https://example.test', 'private-token': 'secret' },
      Env: ['secret'],
    },
  ]);
  assert.deepEqual(result, {
    containers: [
      { Id: 'a'.repeat(64), Names: ['/one'], Labels: { 'homora.url': 'https://example.test' } },
    ],
  });
  assert.throws(() => selectInventory(Array(1001).fill({})));
  assert.throws(() => selectInventory([{ Id: 'bad', Names: [] }]));
});
test('requires an HTTPS origin and a valid token before connecting', async () => {
  await assert.rejects(publish('http://example.test', 'a'.repeat(64), { containers: [] }));
  await assert.rejects(publish('https://example.test/path', 'a'.repeat(64), { containers: [] }));
  await assert.rejects(publish('https://example.test', 'bad', { containers: [] }));
});

test('reads a Docker Unix socket and sends only selected data to verified HTTPS', async (t) => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { createServer: createHttp } = await import('node:http');
  const { createServer: createHttps } = await import('node:https');
  const { collect } = await import('../docker-push-agent.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'homora-agent-test-'));
  try {
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          join(dir, 'key'),
          ' -out'.trim(),
          join(dir, 'cert'),
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-addext',
          'subjectAltName=IP:127.0.0.1',
        ],
        { stdio: 'ignore' },
      );
    } catch {
      t.skip('openssl unavailable');
      return;
    }
    const docker = createHttp((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify([
          {
            Id: 'a'.repeat(64),
            Names: ['/app'],
            Labels: { 'homora.url': 'https://example.test', private: 'secret' },
          },
        ]),
      );
    });
    await new Promise((resolve) => docker.listen(join(dir, 'docker.sock'), resolve));
    let received;
    const tls = createHttps(
      { key: readFileSync(join(dir, 'key')), cert: readFileSync(join(dir, 'cert')) },
      async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        received = { auth: req.headers.authorization, body: JSON.parse(raw) };
        res.writeHead(204);
        res.end();
      },
    );
    await new Promise((resolve) => tls.listen(0, '127.0.0.1', resolve));
    try {
      const inventory = await collect(join(dir, 'docker.sock'));
      const origin = `https://127.0.0.1:${tls.address().port}`;
      await assert.rejects(publish(origin, 'a'.repeat(64), inventory));
      await publish(origin, 'a'.repeat(64), inventory, readFileSync(join(dir, 'cert')));
      assert.equal(received.auth, `Bearer ${'a'.repeat(64)}`);
      assert.equal(JSON.stringify(received.body).includes('secret'), false);
      assert.equal(received.body.containers.length, 1);
    } finally {
      await Promise.all([
        new Promise((resolve) => docker.close(resolve)),
        new Promise((resolve) => tls.close(resolve)),
      ]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
