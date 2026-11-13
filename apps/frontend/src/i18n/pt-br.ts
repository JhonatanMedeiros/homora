import type { MessageKey } from './en';
import { ptBR as core } from './messages/core';
import { ptBR as appShell } from './messages/app-shell';
import { ptBR as serviceCards } from './messages/service-cards';
import { ptBR as serviceGroups } from './messages/service-groups';
import { ptBR as serviceForm } from './messages/service-form';
import { ptBR as agents } from './messages/agents';
import { ptBR as integrations } from './messages/integrations';
import { ptBR as connections } from './messages/connections';
import { ptBR as transfer } from './messages/transfer';
import { ptBR as account } from './messages/account';
import { ptBR as apiErrors } from './messages/api-errors';
import { ptBR as status } from './messages/status';
import { ptBR as settings } from './messages/settings';
import { ptBR as hosts } from './messages/hosts';
import { ptBR as appearance } from './messages/appearance';
import { ptBR as coolify } from './messages/coolify';
import { ptBR as uptimeStatus } from './messages/uptime-status';
import { ptBR as serviceDetail } from './messages/service-detail';
import { ptBR as checks } from './messages/checks';

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
  ...coolify,
  ...uptimeStatus,
  ...serviceDetail,
  ...checks,
};
