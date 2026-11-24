import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawRequest } from './http.js';
import { readProc } from './process-metrics.js';
import { sleep } from './common.js';

export const backendDir = fileURLToPath(new URL('..', import.meta.url));

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
  // V8 flags (heap cap) do not exist in Bun; the RSS guard still applies.
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
