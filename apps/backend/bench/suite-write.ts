import { log, rawRequest, round, runLoad, table, type ReqSpec } from './lib.js';
import { ENDPOINTS, add, loadRow, profile, results, type Fixture } from './runtime.js';

/* ---------------------------------------------------------------- suite: write */

export async function suiteWrite(fixture: Fixture) {
  const { server, session } = fixture;
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  const serviceBody = (n: number) =>
    JSON.stringify({
      name: `W${n}`,
      url: `http://127.0.0.1:18000/w/${n}`,
      category: 'Group 0',
      description: 'bench',
    });
  const created: number[] = [];
  // Sequential create to harvest IDs, measuring single-writer latency.
  const sequentialStart = Date.now();
  for (let i = 0; i < 100; i++) {
    const res = await rawRequest(server.apiPort, 'POST', '/api/services', {
      headers: { cookie: session.cookie, origin: session.origin },
      body: serviceBody(i),
    });
    if (res.status === 201) created.push((JSON.parse(res.body) as { id: number }).id);
  }
  notes.push(
    `100 criações sequenciais: ${round((Date.now() - sequentialStart) / 100, 1)} ms cada, em média.`,
  );
  const cases: { name: string; pick: (n: number) => ReqSpec }[] = [
    {
      name: 'só escrita: PUT service',
      pick: (n) => ({
        method: 'PUT',
        path: `/api/services/${created[n % created.length]}`,
        body: JSON.stringify({
          name: `W-upd-${n}`,
          url: `http://127.0.0.1:18000/w/${n}`,
          category: 'Group 0',
          description: 'bench',
        }),
      }),
    },
    {
      name: 'misto 80% leitura / 20% escrita',
      pick: (n) =>
        n % 5 === 0
          ? {
              method: 'PUT',
              path: `/api/services/${created[n % created.length]}`,
              body: JSON.stringify({
                name: `W-mix-${n}`,
                url: `http://127.0.0.1:18000/w/${n}`,
                category: 'Group 0',
                description: 'bench',
              }),
            }
          : ENDPOINTS[['services', 'defaults', 'status', 'groups'][n % 4]!]!(n, fixture),
    },
    {
      name: 'criar+apagar em rajada',
      pick: (n) =>
        n % 2 === 0
          ? { method: 'POST', path: '/api/services', body: serviceBody(100_000 + n) }
          : { method: 'DELETE', path: `/api/services/${900_000_000 + n}` },
    },
  ];
  for (const c of cases)
    for (const concurrency of [1, 16, 64]) {
      log(`write: ${c.name} @ ${concurrency}`);
      const result = await runLoad({
        session,
        pid: server.pid,
        concurrency,
        durationMs: profile!.matrixSeconds * 1000,
        pick: c.pick,
      });
      rows.push(loadRow(`${c.name}`, result));
    }
  notes.push(
    'cada escrita em serviço chama monitor.invalidate(), que limpa o estado e força a reverificação de TODOS os serviços; o custo cresce com o total de serviços (veja srvCPU nas linhas de escrita vs. leitura).',
  );
  add({ suite: 'write', title: 'API — escrita e contenção do SQLite', data: table(rows), notes });
  results.at(-1)!.data = rows;
}
