import type { IntegrationPresentation } from '@homora/integrations/frontend';
import { createCoolifyPresentation } from '@homora/integrations/coolify/frontend';
import { createProxmoxPresentation } from '@homora/integrations/proxmox/frontend';
import { t } from '@/i18n';

export const customPresentations: Readonly<Record<string, IntegrationPresentation>> = {
  coolify: createCoolifyPresentation(t),
  proxmox: createProxmoxPresentation(t),
};
