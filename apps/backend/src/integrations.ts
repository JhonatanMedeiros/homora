import type { IntegrationContext, IntegrationRegistration } from '@homora/integrations/backend';
import { InputError } from './api-error.js';

export type {
  IntegrationAdapter,
  IntegrationMetadata,
  IntegrationTransport,
  IntegrationContext,
  IntegrationRegistration,
} from '@homora/integrations/backend';

/** Explicit registration keeps untrusted or unknown integration types from executing code. */
export function createIntegrationRegistry<T extends IntegrationRegistration>(
  adapters: readonly T[],
) {
  const entries = new Map<string, T>();
  for (const adapter of adapters) {
    if (entries.has(adapter.type)) throw new Error(`Duplicate integration type: ${adapter.type}`);
    entries.set(adapter.type, adapter);
  }
  return {
    list: () =>
      [...entries.values()].map(({ type, label, capabilities }) => ({
        type,
        label,
        capabilities: [...capabilities],
      })),
    /** Public definitions (fields, display) for clients; code adapters carry metadata only. */
    describe: () =>
      [...entries.values()].map(({ type, label, capabilities, definition }) => ({
        type,
        label,
        capabilities: [...capabilities],
        ...(definition
          ? {
              kind: definition.kind,
              mark: definition.mark,
              brandIcon: definition.brandIcon,
              fields: definition.fields,
              display: definition.display,
            }
          : {}),
      })),
    get: (type: string) => entries.get(type),
    prepare: (type: string, context: IntegrationContext) => {
      const entry = entries.get(type);
      if (!entry?.prepare) throw new InputError('integration-type-unavailable');
      return entry.prepare(context);
    },
    prepareAddresses: (type: string, context: IntegrationContext) => {
      const entry = entries.get(type);
      if (!entry?.prepareAddresses) throw new InputError('integration-type-unavailable');
      return entry.prepareAddresses(context);
    },
    prepareInventory: (type: string, context: IntegrationContext) => {
      const entry = entries.get(type);
      if (!entry?.prepareInventory) throw new InputError('integration-type-unavailable');
      return entry.prepareInventory(context);
    },
  };
}

export class IntegrationInvalidatedError extends Error {
  readonly code = 'integration-changed' as const;
  constructor() {
    super('The configuration changed during the query. Refresh and try again.');
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
