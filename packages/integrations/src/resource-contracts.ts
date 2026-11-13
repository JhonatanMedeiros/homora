/**
 * Normalized resource inventory and reviewable service-link contracts.
 * Names, UUIDs and addresses come from the remote service and are untrusted data.
 */
export type ResourceType = 'application' | 'service';
/** Normalized from Coolify's composite status (`running:healthy`); anything unrecognized is `unknown`. */
export type ResourceState = 'running' | 'degraded' | 'stopped' | 'unknown';

export type IntegrationResource = {
  uuid: string;
  type: ResourceType;
  name: string;
  description: string | null;
  state: ResourceState;
  /** The raw status string reported by Coolify (bounded), for display only. */
  rawStatus: string | null;
  /** Valid http(s) addresses without credentials, at most 5. Empty for services and URL-less apps. */
  urls: string[];
  /** Coolify exposes only the numeric environment id in the documented list endpoints. */
  environmentId: number | null;
};

/** Widget summary (`GET /api/connections/:id/data`): counts of applications and services. */
export type ResourceSummary = {
  total: number;
  running: number;
  degraded: number;
  stopped: number;
  unknown: number;
};

/** `GET /api/resource-links`: a card linked to one Coolify resource. */
export type ResourceLink = {
  id: number;
  serviceId: number;
  integrationId: number;
  resourceUuid: string;
  resourceType: ResourceType;
  /** Name and address the user last reviewed; a difference with the live inventory needs review. */
  seenName: string;
  seenUrl: string | null;
};

export const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Compatibility aliases for the original resource integration API. */
export type CoolifyResourceType = ResourceType;
export type CoolifyState = ResourceState;
export type CoolifyResource = IntegrationResource;
export type CoolifySummary = ResourceSummary;
export const COOLIFY_UUID_PATTERN = RESOURCE_ID_PATTERN;
