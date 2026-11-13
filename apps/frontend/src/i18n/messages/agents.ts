import { en as agents } from './agent-management';
import { en as proposals } from './proposal-review';
import { ptBR as agentsPtBR } from './agent-management';
import { ptBR as proposalsPtBR } from './proposal-review';

/** Backward-compatible catalog facade assembled by interface capability. */
export const en = { ...agents, ...proposals } as const;
export const ptBR: Record<keyof typeof en, string> = { ...agentsPtBR, ...proposalsPtBR };
