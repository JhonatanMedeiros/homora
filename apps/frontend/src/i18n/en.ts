import { en as core } from './messages/core';
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
import { en as uptimeStatus } from './messages/uptime-status';
import { en as serviceDetail } from './messages/service-detail';

/** Source of truth for translation keys: every language must provide these exact keys. */
export const en = {
  ...core,
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
} as const;
export type MessageKey = keyof typeof en;
