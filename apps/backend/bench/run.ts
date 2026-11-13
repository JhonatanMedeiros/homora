/**
 * Homora stress benchmark. Everything runs against an isolated temporary database and a
 * server process started on random loopback ports; no real infrastructure is touched.
 *
 *   pnpm --filter @homora/backend bench -- --profile quick|heavy|extreme [--suite db,monitor,...]
 */
import { rmSync, writeFileSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';
import { log, mb, startMemoryGuard, sampleProcess, sleep } from './lib.js';
import {
  bootServer,
  flag,
  keep,
  outFile,
  profile,
  profileName,
  results,
  selected,
  workDir,
} from './runtime.js';
import { suiteDb, suiteMonitor } from './suite-storage.js';
import { suiteBlocking } from './suite-blocking.js';
import { suiteHttp } from './suite-http.js';
import { suiteWrite } from './suite-write.js';
import { suiteMonitorReal } from './suite-monitor-real.js';
import { suiteConnections } from './suite-connections.js';
import { suiteAbuse } from './suite-abuse.js';
import { suiteSoak } from './suite-soak.js';

/* ---------------------------------------------------------------- main */

async function main() {
  const minFreeMb = Number(flag('min-free-mb', '3000'));
  const maxServerRssMb = Number(flag('max-server-rss-mb', '3500'));
  let tripped: string | undefined;
  const stopGuard = startMemoryGuard({ minFreeMb, maxServerRssMb }, (reason) => {
    tripped = reason;
    log(`GUARDA DE MEMÓRIA: ${reason}. Servidor encerrado e execução abortada.`);
    process.stdout.write(
      `\n## ABORTADO pelo guarda de memória\n\n- ${reason}. Esta carga excede o limite seguro da máquina (--min-free-mb ${minFreeMb}, --max-server-rss-mb ${maxServerRssMb}); trata-se de um achado, não de um erro do benchmark.\n`,
    );
    writeFileSync(
      outFile,
      JSON.stringify({ profile: profileName, aborted: reason, results }, null, 2),
    );
    if (!keep) rmSync(workDir, { recursive: true, force: true });
    process.exit(3);
  });
  void tripped;
  log(`profile=${profileName} suites=${selected.join(',')} workDir=${workDir}`);
  log(
    `host: ${cpus().length} CPUs, ${mb(totalmem())} MB RAM total, ${mb(freemem())} MB livre, node ${process.version}`,
  );
  const needsServer = selected.some((s) =>
    ['http', 'write', 'blocking', 'connections', 'abuse', 'soak'].includes(s),
  );
  if (selected.includes('db')) await suiteDb();
  if (selected.includes('monitor')) await suiteMonitor();
  if (needsServer) {
    const fixture = await bootServer('main', profile!.http);
    log(`server mode: ${fixture.server.mode} pid=${fixture.server.pid}`);
    try {
      const idle = sampleProcess(fixture.server.pid, 500);
      await sleep(2000);
      const baseline = idle.stop();
      process.stdout.write(
        `\n## Linha de base do servidor (ocioso, ${profile!.http.services} serviços)\n\n- RSS ${baseline.rssEndMb} MB, CPU ${baseline.cpuAvgPct}% de um núcleo, ${baseline.fdsMax} descritores abertos (monitor ativo em segundo plano).\n`,
      );
      if (selected.includes('http')) await suiteHttp(fixture);
      if (selected.includes('blocking')) await suiteBlocking(fixture);
      if (selected.includes('abuse')) await suiteAbuse(fixture);
      if (selected.includes('connections')) await suiteConnections(fixture);
      if (selected.includes('soak')) await suiteSoak(fixture);
      if (selected.includes('write')) await suiteWrite(fixture);
      const logs = fixture.server.logs();
      if (/error|exception|unhandled/i.test(logs))
        process.stdout.write(
          `\n## Logs do servidor com erro\n\n\`\`\`\n${logs.slice(-3000)}\n\`\`\`\n`,
        );
    } finally {
      await fixture.server.stop();
    }
  }
  if (selected.includes('monitor-real')) await suiteMonitorReal();
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        profile: profileName,
        at: new Date().toISOString(),
        node: process.version,
        cpus: cpus().length,
        results,
      },
      null,
      2,
    ),
  );
  stopGuard();
  process.stdout.write(`\nResultados completos em JSON: ${outFile}\n`);
  if (!keep) rmSync(workDir, { recursive: true, force: true });
}

await main();
