/**
 * Homora stress benchmark. Everything runs against an isolated temporary database and a
 * server process started on random loopback ports; no real infrastructure is touched.
 *
 *   bun run --filter @homora/backend bench --profile quick|heavy|extreme [--suite db,monitor,...]
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { cpus, freemem, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { CHECK_INTERVAL_DEFAULT, type Service } from '@homora/shared';
import { serializeConfiguration } from '../src/config-transfer.js';
import { createServiceConfiguration } from '../src/service-configuration.js';
import { createObservationStore } from '../src/service-observations.js';
import { createServiceMonitor, type ServiceStatus } from '../src/service-monitor.js';
import {
  authenticate,
  loopLagMonitor,
  log,
  mb,
  privateAddress,
  rawRequest,
  readProc,
  round,
  rssSlopeMbPerMin,
  startMemoryGuard,
  runLoad,
  sampleProcess,
  seedDatabase,
  sleep,
  startMockTarget,
  startProbe,
  startServer,
  table,
  timeAsync,
  timeSync,
  type LoadResult,
  type ReqSpec,
  type ServerHandle,
  type Session,
  type SuiteResult,
} from './lib.js';

/* ---------------------------------------------------------------- profiles */

type Profile = {
  /** Scales for the in-process storage suite. */
  dbScales: { services: number; historyRows: number }[];
  /** Server under test for the HTTP suites. */
  http: { services: number; historyRows: number };
  matrixConcurrency: number[];
  matrixSeconds: number;
  rampEndpoints: string[];
  rampConcurrency: number[];
  rampSeconds: number;
  monitorInstant: number[];
  monitorLatency: { services: number; latencyMs: number }[];
  realMonitorServices: number;
  idleConnections: number[];
  soakSeconds: number;
  soakConcurrency: number;
};

const PROFILES: Record<string, Profile> = {
  quick: {
    dbScales: [{ services: 500, historyRows: 100_000 }],
    http: { services: 500, historyRows: 100_000 },
    matrixConcurrency: [16],
    matrixSeconds: 2,
    rampEndpoints: ['defaults', 'services'],
    rampConcurrency: [1, 16, 64],
    rampSeconds: 3,
    monitorInstant: [1000],
    monitorLatency: [{ services: 200, latencyMs: 20 }],
    realMonitorServices: 50,
    idleConnections: [500],
    soakSeconds: 20,
    soakConcurrency: 32,
  },
  heavy: {
    dbScales: [
      { services: 1000, historyRows: 500_000 },
      { services: 5000, historyRows: 2_000_000 },
    ],
    http: { services: 5000, historyRows: 1_000_000 },
    matrixConcurrency: [1, 64],
    matrixSeconds: 5,
    rampEndpoints: ['defaults', 'services', 'uptime24h'],
    rampConcurrency: [1, 8, 32, 128, 512, 1024],
    rampSeconds: 8,
    monitorInstant: [5000, 20_000],
    monitorLatency: [
      { services: 3000, latencyMs: 20 },
      { services: 10_000, latencyMs: 100 },
    ],
    realMonitorServices: 500,
    idleConnections: [1000, 5000],
    soakSeconds: 180,
    soakConcurrency: 64,
  },
  extreme: {
    dbScales: [
      { services: 1000, historyRows: 1_000_000 },
      { services: 10_000, historyRows: 5_000_000 },
      { services: 50_000, historyRows: 10_000_000 },
    ],
    http: { services: 20_000, historyRows: 5_000_000 },
    matrixConcurrency: [1, 64, 512],
    matrixSeconds: 8,
    rampEndpoints: ['defaults', 'authstatus', 'services', 'status', 'uptime24h', 'uptime30d'],
    rampConcurrency: [1, 8, 32, 128, 512, 1024, 2048, 4096],
    rampSeconds: 12,
    monitorInstant: [10_000, 50_000, 200_000],
    monitorLatency: [
      { services: 5000, latencyMs: 20 },
      { services: 20_000, latencyMs: 100 },
      { services: 20_000, latencyMs: 500 },
    ],
    realMonitorServices: 2000,
    idleConnections: [5000, 20_000, 60_000],
    soakSeconds: 900,
    soakConcurrency: 128,
  },
};

/* ---------------------------------------------------------------- CLI */

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const profileName = flag('profile', 'quick') ?? 'quick';
const profile = PROFILES[profileName];
if (!profile) throw new Error(`Unknown profile "${profileName}". Use quick, heavy or extreme.`);
const ALL = [
  'db',
  'monitor',
  'http',
  'write',
  'blocking',
  'monitor-real',
  'connections',
  'abuse',
  'soak',
];
const selected = (flag('suite') ?? ALL.join(',')).split(',').map((s) => s.trim());
const baseDir = flag('dir') ?? tmpdir();
const workDir = join(baseDir, `homora-bench-${Date.now()}`);
const outFile = flag('out') ?? join(baseDir, `homora-bench-${profileName}.json`);
mkdirSync(workDir, { recursive: true });
const keep = args.includes('--keep');

let portCounter = 41_000 + Math.floor(Math.random() * 2000);
const nextPorts = () => ({ apiPort: portCounter++, webPort: portCounter++ });
const results: SuiteResult[] = [];
const add = (result: SuiteResult) => {
  results.push(result);
  process.stdout.write(
    `\n## ${result.title}\n\n${typeof result.data === 'string' ? result.data : ''}\n`,
  );
  for (const note of result.notes) process.stdout.write(`- ${note}\n`);
};

/* ---------------------------------------------------------------- shared fixture */

type Fixture = { server: ServerHandle; session: Session; dbPath: string; firstId: number };

async function bootServer(
  name: string,
  seed: { services: number; historyRows: number },
  extra: { target?: { host: string; port: number }; allowPrivate?: boolean } = {},
): Promise<Fixture> {
  const dbPath = join(workDir, `${name}.sqlite`);
  log(`seeding ${name}: ${seed.services} services, ${seed.historyRows} history rows`);
  const database = createDatabase(dbPath);
  seedDatabase(getSqliteHandle(database.db), {
    services: seed.services,
    groups: Math.max(1, Math.min(200, Math.ceil(seed.services / 25))),
    historyRows: seed.historyRows,
    historyDays: 30,
    ...extra,
  });
  database.close();
  // Heap cap so a runaway server dies on its own instead of starving the whole machine.
  const server = await startServer({
    dbPath,
    ...nextPorts(),
    nodeArgs: ['--max-old-space-size=3072'],
  });
  const session = await authenticate(server);
  const rows = JSON.parse(
    (
      await rawRequest(server.apiPort, 'GET', '/api/groups', {
        headers: { cookie: session.cookie },
      })
    ).body,
  ) as unknown[];
  void rows;
  return { server, session, dbPath, firstId: 1 };
}

const HEAVY_PAYLOAD = new Set(['services', 'uptime24h', 'uptime30d', 'exportjson', 'status']);

const ENDPOINTS: Record<string, (n: number, f: Fixture) => ReqSpec> = {
  authstatus: () => ({ method: 'GET', path: '/api/auth/status' }),
  defaults: () => ({ method: 'GET', path: '/api/service-defaults' }),
  services: () => ({ method: 'GET', path: '/api/services' }),
  groups: () => ({ method: 'GET', path: '/api/groups' }),
  status: () => ({ method: 'GET', path: '/api/service-status' }),
  uptime24h: () => ({ method: 'GET', path: '/api/services/uptime?range=24h' }),
  uptime30d: () => ({ method: 'GET', path: '/api/services/uptime?range=30d' }),
  detail: (n) => ({ method: 'GET', path: `/api/services/${1 + (n % 50)}/status-detail` }),
  oneuptime: (n) => ({ method: 'GET', path: `/api/services/${1 + (n % 50)}/uptime?range=30d` }),
  exportjson: () => ({ method: 'GET', path: '/api/config/export?format=json' }),
  public: () => ({ method: 'GET', path: '/api/public/status', anonymous: true }),
  notfound: () => ({ method: 'GET', path: '/api/does-not-exist' }),
  unauth: () => ({ method: 'GET', path: '/api/services', anonymous: true }),
};

const loadRow = (label: string, r: LoadResult) => ({
  ...(label ? { case: label } : {}),
  conc: r.concurrency,
  rps: r.rps,
  p50: r.p50Ms,
  p95: r.p95Ms,
  p99: r.p99Ms,
  max: r.maxMs,
  '2xx%': r.requests ? round((r.ok / r.requests) * 100, 1) : 0,
  statuses: Object.entries(r.statuses)
    .map(([k, v]) => `${k}:${v}`)
    .join(' '),
  errs: Object.keys(r.errors).length ? JSON.stringify(r.errors) : '-',
  srvCPU: r.proc?.cpuAvgPct ?? '-',
  srvRSS: r.proc?.rssPeakMb ?? '-',
  genCPU: r.generatorCpuPct,
});

/* ---------------------------------------------------------------- suite: db */

async function suiteDb() {
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

async function suiteMonitor() {
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

/* ---------------------------------------------------------------- suite: http */

async function suiteHttp(fixture: Fixture) {
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

/* ---------------------------------------------------------------- suite: write */

async function suiteWrite(fixture: Fixture) {
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

/* ---------------------------------------------------------------- suite: blocking */

async function suiteBlocking(fixture: Fixture) {
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

/* ---------------------------------------------------------------- suite: monitor-real */

async function suiteMonitorReal() {
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

/* ---------------------------------------------------------------- suite: connections */

const openIdleSockets = async (port: number, count: number) => {
  const sockets: net.Socket[] = [];
  let failed = 0;
  const batch = 500;
  for (let i = 0; i < count; i += batch) {
    await Promise.all(
      Array.from(
        { length: Math.min(batch, count - i) },
        () =>
          new Promise<void>((resolve) => {
            const socket = net.connect(port, '127.0.0.1');
            socket.once('connect', () => {
              // Incomplete request headers keep the connection occupied (slowloris shape).
              socket.write('GET /api/auth/status HTTP/1.1\r\nHost: localhost\r\nX-Slow: ');
              sockets.push(socket);
              resolve();
            });
            socket.once('error', () => {
              failed++;
              resolve();
            });
          }),
      ),
    );
  }
  return { sockets, failed };
};

async function suiteConnections(fixture: Fixture) {
  const { server, session } = fixture;
  const rows: Record<string, unknown>[] = [];
  const notes: string[] = [];
  for (const count of profile!.idleConnections) {
    await sleep(1000);
    const before = readProc(server.pid);
    const { sockets, failed } = await openIdleSockets(server.apiPort, count);
    await sleep(1500);
    const during = readProc(server.pid);
    const probe = startProbe(session, 20);
    const load = await runLoad({
      session,
      pid: server.pid,
      concurrency: 32,
      durationMs: 4000,
      pick: () => ENDPOINTS.defaults!(0, fixture),
    });
    const probed = await probe.stop();
    for (const s of sockets) s.destroy();
    await sleep(2000);
    const after = readProc(server.pid);
    rows.push({
      'conexões penduradas': count,
      'recusadas/falhas': failed,
      'RSS antes MB': before?.rssMb,
      'RSS com conexões MB': during?.rssMb,
      'KB por conexão':
        before && during
          ? round(((during.rssMb - before.rssMb) * 1024) / Math.max(1, sockets.length), 1)
          : '-',
      'FDs no servidor': during?.fds,
      'rps sob carga leve': load.rps,
      'p99 ms': load.p99Ms,
      '2xx%': load.requests ? round((load.ok / load.requests) * 100, 1) : 0,
      'RSS após fechar MB': after?.rssMb,
      'FDs após fechar': after?.fds,
    });
    void probed;
  }
  add({
    suite: 'connections',
    title: 'Conexões ociosas / lentas (estilo slowloris) — memória por conexão e degradação',
    data: table(rows),
    notes: notes.concat([
      'FDs após fechar devem voltar ao nível inicial; se não voltarem há vazamento de sockets.',
    ]),
  });
  results.at(-1)!.data = rows;
}

/* ---------------------------------------------------------------- suite: abuse */

async function suiteAbuse(fixture: Fixture) {
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

/* ---------------------------------------------------------------- suite: soak */

async function suiteSoak(fixture: Fixture) {
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
