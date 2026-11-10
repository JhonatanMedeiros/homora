import type { MessageKey } from './en';
import { ptBR as core } from './messages/core';
import { ptBR as agents } from './messages/agents';
import { ptBR as integrations } from './messages/integrations';
import { ptBR as connections } from './messages/connections';
import { ptBR as transfer } from './messages/transfer';
import { ptBR as apiErrors } from './messages/api-errors';

export const ptBR: Record<MessageKey, string> = {
  ...core,
  ...agents,
  ...integrations,
  ...connections,
  ...transfer,
  ...apiErrors,
};
