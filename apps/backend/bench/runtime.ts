import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import {
  authenticate,
  log,
  rawRequest,
  round,
  seedDatabase,
  startServer,
  type LoadResult,
  type ReqSpec,
  type ServerHandle,
  type Session,
  type SuiteResult,
} from './lib.js';

/* ---------------------------------------------------------------- profiles */

export type Profile = {
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
export const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
export const profileName = flag('profile', 'quick') ?? 'quick';
export const profile = PROFILES[profileName];
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
export const selected = (flag('suite') ?? ALL.join(',')).split(',').map((s) => s.trim());
const baseDir = flag('dir') ?? tmpdir();
export const workDir = join(baseDir, `homora-bench-${Date.now()}`);
export const outFile = flag('out') ?? join(baseDir, `homora-bench-${profileName}.json`);
mkdirSync(workDir, { recursive: true });
export const keep = args.includes('--keep');

let portCounter = 41_000 + Math.floor(Math.random() * 2000);
const nextPorts = () => ({ apiPort: portCounter++, webPort: portCounter++ });
export const results: SuiteResult[] = [];
export const add = (result: SuiteResult) => {
  results.push(result);
  process.stdout.write(
    `\n## ${result.title}\n\n${typeof result.data === 'string' ? result.data : ''}\n`,
  );
  for (const note of result.notes) process.stdout.write(`- ${note}\n`);
};

/* ---------------------------------------------------------------- shared fixture */

export type Fixture = { server: ServerHandle; session: Session; dbPath: string; firstId: number };

export async function bootServer(
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

export const HEAVY_PAYLOAD = new Set([
  'services',
  'uptime24h',
  'uptime30d',
  'exportjson',
  'status',
]);

export const ENDPOINTS: Record<string, (n: number, f: Fixture) => ReqSpec> = {
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

export const loadRow = (label: string, r: LoadResult) => ({
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
