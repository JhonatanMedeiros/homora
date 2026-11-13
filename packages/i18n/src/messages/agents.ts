import { en as agents } from './agent-management.js';
import { en as proposals } from './proposal-review.js';
import { ptBR as agentsPtBR } from './agent-management.js';
import { ptBR as proposalsPtBR } from './proposal-review.js';

/** Backward-compatible catalog facade assembled by interface capability. */
export const en = { ...agents, ...proposals } as const;
export const ptBR: Record<keyof typeof en, string> = { ...agentsPtBR, ...proposalsPtBR };
