import type { MessageKey } from './en';
import { ptBR as core } from './messages/core';
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

export const ptBR: Record<MessageKey, string> = {
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
};
