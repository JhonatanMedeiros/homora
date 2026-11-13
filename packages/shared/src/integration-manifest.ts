/**
 * Built-in integration definitions. Pure data: nothing here runs code and nothing is loaded at
 * runtime from the database, the network or the user. The backend validates every manifest with a
 * schema at startup and runs it with one reviewed interpreter; the frontend generates the
 * connection form and the widget text from the same definitions. See docs/decisoes/0009.
 */
export * from './integration-manifest-shared.js';
export { proxmoxDefinition } from './integration-manifests/proxmox.js';
export { coolifyDefinition } from './integration-manifests/coolify.js';
export { jellyfinManifest } from './integration-manifests/jellyfin.js';
export { homeAssistantManifest } from './integration-manifests/homeAssistant.js';
export { uptimeKumaManifest } from './integration-manifests/uptimeKuma.js';
export { adguardManifest } from './integration-manifests/adguard.js';
export { speedtestTrackerManifest } from './integration-manifests/speedtestTracker.js';
export { portainerManifest } from './integration-manifests/portainer.js';
export { netbirdManifest } from './integration-manifests/netbird.js';
export { tailscaleManifest } from './integration-manifests/tailscale.js';
export { cloudflareManifest } from './integration-manifests/cloudflare.js';

import type { IntegrationDefinition } from './integration-manifest-shared.js';
import { proxmoxDefinition } from './integration-manifests/proxmox.js';
import { coolifyDefinition } from './integration-manifests/coolify.js';
import { jellyfinManifest } from './integration-manifests/jellyfin.js';
import { homeAssistantManifest } from './integration-manifests/homeAssistant.js';
import { uptimeKumaManifest } from './integration-manifests/uptimeKuma.js';
import { adguardManifest } from './integration-manifests/adguard.js';
import { speedtestTrackerManifest } from './integration-manifests/speedtestTracker.js';
import { portainerManifest } from './integration-manifests/portainer.js';
import { netbirdManifest } from './integration-manifests/netbird.js';
import { tailscaleManifest } from './integration-manifests/tailscale.js';
import { cloudflareManifest } from './integration-manifests/cloudflare.js';

/** Registration order is the order shown in the connection picker. */
export const integrationDefinitions: readonly IntegrationDefinition[] = [
  jellyfinManifest,
  homeAssistantManifest,
  uptimeKumaManifest,
  adguardManifest,
  speedtestTrackerManifest,
  portainerManifest,
  netbirdManifest,
  tailscaleManifest,
  cloudflareManifest,
  coolifyDefinition,
  proxmoxDefinition,
];

export const integrationDefinition = (type: string) =>
  integrationDefinitions.find((definition) => definition.type === type);
