/** Backend Docker discovery capability. Local source access and remote push remain separate. */
export { createDockerSource, parseDockerHost } from './local.js';
export type { DockerContainer, DockerHost, DockerSource } from './local.js';
export { parseDocker } from './labels.js';
export type {
  DiscoveryEntry,
  DiscoveryOverride,
  DiscoveryRejected,
  DiscoverySkipped,
} from './labels.js';
export { fingerprintReview, importResults, overridesSchema, toOverrides } from './review.js';
export type { ImportResult } from './review.js';
export { createDockerPush, pushInventorySchema, PUSH_FRESHNESS_MS } from './push.js';
