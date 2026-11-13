import { expect, it } from 'vitest';
import type { ActivityEvent } from '@/features/activity/activity-model';
import { agentEvents } from './agent-activity';
import { changedFieldLabels } from './proposal-diff';
import { permissionCounts, type Agent, type Proposal } from './agent-model';

const agent: Agent = {
  id: 'a1',
  name: 'Assistente',
  scopes: '["services:read","proposals:create","groups:propose"]',
  revokedAt: null,
};
const event = (id: number, over: Partial<ActivityEvent>): ActivityEvent => ({
  id,
  createdAt: id,
  kind: 'proposal',
  action: 'proposal',
  outcome: 'success',
  actor: { type: 'user', name: 'Ana' },
  detail: null,
  ipAddress: null,
  proposalId: null,
  ...over,
});

it('matches events by the agent id and by reviews of its proposals, never by name', () => {
  const proposals = [
    { id: 'p1', author: 'a1' },
    { id: 'p2', author: 'other' },
  ] as Proposal[];
  const events = [
    event(1, { actor: { type: 'agent', name: 'Assistente', id: 'a1' } }),
    event(2, { action: 'review', proposalId: 'p1' }),
    event(3, { action: 'review', proposalId: 'p2' }),
    event(4, { actor: { type: 'agent', name: 'Assistente', id: 'someone-else' } }),
  ];
  expect(agentEvents(agent, events, proposals).map((item) => item.id)).toEqual([1, 2]);
});

it('counts what an agent reads and what it may suggest', () => {
  expect(permissionCounts(agent)).toEqual({ read: 1, write: 2 });
});

it('names only the fields a proposal changes', () => {
  const diff = { op: 'update', id: 's', service: { name: 'B', url: 'http://x/' } };
  const labels = changedFieldLabels(
    diff as never,
    { id: 's', name: 'A', url: 'http://x/' } as never,
  );
  expect(labels).toHaveLength(1);
  expect(changedFieldLabels({ kind: 'agent' } as never)).toEqual([]);
});
