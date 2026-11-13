import type { ActivityEvent } from '@/features/activity/activity-model';
import type { Agent, Proposal } from './agent-model';

/**
 * The audited events that belong to an agent: what it did itself, and the reviews of what it
 * suggested. Reads are not audited, so a read-only agent has no activity here.
 */
export function agentEvents(
  agent: Agent,
  events: ActivityEvent[],
  proposals: Proposal[],
): ActivityEvent[] {
  const own = new Set(proposals.filter((p) => p.author === agent.id).map((p) => p.id));
  return events.filter(
    (event) =>
      event.actor.id === agent.id || (event.proposalId !== null && own.has(event.proposalId)),
  );
}
