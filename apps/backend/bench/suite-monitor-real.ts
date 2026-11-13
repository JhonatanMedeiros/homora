import {
  privateAddress,
  rawRequest,
  round,
  sampleProcess,
  sleep,
  startMockTarget,
  table,
} from './lib.js';
import { add, bootServer, profile, results } from './runtime.js';

/* ---------------------------------------------------------------- suite: monitor-real */

export async function suiteMonitorReal() {
  const address = privateAddress();
  if (!address) {
    add({
      suite: 'monitor-real',
      title: 'Monitor real contra alvos HTTP locais',
      data: '',
      notes: [
        'pulado: nenhum IP privado (RFC 1918) encontrado nesta máquina. O Homora recusa alvos em loopback por política.',
      ],
    });
    return;
  }
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  for (const latencyMs of [0, 50, 250]) {
    const target = await startMockTarget(address, latencyMs, 0.05);
    const fixture = await bootServer(
      `real-${latencyMs}`,
      { services: profile!.realMonitorServices, historyRows: 0 },
      { target, allowPrivate: true },
    );
    const sampler = sampleProcess(fixture.server.pid, 500);
    const startedAt = Date.now();
    let available = 0;
    let unavailable = 0;
    let unknown = 0;
    const windowMs = Math.min(
      70_000,
      Math.max(15_000, (profile!.realMonitorServices / 5) * (latencyMs + 5) + 10_000),
    );
    while (Date.now() - startedAt < windowMs) {
      await sleep(2000);
      const status = JSON.parse(
        (
          await rawRequest(fixture.server.apiPort, 'GET', '/api/service-status', {
            headers: { cookie: fixture.session.cookie },
          })
        ).body,
      ) as Record<string, { status: string }>;
      available = unavailable = unknown = 0;
      for (const s of Object.values(status)) {
        if (s.status === 'available') available++;
        else if (s.status === 'unavailable') unavailable++;
        else unknown++;
      }
      if (unknown === 0) break;
    }
    const proc = sampler.stop();
    rows.push({
      'latência alvo ms': latencyMs,
      serviços: profile!.realMonitorServices,
      'tempo p/ checar tudo s': round((Date.now() - startedAt) / 1000),
      available,
      unavailable,
      unknown,
      'hits no alvo': target.hits(),
      srvCPU: proc.cpuAvgPct,
      srvRSS: proc.rssPeakMb,
    });
    await fixture.server.stop();
    await target.close();
  }
  notes.push(
    '5% dos alvos respondem 503 de propósito (precisam virar "unavailable"); "unknown" restante indica serviços que não foram alcançados dentro da janela.',
  );
  add({
    suite: 'monitor-real',
    title: 'Monitor real contra alvos HTTP locais (IP privado)',
    data: table(rows),
    notes,
  });
  results.at(-1)!.data = rows;
}
