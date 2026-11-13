import { en as core } from './messages/core';
import { en as appShell } from './messages/app-shell';
import { en as serviceCards } from './messages/service-cards';
import { en as serviceGroups } from './messages/service-groups';
import { en as serviceForm } from './messages/service-form';
import { en as agents } from './messages/agents';
import { en as integrations } from './messages/integrations';
import { en as connections } from './messages/connections';
import { en as transfer } from './messages/transfer';
import { en as account } from './messages/account';
import { en as apiErrors } from './messages/api-errors';
import { en as status } from './messages/status';
import { en as settings } from './messages/settings';
import { en as hosts } from './messages/hosts';
import { en as appearance } from './messages/appearance';
import { en as coolify } from './messages/coolify';

/** Source of truth for translation keys: every language must provide these exact keys. */
export const en = {
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
} as const;
export type MessageKey = keyof typeof en;
