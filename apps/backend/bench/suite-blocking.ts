import { rawRequest, sleep, startProbe, table, timeAsync } from './lib.js';
import { add, results, type Fixture } from './runtime.js';

/* ---------------------------------------------------------------- suite: blocking */

export async function suiteBlocking(fixture: Fixture) {
  const { server, session } = fixture;
  const rows: Record<string, unknown>[] = [];
  const scenarios: { name: string; run: () => Promise<unknown> }[] = [
    {
      name: 'GET export json',
      run: () =>
        rawRequest(server.apiPort, 'GET', '/api/config/export?format=json', {
          headers: { cookie: session.cookie },
        }),
    },
    {
      name: 'GET export yaml',
      run: () =>
        rawRequest(server.apiPort, 'GET', '/api/config/export?format=yaml', {
          headers: { cookie: session.cookie },
        }),
    },
    {
      name: 'GET /api/services',
      run: () =>
        rawRequest(server.apiPort, 'GET', '/api/services', { headers: { cookie: session.cookie } }),
    },
    {
      name: 'GET uptime 30d (todos)',
      run: () =>
        rawRequest(server.apiPort, 'GET', '/api/services/uptime?range=30d', {
          headers: { cookie: session.cookie },
        }),
    },
    {
      name: 'POST serviço (dispara reverificação total)',
      run: () =>
        rawRequest(server.apiPort, 'POST', '/api/services', {
          headers: { cookie: session.cookie, origin: session.origin },
          body: JSON.stringify({
            name: 'Blocker',
            url: 'http://127.0.0.1:18000/blocker',
            category: 'Group 0',
          }),
        }),
    },
    {
      name: 'login correto (hash de senha)',
      run: () =>
        rawRequest(server.apiPort, 'POST', '/api/auth/sign-in/email', {
          headers: { origin: session.origin },
          body: JSON.stringify({ email: 'bench@homora.test', password: 'bench-password-123' }),
        }),
    },
    {
      name: 'login errado ×10 (hash + rate limit)',
      run: async () => {
        for (let i = 0; i < 10; i++)
          await rawRequest(server.apiPort, 'POST', '/api/auth/sign-in/email', {
            headers: { origin: session.origin },
            body: JSON.stringify({ email: 'bench@homora.test', password: `wrong-password-${i}` }),
          });
      },
    },
    {
      name: 'import preview com 1000 serviços',
      run: () => {
        const content = JSON.stringify({
          version: 1,
          groups: [
            {
              name: 'Imported',
              services: Array.from({ length: 1000 }, (_, i) => ({
                name: `I${i}`,
                url: `http://127.0.0.1:19000/${i}`,
              })),
            },
          ],
        });
        return rawRequest(server.apiPort, 'POST', '/api/config/import/preview', {
          headers: { cookie: session.cookie, origin: session.origin },
          body: JSON.stringify({ content, source: 'homora' }),
        });
      },
    },
  ];
  for (const scenario of scenarios) {
    await sleep(500);
    const probe = startProbe(session, 10);
    await sleep(200);
    const op = await timeAsync(async () => scenario.run().catch(() => null));
    await sleep(200);
    const probed = await probe.stop();
    rows.push({
      operação: scenario.name,
      'duração ms': op.ms,
      'maior parada da API ms': probed.maxStallMs,
      'p99 sonda ms': probed.p99Ms,
      sondas: probed.probes,
    });
  }
  add({
    suite: 'blocking',
    title: 'Bloqueio do event loop — quanto a API para durante operações pesadas',
    data: table(rows),
    notes: [
      'Uma sonda leve (a cada 10 ms) mede quanto tempo a API fica sem responder enquanto a operação roda. "Maior parada" ≫ 50 ms = candidato real a worker thread / processo separado.',
      'Parada ≈ duração da operação significa que ela é síncrona e monopoliza o único thread JS.',
    ],
  });
  results.at(-1)!.data = rows;
}
