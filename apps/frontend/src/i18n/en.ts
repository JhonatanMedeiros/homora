import { en as core } from './messages/core';
import { en as agents } from './messages/agents';
import { en as integrations } from './messages/integrations';
import { en as connections } from './messages/connections';

/** Fonte das chaves: toda língua precisa ter exatamente estas mensagens. */
export const en = { ...core, ...agents, ...integrations, ...connections } as const;
export type MessageKey = keyof typeof en;
