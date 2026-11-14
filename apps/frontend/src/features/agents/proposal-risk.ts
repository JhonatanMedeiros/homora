import type { MessageKey } from '@/i18n';
import { isDestructive, parseDiff, type Diff, type Proposal } from './agent-model';

/** How much a proposal deserves a careful look, from the most routine to the most serious. */
export type Risk = 'low' | 'attention' | 'access' | 'destructive';

const RANK: Record<Risk, number> = { low: 0, attention: 1, access: 2, destructive: 3 };

export const RISK_LABELS: Record<Risk, MessageKey> = {
  low: 'proposal.risk.low',
  attention: 'proposal.risk.attention',
  access: 'proposal.risk.access',
  destructive: 'proposal.risk.destructive',
};

/** Managed operations that only reorganize what is already on the dashboard. */
const ROUTINE_MANAGED = new Set(['group', 'card-order']);

/** Classifies the change a proposal asks for, from its diff alone. */
export function diffRisk(diff: Diff | null): Risk {
  if (!diff) return 'attention';
  if (isDestructive(diff)) return 'destructive';
  if (diff.kind === 'agent') return 'access';
  if (diff.kind === 'managed') {
    const kind = diff.change?.kind;
    if (kind === 'connection-setup') return 'access';
    return kind && ROUTINE_MANAGED.has(kind) ? 'low' : 'attention';
  }
  if (diff.op === 'create' || diff.op === 'update') {
    // Private-network monitoring and skipped TLS validation widen what Homora reaches.
    const service = diff.service;
    return service?.allowPrivate || service?.checkInsecure ? 'attention' : 'low';
  }
  return 'attention';
}

export const proposalRisk = (proposal: Proposal) => diffRisk(parseDiff(proposal.diff));

/** The most serious risk of several proposals, as for a batch decided together. */
export function highestRisk(risks: Risk[]): Risk {
  return risks.reduce<Risk>((top, risk) => (RANK[risk] > RANK[top] ? risk : top), 'low');
}

/** Removing something or widening an agent's access is confirmed by holding the button. */
export const needsHold = (risk: Risk) => risk === 'destructive' || risk === 'access';
