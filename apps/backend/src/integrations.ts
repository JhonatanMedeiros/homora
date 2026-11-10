import { readProxmox } from './proxmox.js';
import { validateProxmoxConfig, type ProxmoxConfig } from './vault.js';

/** An adapter never exposes credentials through its public metadata. */
export interface IntegrationAdapter<Config, Data> {
  type: string;
  label: string;
  capabilities: readonly string[];
  validate(config: Config): Config;
  collect(config: Config): Promise<Data>;
}

export const proxmoxAdapter: IntegrationAdapter<ProxmoxConfig, unknown> = {
  type: 'proxmox',
  label: 'Proxmox VE',
  capabilities: ['inventory'],
  validate: validateProxmoxConfig,
  collect: readProxmox,
};

export type IntegrationMetadata = { type: string; label: string; capabilities: readonly string[] };
export type IntegrationTransport = (request: {
  origin: string;
  path: string;
  authorization?: string;
}) => Promise<{ status: number; body: unknown }>;
export type IntegrationContext = {
  publicConfig: Record<string, unknown>;
  credentials: { secret?: string; ca?: string };
  transport?: IntegrationTransport;
  legacyConfig?: unknown;
};
export type IntegrationRegistration = IntegrationMetadata & {
  prepare?: (context: IntegrationContext) => () => Promise<unknown>;
};

/** Explicit registration keeps untrusted or unknown integration types from executing code. */
export function createIntegrationRegistry<T extends IntegrationRegistration>(
  adapters: readonly T[],
) {
  const entries = new Map<string, T>();
  for (const adapter of adapters) {
    if (entries.has(adapter.type)) throw new Error(`Tipo de integração duplicado: ${adapter.type}`);
    entries.set(adapter.type, adapter);
  }
  return {
    list: () =>
      [...entries.values()].map(({ type, label, capabilities }) => ({
        type,
        label,
        capabilities: [...capabilities],
      })),
    get: (type: string) => entries.get(type),
    prepare: (type: string, context: IntegrationContext) => {
      const entry = entries.get(type);
      if (!entry?.prepare) throw new Error('Tipo de integração indisponível.');
      return entry.prepare(context);
    },
  };
}

export class IntegrationInvalidatedError extends Error {
  constructor() {
    super('A configuração mudou durante a consulta. Atualize novamente.');
  }
}

/** One cache per configured instance. Failed requests are never cached. */
export function createObservationCache<Data>(ttlMs: number, now: () => number = Date.now) {
  let generation = 0;
  let cached: { data: Data; checkedAt: string; expires: number } | undefined;
  let pending: Promise<{ data: Data; checkedAt: string }> | undefined;
  return {
    invalidate() {
      generation++;
      cached = undefined;
      pending = undefined;
    },
    async collect(fetchData: () => Promise<Data>, force = false) {
      if (force) cached = undefined;
      if (!force && cached && cached.expires > now())
        return { data: cached.data, checkedAt: cached.checkedAt };
      if (pending) return pending;
      const currentGeneration = generation;
      const request = (async () => {
        const data = await fetchData();
        if (currentGeneration !== generation) throw new IntegrationInvalidatedError();
        const timestamp = now();
        const result = { data, checkedAt: new Date(timestamp).toISOString() };
        cached = { ...result, expires: timestamp + ttlMs };
        return result;
      })();
      pending = request;
      try {
        return await request;
      } finally {
        if (pending === request) pending = undefined;
      }
    },
  };
}
