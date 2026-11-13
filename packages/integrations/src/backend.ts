import type { IntegrationDefinition } from './integration-manifest.js';

/** Implementations are built into Homora; the host supplies the restricted GET transport. */
export interface IntegrationAdapter<Config, Data> {
  type: string;
  label: string;
  capabilities: readonly string[];
  validate(config: Config): Config;
  collect(config: Config): Promise<Data>;
}

export type IntegrationMetadata = { type: string; label: string; capabilities: readonly string[] };
export type IntegrationTransport = (request: {
  origin: string;
  path: string;
  authorization?: string;
  apiKey?: string;
  maxBodyBytes?: number;
}) => Promise<{ status: number; body: unknown; retryAfterSeconds?: number }>;
export type IntegrationContext = {
  publicConfig: Record<string, unknown>;
  credentials: { secret?: string; ca?: string; tokenId?: string };
  transport?: IntegrationTransport;
};
export type IntegrationRegistration = IntegrationMetadata & {
  definition?: IntegrationDefinition;
  prepare?: (context: IntegrationContext) => () => Promise<unknown>;
  prepareInventory?: (context: IntegrationContext) => () => Promise<unknown>;
  prepareAddresses?: (
    context: IntegrationContext,
  ) => (guests: readonly unknown[]) => Promise<unknown>;
  /** Return retry delay in seconds for an error, or null when it should not trigger a pause. */
  retryDelaySeconds?: (error: unknown) => number | null;
};

/** Derive public metadata from the definition so the registry cannot drift from it. */
export function defineBackendIntegration(
  definition: IntegrationDefinition,
  hooks: Pick<
    IntegrationRegistration,
    'prepare' | 'prepareInventory' | 'prepareAddresses' | 'retryDelaySeconds'
  >,
): IntegrationRegistration {
  return {
    ...hooks,
    type: definition.type,
    label: definition.label,
    capabilities: definition.capabilities,
    definition,
  };
}
