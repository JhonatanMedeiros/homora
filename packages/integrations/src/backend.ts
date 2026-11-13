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
/** A reviewed, built-in login exchange; service-specific wire formats stay with the integration. */
export type SessionAuthProfile = {
  loginPath: string;
  body: Readonly<
    Record<string, { source: 'secret' | 'tokenId' } | { source: 'config'; key: string }>
  >;
  tokenPath: readonly string[];
  validityPath?: readonly string[];
  validPath?: readonly string[];
  /** Used when the API does not return a lifetime. */
  defaultValiditySeconds?: number;
  tokenFormat: 'base64' | 'printable';
  sendAs: { type: 'header'; name: 'x-ftl-sid' | 'x-api-key' } | { type: 'bearer' };
  refreshOnSuccess: boolean;
};
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
export type InputErrorFactory = (
  code: 'invalid-data' | 'https-url-required' | 'invalid-token' | 'invalid-config',
) => Error;

export function transportFrom(context: IntegrationContext): IntegrationTransport {
  if (!context.transport) throw new Error('Integration transport unavailable.');
  return context.transport;
}
export type IntegrationRegistration = IntegrationMetadata & {
  /** Reviewed built-in session login profile; it does not authorize arbitrary POST requests. */
  sessionAuth?: SessionAuthProfile;
  definition?: IntegrationDefinition;
  prepare?: (context: IntegrationContext) => () => Promise<unknown>;
  prepareInventory?: (context: IntegrationContext) => () => Promise<unknown>;
  /** Shape of the authenticated inventory capability, if the integration provides one. */
  inventoryDomain?: 'hosts' | 'resources';
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
    'prepare' | 'prepareInventory' | 'prepareAddresses' | 'retryDelaySeconds' | 'sessionAuth'
  >,
): IntegrationRegistration {
  if (definition.inventoryDomain && !hooks.prepareInventory)
    throw new Error(`Integration ${definition.type} declares inventory without an inventory hook.`);
  if (hooks.prepareAddresses && definition.inventoryDomain !== 'hosts')
    throw new Error(`Integration ${definition.type} declares addresses without host inventory.`);
  return {
    ...hooks,
    type: definition.type,
    label: definition.label,
    capabilities: definition.capabilities,
    inventoryDomain: definition.inventoryDomain,
    definition,
  };
}
