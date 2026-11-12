// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ActivityFeed } from './activity-feed';
import { eventTitleKey, groupByDay, type ActivityEvent } from './activity-model';

afterEach(cleanup);

const base: ActivityEvent = {
  id: 1,
  createdAt: new Date(2026, 10, 11, 9, 12).getTime(),
  kind: 'access',
  action: 'login',
  outcome: 'success',
  actor: { type: 'user', name: 'Ana Lima' },
  detail: 'Chrome · Linux',
  ipAddress: '192.168.1.24',
  proposalId: null,
};

it('groups events by local day with today and yesterday labels', () => {
  const now = new Date(2026, 10, 11, 12, 0);
  const groups = groupByDay(
    [
      base,
      { ...base, id: 2, createdAt: new Date(2026, 10, 10, 22, 3).getTime() },
      { ...base, id: 3, createdAt: new Date(2026, 10, 1, 8, 0).getTime() },
    ],
    now,
  );
  expect(groups.map((group) => group.label === 'today' || group.label === 'yesterday')).toEqual([
    true,
    true,
    false,
  ]);
  expect(groups[0]?.label).toBe('today');
  expect(groups[1]?.label).toBe('yesterday');
});

it('picks a title per action and outcome, with a generic fallback', () => {
  expect(eventTitleKey({ action: 'login', outcome: 'failure' })).toBe(
    'activity.event.login.failure',
  );
  expect(eventTitleKey({ action: 'review', outcome: 'refused' })).toBe(
    'activity.event.review.refused',
  );
  expect(eventTitleKey({ action: 'logout', outcome: 'success' })).toBe('activity.event.logout');
  expect(eventTitleKey({ action: 'something-new', outcome: 'success' })).toBe(
    'activity.event.other',
  );
});

it('shows a failed sign-in with only the address and the attempt count', () => {
  render(
    <MemoryRouter>
      <ActivityFeed
        events={[
          {
            ...base,
            outcome: 'failure',
            actor: { type: 'anonymous', name: null },
            detail: '3',
            ipAddress: '192.168.1.77',
          },
        ]}
      />
    </MemoryRouter>,
  );
  expect(
    screen.getByText(
      (_, node) =>
        node?.textContent === '192.168.1.77 · 3 tentativas em 15 min' && node.tagName === 'P',
    ),
  ).toBeTruthy();
});

it('links an event that belongs to a proposal to the Agents tab', () => {
  render(
    <MemoryRouter>
      <ActivityFeed
        events={[
          { ...base, id: 5, kind: 'proposal', action: 'proposal', proposalId: 'p-1' },
          { ...base, id: 6 },
        ]}
      />
    </MemoryRouter>,
  );
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(1);
  expect(links[0]?.getAttribute('href')).toBe('/manage/agents');
});
