import { rawRequest, table, timeAsync } from './lib.js';
import { add, results, type Fixture } from './runtime.js';

/* ---------------------------------------------------------------- suite: abuse */

export async function suiteAbuse(fixture: Fixture) {
  const { server, session } = fixture;
  const rows: Record<string, unknown>[] = [];
  const authed = { cookie: session.cookie, origin: session.origin };
  const check = async (name: string, run: () => Promise<{ status: number; body: string }>) => {
    const t = await timeAsync(() => run().catch((e: Error) => ({ status: 0, body: e.message })));
    rows.push({
      caso: name,
      status: t.value.status,
      ms: t.ms,
      corpo: t.value.body.slice(0, 60).replaceAll('\n', ' '),
    });
  };
  await check('corpo 5 MB em POST /api/services', () =>
    rawRequest(server.apiPort, 'POST', '/api/services', {
      headers: authed,
      body: JSON.stringify({ name: 'x'.repeat(5_000_000) }),
    }),
  );
  await check('JSON malformado', () =>
    rawRequest(server.apiPort, 'POST', '/api/services', { headers: authed, body: '{"name": ' }),
  );
  await check('JSON profundamente aninhado (200k níveis)', () =>
    rawRequest(server.apiPort, 'POST', '/api/services', {
      headers: authed,
      body: '['.repeat(200_000),
    }),
  );
  await check('URL de 100 KB', () =>
    rawRequest(server.apiPort, 'GET', `/api/services/${'9'.repeat(100_000)}/status-detail`, {
      headers: { cookie: session.cookie },
    }),
  );
  await check('origem inválida em escrita', () =>
    rawRequest(server.apiPort, 'POST', '/api/services', {
      headers: { cookie: session.cookie, origin: 'http://evil.example' },
      body: '{}',
    }),
  );
  await check('cookie inválido', () =>
    rawRequest(server.apiPort, 'GET', '/api/services', {
      headers: { cookie: 'homora.session_token=' + 'a'.repeat(4000) },
    }),
  );
  await check('range de uptime inválido', () =>
    rawRequest(server.apiPort, 'GET', '/api/services/uptime?range=999d', {
      headers: { cookie: session.cookie },
    }),
  );
  await check('id absurdo', () =>
    rawRequest(server.apiPort, 'GET', '/api/services/99999999999999999999/status-detail', {
      headers: { cookie: session.cookie },
    }),
  );
  await check('import preview com 1 MB de lixo', () =>
    rawRequest(server.apiPort, 'POST', '/api/config/import/preview', {
      headers: { ...authed },
      body: JSON.stringify({ content: 'a: ['.repeat(160_000), source: 'homora' }),
    }).then((r) => r),
  );
  await check('YAML bomb (aliases aninhados)', () => {
    const levels = Array.from(
      { length: 12 },
      (_, i) =>
        `l${i}: &l${i} [${i === 0 ? '"x"' : `*l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}`}]`,
    ).join('\n');
    return rawRequest(server.apiPort, 'POST', '/api/config/import/preview', {
      headers: authed,
      body: JSON.stringify({ content: levels, source: 'homora' }),
    });
  });
  const alive = await rawRequest(server.apiPort, 'GET', '/api/auth/status').catch(() => null);
  add({
    suite: 'abuse',
    title: 'Entradas hostis e malformadas',
    data: table(rows),
    notes: [
      `servidor continuou respondendo após todos os casos: ${alive?.status === 200 ? 'sim' : 'NÃO'}`,
      'esperado: 4xx limpos, sem 5xx, sem travar por segundos.',
    ],
  });
  results.at(-1)!.data = rows;
}
