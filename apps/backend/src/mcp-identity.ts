import type { createProposalService } from './proposals.js';

/** Scopes that let an agent author a reviewable proposal. */
export const PROPOSAL_SCOPES = [
  'proposals:create',
  'maintenance:propose',
  'groups:propose',
  'widgets:propose',
  'connections:propose',
  'hosts:propose',
  'agents:propose',
] as const;

/**
 * Binds one agent token to scope enforcement. Authentication itself stays in the
 * agent identity service (via the proposal service); both transports only supply
 * the token, so revocation and rotation apply on the next call.
 */
export function createMcpIdentity(
  proposalService: ReturnType<typeof createProposalService>,
  token: () => string | undefined,
) {
  const authorize = (scope: string) => proposalService.authenticate(token(), scope);
  const proposalAuthor = () => PROPOSAL_SCOPES.map(authorize).find(Boolean) ?? null;
  return { token, authorize, proposalAuthor };
}
