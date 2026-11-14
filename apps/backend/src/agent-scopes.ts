import { integrationAgentScopeIds } from '@homora/integrations';

/** Existing tokens retain their permissions; new domains require explicit grants. */
export const AGENT_SCOPES = [
  'services:read',
  'probes:read',
  'probes:propose',
  'incidents:read',
  'incidents:propose',
  'notifications:read',
  'organization:propose',
  'agents:read',
  'agents:propose',
  'audit:read',
  ...integrationAgentScopeIds,
  'proposals:create',
  'maintenance:propose',
  'groups:propose',
  'widgets:read',
  'widgets:propose',
  'integrations:read',
  'connections:propose',
  'discovery:read',
  'hosts:read',
  'hosts:propose',
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
