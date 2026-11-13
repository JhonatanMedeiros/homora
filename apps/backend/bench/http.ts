import http from 'node:http';
import { createHistogram } from 'node:perf_hooks';
import { round, sleep } from './common.js';
import { sampleProcess, type ProcSummary } from './process-metrics.js';
import type { ServerHandle } from './server.js';

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
