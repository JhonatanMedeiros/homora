import type { Service } from '@homora/shared';
import { getAuthorizedResponse } from './network-request.js';

/**
 * Por que o serviço está nesse estado. `status` continua sendo o resumo (disponível,
 * indisponível ou sem informação); `reason` explica o resultado da verificação.
 */
export type StatusReason =
  | 'responding' // 2xx
  | 'redirect' // 3xx, sem seguir o redirecionamento
  | 'login-required' // 401 ou 403: responde, mas exige credenciais
  | 'not-found' // 404
  | 'error-status' // outros 4xx e 5xx
  | 'no-response' // falha de rede, DNS, TLS ou tempo esgotado
  | 'unchecked'; // ainda não verificado

export type ServiceStatus = {
  status: 'available' | 'unavailable' | 'unknown';
  lastAttempt: string | null;
  reason: StatusReason;
  /** Código HTTP recebido; nulo quando não houve resposta ou ainda não foi verificado. */
  httpStatus: number | null;
  /** Tempo até a resposta, em milissegundos; nulo quando não houve resposta. */
  latencyMs: number | null;
};

export type CheckResult = { httpStatus: number; latencyMs: number };

/** Traduz o código HTTP no estado exibido. Serviços que respondem, mesmo pedindo login, estão no ar. */
export function classify(httpStatus: number): Pick<ServiceStatus, 'status' | 'reason'> {
  if (httpStatus >= 200 && httpStatus < 300) return { status: 'available', reason: 'responding' };
  if (httpStatus >= 300 && httpStatus < 400) return { status: 'available', reason: 'redirect' };
  if (httpStatus === 401 || httpStatus === 403)
    return { status: 'available', reason: 'login-required' };
  if (httpStatus === 404) return { status: 'unavailable', reason: 'not-found' };
  return { status: 'unavailable', reason: 'error-status' };
}

const unchecked = (): ServiceStatus => ({
  status: 'unknown',
  lastAttempt: null,
  reason: 'unchecked',
  httpStatus: null,
  latencyMs: null,
});

const intervalMs = 60_000;
const cacheMs = 60_000;
/** Tempo máximo para iniciar verificações em um ciclo; o que sobrar fica para o próximo. */
const cycleBudgetMs = 45_000;
const maxConcurrentChecks = 5;

/** Uses the shared pinned-DNS destination policy; private ranges require the
 * per-service opt-in and special ranges remain forbidden. */
export async function checkService(url: string, allowPrivate = false): Promise<CheckResult> {
  const startedAt = Date.now();
  const response = await getAuthorizedResponse(
    url,
    {
      origins: [new URL(url).origin],
      allowPrivate,
    },
    { timeoutMs: 8000, reportRedirect: true },
  );
  return { httpStatus: response.status, latencyMs: Date.now() - startedAt };
}

export function createServiceMonitor(
  getServices: () => Promise<Service[]>,
  check: (url: string, allowPrivate?: boolean) => Promise<CheckResult> = checkService,
  now: () => number = Date.now,
) {
  const states = new Map<number, ServiceStatus>();
  let lastRun = 0;
  let running: Promise<void> | undefined;
  let generation = 0;
  let rerunRequested = false;

  async function run(force = false) {
    if (!force && now() - lastRun < cacheMs) return;
    if (running) {
      if (force) rerunRequested = true;
      return running;
    }
    const runGeneration = generation;
    running = (async () => {
      let current: Service[];
      try {
        current = await getServices();
      } catch {
        // A dashboard read remains usable when monitoring cannot read the DB.
        return;
      }
      if (runGeneration !== generation) return;
      const currentIds = new Set(current.map(({ id }) => id));
      for (const id of states.keys()) if (!currentIds.has(id)) states.delete(id);
      for (const service of current)
        if (!states.has(service.id)) states.set(service.id, unchecked());
      // Sem limite fixo de quantidade: os mais antigos (ou nunca verificados) vão primeiro e o
      // ciclo para de iniciar verificações ao esgotar o orçamento. O restante mantém o estado
      // anterior e passa à frente no ciclo seguinte.
      const lastOf = (id: number) => states.get(id)?.lastAttempt ?? '';
      const monitored = [...current].sort((a, b) => lastOf(a.id).localeCompare(lastOf(b.id)));
      const startedAt = now();
      let nextIndex = 0;
      await Promise.all(
        Array.from({ length: Math.min(maxConcurrentChecks, monitored.length) }, async () => {
          while (
            nextIndex < monitored.length &&
            runGeneration === generation &&
            now() - startedAt < cycleBudgetMs
          ) {
            const service = monitored[nextIndex++];
            const attemptedAt = new Date(now()).toISOString();
            try {
              const result = await check(service.url, service.allowPrivate === true);
              if (runGeneration === generation)
                states.set(service.id, {
                  ...classify(result.httpStatus),
                  lastAttempt: attemptedAt,
                  httpStatus: result.httpStatus,
                  latencyMs: result.latencyMs,
                });
            } catch {
              if (runGeneration === generation)
                states.set(service.id, {
                  status: 'unavailable',
                  lastAttempt: attemptedAt,
                  reason: 'no-response',
                  httpStatus: null,
                  latencyMs: null,
                });
            }
          }
        }),
      );
      if (runGeneration === generation) lastRun = now();
    })();
    try {
      await running;
    } finally {
      const rerun = rerunRequested;
      rerunRequested = false;
      running = undefined;
      if (rerun) void run(true);
    }
  }

  return {
    run,
    invalidate() {
      generation++;
      lastRun = 0;
      states.clear();
      return run(true);
    },
    snapshot() {
      return Object.fromEntries(states);
    },
  };
}

export function startServiceMonitor(monitor: ReturnType<typeof createServiceMonitor>) {
  const initial = setTimeout(() => void monitor.run(true), 0);
  const interval = setInterval(() => void monitor.run(), intervalMs);
  initial.unref();
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
