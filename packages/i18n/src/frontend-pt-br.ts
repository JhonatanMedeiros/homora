import type { MessageKey } from './frontend-en.js';
import { ptBR as core } from './messages/core.js';
import { ptBR as appShell } from './messages/app-shell.js';
import { ptBR as serviceCards } from './messages/service-cards.js';
import { ptBR as serviceGroups } from './messages/service-groups.js';
import { ptBR as serviceForm } from './messages/service-form.js';
import { ptBR as agents } from './messages/agents.js';
import { ptBR as integrations } from './messages/integrations.js';
import { ptBR as connections } from './messages/connections.js';
import { ptBR as transfer } from './messages/transfer.js';
import { ptBR as account } from './messages/account.js';
import { ptBR as apiErrors } from './messages/api-errors.js';
import { ptBR as status } from './messages/status.js';
import { ptBR as settings } from './messages/settings.js';
import { ptBR as hosts } from './messages/hosts.js';
import { ptBR as appearance } from './messages/appearance.js';
import { ptBR as resourceLink } from './messages/resources.js';
import { ptBR as uptimeStatus } from './messages/uptime-status.js';
import { ptBR as serviceDetail } from './messages/service-detail.js';
import { ptBR as checks } from './messages/checks.js';

export const ptBR: Record<MessageKey, string> = {
  ...core,
  ...appShell,
  ...serviceCards,
  ...serviceGroups,
  ...serviceForm,
  ...agents,
  ...integrations,
  ...connections,
  ...transfer,
  ...account,
  ...apiErrors,
  ...status,
  ...settings,
  ...hosts,
  ...appearance,
  ...resourceLink,
  ...uptimeStatus,
  ...serviceDetail,
  ...checks,
};
