import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createHistogram, monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { serviceSignature } from '../src/service-signature.js';

export const backendDir = fileURLToPath(new URL('..', import.meta.url));
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
export const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/* ---------------------------------------------------------------- process sampling */

const CLOCK_TICKS = 100; // sysconf(_SC_CLK_TCK) on Linux is 100 everywhere that matters here.

export type ProcSample = { t: number; rssMb: number; cpuTicks: number; fds: number };

export function readProc(pid: number): ProcSample | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    return {
      t: Date.now(),
      rssMb: round(rssKb / 1024),
      cpuTicks: Number(fields[11]) + Number(fields[12]),
      fds: readdirSync(`/proc/${pid}/fd`).length,
    };
  } catch {
    return null;
  }
}

export type ProcSummary = {
  rssStartMb: number;
  rssPeakMb: number;
  rssEndMb: number;
  /** Average of one core: 100 means one fully busy core. */
  cpuAvgPct: number;
  cpuMaxPct: number;
  fdsMax: number;
  samples: number;
};

/** Samples a process from the outside (RSS, CPU, open descriptors) at a fixed interval. */
export function sampleProcess(pid: number, intervalMs = 1000) {
  const samples: ProcSample[] = [];
  const take = () => {
    const sample = readProc(pid);
    if (sample) samples.push(sample);
  };
  take();
  const timer = setInterval(take, intervalMs);
  return {
    samples,
    stop(): ProcSummary {
      clearInterval(timer);
      take();
      const first = samples[0];
      const last = samples.at(-1);
      if (!first || !last)
        return {
          rssStartMb: 0,
          rssPeakMb: 0,
          rssEndMb: 0,
          cpuAvgPct: 0,
          cpuMaxPct: 0,
          fdsMax: 0,
          samples: 0,
        };
      let cpuMax = 0;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        if (!a || !b || b.t <= a.t) continue;
        cpuMax = Math.max(
          cpuMax,
          ((b.cpuTicks - a.cpuTicks) / CLOCK_TICKS / ((b.t - a.t) / 1000)) * 100,
        );
      }
      const seconds = Math.max((last.t - first.t) / 1000, 0.001);
      return {
        rssStartMb: first.rssMb,
        rssPeakMb: Math.max(...samples.map((s) => s.rssMb)),
        rssEndMb: last.rssMb,
        cpuAvgPct: round(((last.cpuTicks - first.cpuTicks) / CLOCK_TICKS / seconds) * 100),
        cpuMaxPct: round(cpuMax),
        fdsMax: Math.max(...samples.map((s) => s.fds)),
        samples: samples.length,
      };
    },
  };
}

/** Linear slope of RSS over time in MB/min (least squares); positive and steady suggests a leak. */
export function rssSlopeMbPerMin(samples: ProcSample[]): number {
  if (samples.length < 3) return 0;
  const t0 = samples[0]?.t ?? 0;
  const xs = samples.map((s) => (s.t - t0) / 60_000);
  const ys = samples.map((s) => s.rssMb);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((xs[i] ?? 0) - mx) * ((ys[i] ?? 0) - my);
    den += ((xs[i] ?? 0) - mx) ** 2;
  }
  return den === 0 ? 0 : round(num / den, 2);
}

/** Event-loop delay of THIS process (the load generator or an in-process suite). */
export function loopLagMonitor() {
  const histogram = monitorEventLoopDelay({ resolution: 5 });
  histogram.enable();
  return {
    stop() {
      histogram.disable();
      return {
        p50Ms: round(histogram.percentile(50) / 1e6),
        p99Ms: round(histogram.percentile(99) / 1e6),
        maxMs: round(histogram.max / 1e6),
      };
    },
  };
}

/* ---------------------------------------------------------------- server under test */

const liveServers = new Set<ChildProcess>();
/** Hard-stops every server this process started (used by the memory guard). */
export function killServers() {
  for (const child of liveServers) child.kill('SIGKILL');
}

/**
 * Aborts the run before it can take the machine down: polls free memory and the servers' RSS and
 * calls `onTrip` once either limit is crossed. Returns a function that stops the guard.
 */
export function startMemoryGuard(
  options: { minFreeMb: number; maxServerRssMb: number },
  onTrip: (reason: string) => void,
) {
  const timer = setInterval(() => {
    try {
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const availableMb = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)?.[1] ?? 0) / 1024;
      if (availableMb < options.minFreeMb) {
        killServers();
        onTrip(`memória disponível ${Math.round(availableMb)} MB < ${options.minFreeMb} MB`);
        return;
      }
      for (const child of liveServers) {
        const rss = child.pid ? readProc(child.pid)?.rssMb : undefined;
        if (rss !== undefined && rss > options.maxServerRssMb) {
          killServers();
          onTrip(`RSS do servidor ${rss} MB > ${options.maxServerRssMb} MB`);
          return;
        }
      }
    } catch {
      /* /proc unavailable: no guard rather than a crash */
    }
  }, 500);
  return () => clearInterval(timer);
}

export type ServerHandle = {
  pid: number;
  apiPort: number;
  webPort: number;
  origin: string;
  mode: 'dist' | 'tsx';
  stop(): Promise<void>;
  logs(): string;
};

export async function startServer(options: {
  dbPath: string;
  apiPort: number;
  webPort: number;
  nodeArgs?: string[];
}): Promise<ServerHandle> {
  const dist = join(backendDir, 'dist', 'server.js');
  const mode = existsSync(dist) ? 'dist' : 'tsx';
  // HOMORA_BENCH_RUNTIME=node|bun picks the server runtime; default is the one running the bench.
  const requested = process.env.HOMORA_BENCH_RUNTIME;
  const executable = requested ?? process.execPath;
  const isBun = requested ? requested === 'bun' : !!process.versions.bun;
  // V8 flags (heap cap) do not exist in Bun; the RSS guard in run.ts still applies.
  const args = [
    ...(isBun ? [] : (options.nodeArgs ?? [])),
    ...(mode === 'dist'
      ? [dist]
      : isBun
        ? [join(backendDir, 'src', 'server.ts')]
        : ['--import', 'tsx', join(backendDir, 'src', 'server.ts')]),
  ];
  const child: ChildProcess = spawn(executable, args, {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOMORA_DATABASE_PATH: options.dbPath,
      HOMORA_API_PORT: String(options.apiPort),
      HOMORA_WEB_PORT: String(options.webPort),
      HOMORA_BIND_HOST: '127.0.0.1',
      HOMORA_SESSION_SECRET: 'benchmark-session-secret-'.repeat(2),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  let exited = false;
  liveServers.add(child);
  child.once('exit', () => {
    exited = true;
    liveServers.delete(child);
  });
  const pid = child.pid;
  if (!pid) throw new Error('Could not start the server process.');
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (exited) throw new Error(`Server exited during start-up:\n${output}`);
    if (Date.now() > deadline) throw new Error(`Server start-up timed out:\n${output}`);
    const res = await rawRequest(options.apiPort, 'GET', '/api/auth/status').catch(() => null);
    if (res?.status === 200) break;
    await sleep(100);
  }
  return {
    pid,
    apiPort: options.apiPort,
    webPort: options.webPort,
    origin: `http://localhost:${options.webPort}`,
    mode,
    logs: () => output,
    async stop() {
      if (exited) return;
      child.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(10_000)]);
      if (!exited) child.kill('SIGKILL');
    },
  };
}

/* ---------------------------------------------------------------- HTTP helpers */

export type Res = {
  status: number;
  body: string;
  bytes: number;
  headers: http.IncomingHttpHeaders;
};

export function rawRequest(
  port: number,
  method: string,
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: string;
    agent?: http.Agent;
    /** Count the bytes but keep nothing: large responses must not pile up in the load generator. */
    discard?: boolean;
  } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        agent: options.agent,
        headers: {
          ...(options.body === undefined
            ? {}
            : {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(options.body),
              }),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (!options.discard) chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: options.discard ? '' : Buffer.concat(chunks).toString('utf8'),
            bytes,
            headers: res.headers,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

export type Session = { cookie: string; origin: string; port: number };

/** First-run setup plus sign-in through the real HTTP API. */
export async function authenticate(server: ServerHandle): Promise<Session> {
  const email = 'bench@homora.test';
  const password = 'bench-password-123';
  const origin = server.origin;
  const setup = await rawRequest(server.apiPort, 'POST', '/api/auth/setup', {
    headers: { origin },
    body: JSON.stringify({ name: 'Bench', email, password }),
  });
  if (setup.status !== 201 && setup.status !== 403)
    throw new Error(`Setup failed: ${setup.status} ${setup.body}`);
  const login = await rawRequest(server.apiPort, 'POST', '/api/auth/sign-in/email', {
    headers: { origin },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`Sign-in failed: ${login.status} ${login.body}`);
  const cookie = (login.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('No session cookie received.');
  return { cookie, origin, port: server.apiPort };
}

export type ReqSpec = { method: string; path: string; body?: string; anonymous?: boolean };

export type LoadResult = {
  concurrency: number;
  durationS: number;
  requests: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  ok: number;
  statuses: Record<string, number>;
  /** Connection-level failures (reset, timeout, refused). */
  errors: Record<string, number>;
  /** Share of one core the load generator itself used; near 100 the generator is the limit. */
  generatorCpuPct: number;
  proc?: ProcSummary;
};

/** Closed-loop load: `concurrency` virtual users send requests back to back for `durationMs`. */
export async function runLoad(options: {
  session: Session;
  pid?: number;
  concurrency: number;
  durationMs: number;
  pick: (n: number) => ReqSpec;
  timeoutMs?: number;
}): Promise<LoadResult> {
  const { session, concurrency, durationMs } = options;
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: concurrency,
    maxFreeSockets: concurrency,
  });
  const hist = createHistogram();
  const statuses: Record<string, number> = {};
  const errors: Record<string, number> = {};
  let requests = 0;
  let counter = 0;
  const deadline = Date.now() + durationMs;
  const sampler = options.pid ? sampleProcess(options.pid, 500) : undefined;
  const cpuStart = process.cpuUsage();
  const wallStart = Date.now();
  const user = async () => {
    while (Date.now() < deadline) {
      const spec = options.pick(counter++);
      const startedAt = process.hrtime.bigint();
      try {
        const res = await Promise.race([
          rawRequest(session.port, spec.method, spec.path, {
            agent,
            discard: true,
            body: spec.body,
            headers: {
              ...(spec.anonymous ? {} : { cookie: session.cookie }),
              ...(spec.method === 'GET' ? {} : { origin: session.origin }),
            },
          }),
          sleep(options.timeoutMs ?? 30_000).then(() => {
            throw new Error('timeout');
          }),
        ]);
        hist.record(Math.max(1, Number((process.hrtime.bigint() - startedAt) / 1000n)));
        statuses[res.status] = (statuses[res.status] ?? 0) + 1;
        requests++;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
        errors[code] = (errors[code] ?? 0) + 1;
        requests++;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, user));
  const elapsedS = (Date.now() - wallStart) / 1000;
  const cpu = process.cpuUsage(cpuStart);
  agent.destroy();
  const ok = Object.entries(statuses)
    .filter(([status]) => status.startsWith('2'))
    .reduce((sum, [, n]) => sum + n, 0);
  return {
    concurrency,
    durationS: round(elapsedS),
    requests,
    rps: round(requests / elapsedS, 0),
    p50Ms: round(hist.percentile(50) / 1000, 2),
    p95Ms: round(hist.percentile(95) / 1000, 2),
    p99Ms: round(hist.percentile(99) / 1000, 2),
    maxMs: round(hist.max / 1000, 2),
    ok,
    statuses,
    errors,
    generatorCpuPct: round(((cpu.user + cpu.system) / 1000 / (elapsedS * 1000)) * 100, 0),
    proc: sampler?.stop(),
  };
}

/**
 * Pings a cheap authenticated endpoint on a fixed cadence while something heavy runs, and
 * reports how long the API stopped answering — a direct view of event-loop blocking.
 */
export function startProbe(session: Session, everyMs = 20) {
  const latencies: number[] = [];
  let running = true;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const loop = (async () => {
    while (running) {
      const startedAt = process.hrtime.bigint();
      try {
        await rawRequest(session.port, 'GET', '/api/service-defaults', {
          agent,
          headers: { cookie: session.cookie },
        });
        latencies.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
      } catch {
        latencies.push(Infinity);
      }
      await sleep(everyMs);
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
      agent.destroy();
      const sorted = latencies.filter(Number.isFinite).sort((a, b) => a - b);
      const at = (p: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
      return {
        probes: latencies.length,
        failed: latencies.length - sorted.length,
        p50Ms: round(at(0.5), 2),
        p99Ms: round(at(0.99), 2),
        maxStallMs: round(sorted.at(-1) ?? 0, 1),
      };
    },
  };
}

/* ---------------------------------------------------------------- mock monitored targets */

/** A private (RFC 1918) address of this host: Homora refuses loopback targets by policy. */
export function privateAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces()))
    for (const a of addresses ?? [])
      if (
        a.family === 'IPv4' &&
        !a.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)
      )
        return a.address;
  return null;
}

export async function startMockTarget(host: string, latencyMs: number, failRate = 0) {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    const reply = () => {
      res.statusCode = Math.random() < failRate ? 503 : 200;
      res.end('ok');
    };
    if (latencyMs > 0) setTimeout(reply, latencyMs);
    else reply();
  });
  server.keepAliveTimeout = 1000;
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const port = (server.address() as { port: number }).port;
  return {
    host,
    port,
    hits: () => hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/* ---------------------------------------------------------------- bulk seeding */

export type SeedOptions = {
  services: number;
  groups: number;
  /** Total history rows spread over the last `historyDays` days. */
  historyRows: number;
  historyDays: number;
  /** Host:port used in service URLs; defaults to a loopback placeholder that is never contacted. */
  target?: { host: string; port: number };
  allowPrivate?: boolean;
  checkInterval?: number | null;
};

/** Seeds an open, migrated database directly with SQL; orders of magnitude faster than the API. */
export function seedDatabase(sqlite: DatabaseSync, options: SeedOptions) {
  const host = options.target?.host ?? '127.0.0.1';
  const port = options.target?.port ?? 18000;
  sqlite.exec('BEGIN');
  const insertGroup = sqlite.prepare('INSERT INTO service_groups(name, position) VALUES (?, ?)');
  const insertService = sqlite.prepare(
    'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  for (let g = 0; g < options.groups; g++) insertGroup.run(`Group ${g}`, g);
  const rows: { id: number; signature: string }[] = [];
  for (let i = 0; i < options.services; i++) {
    const url = `http://${host}:${port}/svc/${i}`;
    const allowPrivate = options.allowPrivate ? 1 : 0;
    const result = insertService.run(
      `Service ${i}`,
      url,
      `Group ${i % options.groups}`,
      `Benchmark service number ${i}`,
      'brand:nextcloud',
      Math.floor(i / options.groups),
      allowPrivate,
      'http',
      options.checkInterval ?? null,
    );
    rows.push({
      id: Number(result.lastInsertRowid),
      signature: serviceSignature({
        url,
        allowPrivate: Boolean(allowPrivate),
        checkType: 'http',
        checkInterval: options.checkInterval ?? null,
        expectedStatus: null,
        checkPath: null,
      }),
    });
  }
  sqlite.exec('COMMIT');
  if (options.historyRows > 0 && rows.length > 0) {
    const insert = sqlite.prepare(
      'INSERT OR IGNORE INTO service_observation_history(service_id,signature,observed_at,observation) VALUES (?,?,?,?)',
    );
    const now = Date.now();
    const span = options.historyDays * 86_400_000;
    const perService = Math.ceil(options.historyRows / rows.length);
    const step = Math.max(1, Math.floor(span / perService));
    let batch = 0;
    sqlite.exec('BEGIN');
    for (const row of rows) {
      for (let k = 0; k < perService; k++) {
        const observedAt = now - k * step - Math.floor(Math.random() * Math.max(1, step / 2));
        const down = Math.random() < 0.03;
        const observation = JSON.stringify({
          status: down ? 'unavailable' : 'available',
          lastAttempt: new Date(observedAt).toISOString(),
          reason: down ? 'no-response' : 'responding',
          httpStatus: down ? null : 200,
          latencyMs: down ? null : 5 + Math.floor(Math.random() * 120),
        });
        insert.run(row.id, row.signature, observedAt, observation);
        if (++batch % 200_000 === 0) {
          sqlite.exec('COMMIT');
          sqlite.exec('BEGIN');
        }
      }
    }
    sqlite.exec('COMMIT');
  }
  return rows;
}

/* ---------------------------------------------------------------- reporting */

export type SuiteResult = { suite: string; title: string; data: unknown; notes: string[] };

export function table(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(sem dados)';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (value: unknown) =>
    value === undefined
      ? '-'
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => cell(r[k]).length)));
  const line = (values: string[]) =>
    '| ' + values.map((v, i) => v.padEnd(widths[i] ?? 0)).join(' | ') + ' |';
  return [
    line(keys),
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|',
    ...rows.map((r) => line(keys.map((k) => cell(r[k])))),
  ].join('\n');
}

export const log = (message: string) =>
  process.stderr.write(`[bench ${new Date().toISOString().slice(11, 19)}] ${message}\n`);

export function timeSync<T>(fn: () => T): { value: T; ms: number } {
  const startedAt = process.hrtime.bigint();
  const value = fn();
  return { value, ms: round(Number(process.hrtime.bigint() - startedAt) / 1e6, 2) };
}

export async function timeAsync<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: round(Number(process.hrtime.bigint() - startedAt) / 1e6, 2) };
}
