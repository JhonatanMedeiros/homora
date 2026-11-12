import { createAdGuardAdapter } from './adguard.js';
import { createHomeAssistantAdapter } from './home-assistant.js';
import { createJellyfinAdapter } from './jellyfin.js';
import { createUptimeKumaAdapter } from './uptime-kuma.js';
import { createIntegrationRegistry, type IntegrationContext } from './integrations.js';
import type { AdGuardConfig } from './adguard.js';
import type { HomeAssistantConfig } from './home-assistant.js';
import type { JellyfinConfig } from './jellyfin.js';
import type { UptimeKumaConfig } from './uptime-kuma.js';
import { createProxmoxConnectionAdapter } from './proxmox-connection.js';

function transportFrom(context: IntegrationContext) {
  if (!context.transport) throw new Error('Integration transport unavailable.');
  return context.transport;
}

export const integrationRegistry = createIntegrationRegistry([
  {
    type: 'proxmox',
    label: 'Proxmox VE',
    capabilities: ['inventory'],
    prepare(context) {
      const adapter = createProxmoxConnectionAdapter(transportFrom(context));
      const config = adapter.validate({
        url: String(context.publicConfig.url ?? ''),
        tokenId: context.credentials.tokenId ?? '',
        secret: context.credentials.secret ?? '',
        ca: context.credentials.ca,
      });
      return () => adapter.collect(config);
    },
  },
  {
    type: 'jellyfin',
    label: 'Jellyfin',
    capabilities: ['server-info'],
    prepare(context) {
      const adapter = createJellyfinAdapter(transportFrom(context));
      const config = adapter.validate(context.publicConfig as unknown as JellyfinConfig);
      return () => adapter.collect(config);
    },
  },
  {
    type: 'home-assistant',
    label: 'Home Assistant',
    capabilities: ['entity-state'],
    prepare(context) {
      const adapter = createHomeAssistantAdapter(transportFrom(context));
      const config = adapter.validate({
        url: (context.publicConfig.url ?? '') as string,
        token: context.credentials.secret ?? '',
        entityId: (context.publicConfig.entityId ?? '') as string,
      } satisfies HomeAssistantConfig);
      return () => adapter.collect(config);
    },
  },
  {
    type: 'uptime-kuma',
    label: 'Uptime Kuma',
    capabilities: ['status-page'],
    prepare(context) {
      const adapter = createUptimeKumaAdapter(transportFrom(context));
      const config = adapter.validate({
        url: (context.publicConfig.url ?? '') as string,
        slug: (context.publicConfig.slug ?? '') as string,
      } satisfies UptimeKumaConfig);
      return () => adapter.collect(config);
    },
  },
  {
    type: 'adguard-home',
    label: 'AdGuard Home',
    capabilities: ['dns-status'],
    prepare(context) {
      const adapter = createAdGuardAdapter(transportFrom(context));
      const config = adapter.validate({
        url: (context.publicConfig.url ?? '') as string,
        username: (context.publicConfig.username ?? '') as string,
        password: context.credentials.secret ?? '',
      } satisfies AdGuardConfig);
      return () => adapter.collect(config);
    },
  },
]);
