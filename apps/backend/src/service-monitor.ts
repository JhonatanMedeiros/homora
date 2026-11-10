import { execFile } from 'node:child_process';
import { CHECK_INTERVAL_DEFAULT, type CheckType, type Service } from '@homora/shared';
import { authorizeDestination } from './network-policy.js';
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
  | 'reachable' // ping ICMP respondido
  | 'no-response' // falha de rede, DNS, TLS, ping sem resposta ou tempo esgotado
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

/** `httpStatus` é nulo quando a verificação foi um ping ICMP respondido. */
export type CheckResult = { httpStatus: number | null; latencyMs: number };

/** O binário `ping` não existe ou não pode ser usado: não é uma falha do serviço. */
export class PingUnavailableError extends Error {}

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

/** Frequência com que o monitor procura serviços vencidos; cada serviço tem o próprio intervalo. */
const tickMs = 10_000;
/** Folga para que um serviço verificado há quase um intervalo não espere mais um tick. */
const dueSlackMs = 2_000;
/** Tempo máximo para iniciar verificações em um ciclo; o que sobrar fica para o próximo. */
const cycleBudgetMs = 45_000;
const maxConcurrentChecks = 5;

/** Mede um ping ICMP ao endereço já autorizado e fixado pela política de destinos. */
function ping(address: string, family: number): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    // Sem shell: o endereço é um IP validado, passado como argumento isolado.
    execFile(
      'ping',
      [family === 6 ? '-6' : '-4', '-c', '1', '-W', '2', '-n', address],
      { timeout: 5000 },
      (error, stdout) => {
        if (error) {
          reject(
            // ENOENT: sem o binário; 126: sem permissão (por exemplo, contêiner sem NET_RAW).
            (error as { code?: unknown }).code === 'ENOENT' ||
              (error as { code?: unknown }).code === 126
              ? new PingUnavailableError()
              : new Error('Sem resposta ao ping.'),
          );
          return;
        }
        const reported = /time[=<]\s*([\d.]+)\s*ms/.exec(stdout)?.[1];
        resolve({
          httpStatus: null,
          latencyMs: Math.round(reported ? Number(reported) : Date.now() - startedAt),
        });
      },
    );
  });
}

/** Uses the shared pinned-DNS destination policy; private ranges require the
 * per-service opt-in and special ranges remain forbidden. */
export async function checkService(
  url: string,
  allowPrivate = false,
  type: CheckType = 'http',
): Promise<CheckResult> {
  const policy = { origins: [new URL(url).origin], allowPrivate };
  if (type === 'ping') {
    const { address } = await authorizeDestination(url, policy);
    return ping(address.address, address.family);
  }
  const startedAt = Date.now();
  const response = await getAuthorizedResponse(url, policy, {
    timeoutMs: 8000,
    reportRedirect: true,
  });
  return { httpStatus: response.status, latencyMs: Date.now() - startedAt };
}

export function createServiceMonitor(
  getServices: () => Promise<Service[]>,
  check: (
    url: string,
    allowPrivate?: boolean,
    type?: CheckType,
  ) => Promise<CheckResult> = checkService,
  now: () => number = Date.now,
) {
  const states = new Map<number, ServiceStatus>();
  let running: Promise<void> | undefined;
  let generation = 0;
  let rerunRequested = false;

  async function run(force = false) {
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
      const startedAt = now();
      const isDue = (service: Service) => {
        const last = lastOf(service.id);
        if (!last) return true;
        const interval = (service.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 1000;
        return startedAt - Date.parse(last) >= interval - dueSlackMs;
      };
      const monitored = current
        .filter((service) => force || isDue(service))
        .sort((a, b) => lastOf(a.id).localeCompare(lastOf(b.id)));
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
              const result = await check(
                service.url,
                service.allowPrivate === true,
                service.checkType ?? 'http',
              );
              if (runGeneration === generation)
                states.set(service.id, {
                  ...(result.httpStatus === null
                    ? { status: 'available' as const, reason: 'reachable' as const }
                    : classify(result.httpStatus)),
                  lastAttempt: attemptedAt,
                  httpStatus: result.httpStatus,
                  latencyMs: result.latencyMs,
                });
            } catch (error) {
              if (runGeneration === generation && error instanceof PingUnavailableError)
                states.set(service.id, { ...unchecked(), lastAttempt: attemptedAt });
              else if (runGeneration === generation)
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
  const interval = setInterval(() => void monitor.run(), tickMs);
  initial.unref();
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
