import { round, rssSlopeMbPerMin, runLoad, sampleProcess, table } from './lib.js';
import { ENDPOINTS, add, profile, results, type Fixture } from './runtime.js';

/* ---------------------------------------------------------------- suite: soak */

export async function suiteSoak(fixture: Fixture) {
  const { server, session } = fixture;
  const sampler = sampleProcess(server.pid, 2000);
  const windows: Record<string, unknown>[] = [];
  const startedAt = Date.now();
  let window = 0;
  while (Date.now() - startedAt < profile!.soakSeconds * 1000) {
    const result = await runLoad({
      session,
      pid: server.pid,
      concurrency: profile!.soakConcurrency,
      durationMs: Math.min(15_000, profile!.soakSeconds * 1000),
      pick: (n) =>
        n % 10 === 0
          ? {
              method: 'PUT',
              path: '/api/service-defaults',
              body: JSON.stringify({ allowPrivate: n % 20 === 0 }),
            }
          : ENDPOINTS[['services', 'defaults', 'status', 'groups', 'oneuptime', 'detail'][n % 6]!]!(
              n,
              fixture,
            ),
    });
    windows.push({
      janela: ++window,
      't s': round((Date.now() - startedAt) / 1000, 0),
      rps: result.rps,
      p99: result.p99Ms,
      '2xx%': round((result.ok / Math.max(1, result.requests)) * 100, 1),
      srvCPU: result.proc?.cpuAvgPct,
      srvRSS: result.proc?.rssEndMb,
    });
  }
  const summary = sampler.stop();
  // Skip the first quarter: heap growth while the process warms up is not a leak.
  const slope = rssSlopeMbPerMin(sampler.samples.slice(Math.floor(sampler.samples.length / 4)));
  const first = windows[0]?.rps as number;
  const last = windows.at(-1)?.rps as number;
  add({
    suite: 'soak',
    title: `Soak — ${profile!.soakSeconds}s de carga mista contínua (${profile!.soakConcurrency} conexões)`,
    data: table(windows),
    notes: [
      `RSS inicial ${summary.rssStartMb} MB → final ${summary.rssEndMb} MB (pico ${summary.rssPeakMb} MB); inclinação ${slope} MB/min; FDs máx ${summary.fdsMax}.`,
      `vazão primeira janela ${first} req/s → última ${last} req/s (queda sustentada indica degradação, ex.: crescimento do histórico/WAL).`,
      'inclinação de RSS perto de 0 depois do aquecimento = sem vazamento aparente; crescimento linear contínuo = investigar.',
    ],
  });
  results.at(-1)!.data = windows;
}
