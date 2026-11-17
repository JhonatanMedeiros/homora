import { CORE_AGENT_SCOPES } from '@homora/shared';
import { integrationAgentScopeIds } from '@homora/integrations';

/** Existing tokens retain their permissions; new domains require explicit grants. */
export const AGENT_SCOPES = [...CORE_AGENT_SCOPES, ...integrationAgentScopeIds] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
