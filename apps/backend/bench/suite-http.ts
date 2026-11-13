import { log, round, runLoad, sleep, table } from './lib.js';
import {
  ENDPOINTS,
  HEAVY_PAYLOAD,
  add,
  loadRow,
  profile,
  results,
  type Fixture,
} from './runtime.js';

/* ---------------------------------------------------------------- suite: http */

export async function suiteHttp(fixture: Fixture) {
  const { server, session } = fixture;
  const matrixRows: Record<string, unknown>[] = [];
  const names = Object.keys(ENDPOINTS);
  for (const name of names)
    for (const concurrency of profile!.matrixConcurrency) {
      log(`http matrix: ${name} @ ${concurrency}`);
      const result = await runLoad({
        session,
        pid: server.pid,
        concurrency,
        durationMs: profile!.matrixSeconds * 1000,
        pick: (n) => ENDPOINTS[name]!(n, fixture),
      });
      matrixRows.push(loadRow(name, result));
      if (name === 'public') await sleep(1000);
    }
  add({
    suite: 'http',
    title: `API — matriz de endpoints (${profile!.http.services} serviços, ${profile!.http.historyRows} linhas de histórico)`,
    data: table(matrixRows),
    notes: [
      'latências em ms; srvCPU em % de um núcleo (200 = dois núcleos); genCPU alto (~100) indica que o gerador de carga virou o gargalo.',
      '`public` tem rate limit de 60 req/min por design: 429 é esperado. `unauth`/`notfound` medem o custo do caminho de rejeição.',
    ],
  });
  results.at(-1)!.data = matrixRows;

  const rampRows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  for (const name of profile!.rampEndpoints) {
    let kneeRps = 0;
    let knee = 0;
    // Endpoints that return the whole inventory are capped: every concurrent request holds a
    // multi-megabyte response, and a ramp past this is not a realistic homelab load.
    const cap = HEAVY_PAYLOAD.has(name) ? 256 : Infinity;
    for (const concurrency of profile!.rampConcurrency.filter((c) => c <= cap)) {
      log(`http ramp: ${name} @ ${concurrency}`);
      const result = await runLoad({
        session,
        pid: server.pid,
        concurrency,
        durationMs: profile!.rampSeconds * 1000,
        pick: (n) => ENDPOINTS[name]!(n, fixture),
      });
      rampRows.push(loadRow(name, result));
      if (result.rps > kneeRps * 1.05) {
        kneeRps = result.rps;
        knee = concurrency;
      }
      const failing = result.requests > 0 && result.ok / result.requests < 0.9;
      if (failing) {
        notes.push(
          `${name}: ${round((1 - result.ok / result.requests) * 100)}% de falhas a ${concurrency} conexões simultâneas — parei a rampa aqui.`,
        );
        break;
      }
    }
    notes.push(
      `${name}: pico de ${kneeRps} req/s (a partir de ~${knee} conexões simultâneas mais concorrência só aumenta a latência).`,
    );
  }
  add({
    suite: 'http-ramp',
    title: 'API — rampa de concorrência (achar o joelho/saturação)',
    data: table(rampRows),
    notes,
  });
  results.at(-1)!.data = rampRows;
}
