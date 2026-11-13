import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { CHECK_INTERVAL_DEFAULT, type Service } from '@homora/shared';
import { serializeConfiguration } from '../src/transfer/index.js';
import { createServiceConfiguration } from '../src/service-configuration.js';
import { createObservationStore } from '../src/service-observations.js';
import { createServiceMonitor, type ServiceStatus } from '../src/service-monitor.js';
import {
  loopLagMonitor,
  log,
  mb,
  round,
  seedDatabase,
  sleep,
  table,
  timeAsync,
  timeSync,
} from './lib.js';
import { add, keep, profile, results, workDir } from './runtime.js';

/* ---------------------------------------------------------------- suite: db */

export async function suiteDb() {
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  for (const scale of profile!.dbScales) {
    const dbPath = join(workDir, `db-${scale.services}-${scale.historyRows}.sqlite`);
    log(`db suite: seeding ${scale.services} services / ${scale.historyRows} history rows`);
    const database = createDatabase(dbPath);
    const sqlite = getSqliteHandle(database.db);
    const seeded = timeSync(() =>
      seedDatabase(sqlite, {
        services: scale.services,
        groups: Math.max(1, Math.min(200, Math.ceil(scale.services / 25))),
        historyRows: scale.historyRows,
        historyDays: 30,
      }),
    );
    const config = createServiceConfiguration(sqlite);
    const observations = createObservationStore(sqlite);
    const services = config.listServices() as unknown as Service[];
    const states: Record<number, ServiceStatus> = {};
    const nowIso = new Date().toISOString();
    for (const s of services)
      states[s.id] = {
        status: 'available',
        lastAttempt: nowIso,
        reason: 'responding',
        httpStatus: 200,
        latencyMs: 12,
      };
    const mid = services[Math.floor(services.length / 2)]?.id ?? 1;
    const lag = loopLagMonitor();
    const measure = (name: string, fn: () => unknown) => {
      const r = timeSync(fn);
      rows.push({ services: scale.services, history: scale.historyRows, op: name, ms: r.ms });
    };
    measure('listServices', () => config.listServices());
    measure('exportData+yaml', () => {
      const { groups, services: s } = config.exportData();
      return serializeConfiguration(groups, s, 'yaml');
    });
    measure('exportData+json', () => {
      const { groups, services: s } = config.exportData();
      return serializeConfiguration(groups, s, 'json');
    });
    measure('observations.publish(all)', () => observations.publish(services, states));
    measure('observations.publish(unchanged)', () => observations.publish(services, states));
    measure('observations.list()', () => observations.list());
    for (const range of ['24h', '7d', '30d'] as const)
      measure(`uptime(${range}) all services`, () => observations.uptime(range));
    measure('uptime(30d) 1 service (+p95)', () => observations.uptime('30d', Date.now(), mid));
    measure('history page (100)', () => observations.history(mid, 0, Date.now(), undefined, 100));
    measure('detail(1 service)', () => observations.detail(mid));
    const lagResult = lag.stop();
    notes.push(
      `escala ${scale.services}/${scale.historyRows}: seed ${round(seeded.ms / 1000)}s, arquivo ${mb(statSync(dbPath).size)} MB, event-loop max durante as operações ${lagResult.maxMs} ms (tudo síncrono: cada ms é um ms de API parada).`,
    );
    database.close();
    if (!keep) rmSync(dbPath, { force: true });
  }
  add({
    suite: 'db',
    title: 'Armazenamento (SQLite, em processo, operações síncronas)',
    data: table(rows),
    notes,
  });
  results.at(-1)!.data = rows;
  process.stdout.write('');
}

/* ---------------------------------------------------------------- suite: monitor (scheduler) */

export async function suiteMonitor() {
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  const dbPath = join(workDir, 'monitor.sqlite');
  const database = createDatabase(dbPath);
  const sqlite = getSqliteHandle(database.db);
  const observations = createObservationStore(sqlite);
  const makeServices = (count: number): Service[] =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `S${i}`,
      url: `http://10.0.0.${(i % 250) + 1}:8080/${i}`,
      category: 'Bench',
      description: '',
      icon: '',
      position: i,
      allowPrivate: true,
      checkType: 'http',
      checkInterval: null,
      expectedStatus: null,
      checkPath: null,
    })) as unknown as Service[];

  // 1. Pure scheduler cost: the check returns immediately, so this is CPU/memory of bookkeeping + publish.
  for (const count of profile!.monitorInstant) {
    const list = makeServices(count);
    sqlite.exec('DELETE FROM services');
    const insert = sqlite.prepare(
      'INSERT INTO services(id,name,url,category,description,position) VALUES (?,?,?,?,?,?)',
    );
    sqlite.exec('BEGIN');
    for (const s of list) insert.run(s.id, s.name, s.url, s.category, '', s.position ?? 0);
    sqlite.exec('COMMIT');
    let publishMs = 0;
    const monitor = createServiceMonitor(
      async () => list,
      async () => ({ httpStatus: 200, latencyMs: 1 }),
      Date.now,
      (rowsPublished, states) => {
        const r = timeSync(() => observations.publish(rowsPublished, states));
        publishMs = r.ms;
      },
    );
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const lag = loopLagMonitor();
    const cycle = await timeAsync(() => monitor.run(true));
    const lagResult = lag.stop();
    const heapAfter = process.memoryUsage().heapUsed;
    rows.push({
      scenario: 'scheduler puro (check instantâneo)',
      services: count,
      cycleMs: cycle.ms,
      publishMs,
      'checks/s': round(count / (cycle.ms / 1000), 0),
      heapDeltaMb: mb(heapAfter - heapBefore),
      loopMaxMs: lagResult.maxMs,
    });
    notes.push(
      `${count} serviços: publish() em SQLite durou ${publishMs} ms numa única transação síncrona (bloqueia o event loop; pico medido ${lagResult.maxMs} ms).`,
    );
  }

  // 2. Latency bound: the fixed pool of 5 concurrent checks and the 45 s cycle budget.
  const CONCURRENCY = 5;
  for (const { services: count, latencyMs } of profile!.monitorLatency) {
    const list = makeServices(count);
    const monitor = createServiceMonitor(
      async () => list,
      async () => {
        await sleep(latencyMs * (0.5 + Math.random()));
        return { httpStatus: 200, latencyMs };
      },
    );
    const cycle = await timeAsync(() => monitor.run(true));
    const done = Object.values(monitor.snapshot()).filter((s) => s.lastAttempt !== null).length;
    const perSecond = done / (cycle.ms / 1000);
    rows.push({
      scenario: `latência ${latencyMs} ms/check (pool=${CONCURRENCY}, budget 45 s)`,
      services: count,
      cycleMs: cycle.ms,
      checked: done,
      'checks/s': round(perSecond, 1),
      'teórico/s': round(CONCURRENCY / (latencyMs / 1000), 1),
      truncated: done < count ? `sim (${count - done} ficaram para o próximo ciclo)` : 'não',
    });
    const sustainable = Math.floor(perSecond * CHECK_INTERVAL_DEFAULT);
    notes.push(
      `com ${latencyMs} ms por check, o pool de ${CONCURRENCY} sustenta ~${sustainable} serviços no intervalo padrão de ${CHECK_INTERVAL_DEFAULT}s; acima disso os intervalos configurados deixam de ser respeitados.`,
    );
  }
  database.close();
  add({
    suite: 'monitor',
    title: 'Monitor — escalonador e limite de vazão',
    data: table(rows),
    notes,
  });
  results.at(-1)!.data = rows;
}
