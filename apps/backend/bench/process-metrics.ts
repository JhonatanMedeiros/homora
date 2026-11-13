import { readFileSync, readdirSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { round } from './common.js';

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
