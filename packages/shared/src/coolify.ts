/**
 * Contract between the backend and the UI for the Coolify integration (read-only).
 * Names, UUIDs and addresses come from the remote service and are untrusted data.
 */
export type CoolifyResourceType = 'application' | 'service';
/** Normalized from Coolify's composite status (`running:healthy`); anything unrecognized is `unknown`. */
export type CoolifyState = 'running' | 'degraded' | 'stopped' | 'unknown';

export type CoolifyResource = {
  uuid: string;
  type: CoolifyResourceType;
  name: string;
  description: string | null;
  state: CoolifyState;
  /** The raw status string reported by Coolify (bounded), for display only. */
  rawStatus: string | null;
  /** Valid http(s) addresses without credentials, at most 5. Empty for services and URL-less apps. */
  urls: string[];
  /** Coolify exposes only the numeric environment id in the documented list endpoints. */
  environmentId: number | null;
};

/** Widget summary (`GET /api/connections/:id/data`): counts of applications and services. */
export type CoolifySummary = {
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
  resourceType: CoolifyResourceType;
  /** Name and address the user last reviewed; a difference with the live inventory needs review. */
  seenName: string;
  seenUrl: string | null;
};

export const COOLIFY_UUID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
