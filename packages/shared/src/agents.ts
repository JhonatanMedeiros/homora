/** Built-in agent scopes independent of integration-specific scopes. */
export const CORE_AGENT_SCOPES = [
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
  'proposals:create',
  'maintenance:propose',
  'public-status:propose',
  'groups:propose',
  'widgets:read',
  'widgets:propose',
  'integrations:read',
  'connections:propose',
  'discovery:read',
  'hosts:read',
  'hosts:propose',
] as const;

export type CoreAgentScope = (typeof CORE_AGENT_SCOPES)[number];
