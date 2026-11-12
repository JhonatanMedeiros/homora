/** Existing tokens retain their permissions; new domains require explicit grants. */
export const AGENT_SCOPES = [
  'services:read',
  'agents:read',
  'agents:propose',
  'audit:read',
  'proxmox:read',
  'proposals:create',
  'groups:propose',
  'widgets:read',
  'widgets:propose',
  'integrations:read',
  'connections:propose',
  'discovery:read',
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
