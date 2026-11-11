import { en as core } from './messages/core';
import { en as agents } from './messages/agents';
import { en as integrations } from './messages/integrations';
import { en as connections } from './messages/connections';
import { en as transfer } from './messages/transfer';
import { en as account } from './messages/account';
import { en as apiErrors } from './messages/api-errors';

/** Source of truth for translation keys: every language must provide these exact keys. */
export const en = {
  ...core,
  ...agents,
  ...integrations,
  ...connections,
  ...transfer,
  ...account,
  ...apiErrors,
} as const;
export type MessageKey = keyof typeof en;
