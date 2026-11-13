/** Backend Docker discovery capability. Local source access and remote push remain separate. */
export { createDockerSource, parseDockerHost } from './local.js';
export type { DockerContainer, DockerHost, DockerSource } from './local.js';
export { parseDocker } from './labels.js';
export type { DiscoveryEntry } from './labels.js';
export { createDockerPush, pushInventorySchema, PUSH_FRESHNESS_MS } from './push.js';
