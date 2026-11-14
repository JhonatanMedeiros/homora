// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Service } from '@homora/shared';
import { AlertsBell } from './alerts-bell';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const services = [1, 2, 3].map((id) => ({ id, name: `S${id}` }) as Service);
const down = { status: 'unavailable' as const, lastAttempt: null };
const up = { status: 'available' as const, lastAttempt: null };

function stub(acks: object = {}, open: object = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/acknowledgements') return new Response(JSON.stringify(acks));
      if (url === '/api/status-overview')
        return new Response(
          JSON.stringify({
            generatedAt: '',
            settings: {},
            open,
            incidents7d: 0,
            incidentsPrevious7d: 0,
            mttrMs: null,
            longestCleanMs: 0,
            sla: { targetPct: 99.9, actualPct: null },
          }),
        );
      return new Response('{}', { status: 404 });
    }),
  );
}

it('counts offline services and says so in words', () => {
  stub();
  render(
    <AlertsBell
      services={services}
      statuses={{ 1: down, 2: down, 3: up }}
      blockedIds={new Set()}
      onOpen={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: /2 fora do ar/ })).toBeTruthy();
});

it('says nothing is offline when all is well, and ignores blocked services', () => {
  stub();
  render(
    <AlertsBell
      services={services}
      statuses={{ 1: down, 2: up, 3: up }}
      blockedIds={new Set([1])}
      onOpen={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: /nada fora do ar/ })).toBeTruthy();
});

it('drops a service that was acknowledged for its current incident', async () => {
  stub(
    { 1: { incidentId: 7, acknowledgedAt: 1, mutedUntil: null } },
    {
      1: {
        id: 7,
        serviceId: 1,
        startedAt: 1,
        endedAt: null,
        reason: 'x',
        httpStatus: null,
        failedChecks: 1,
      },
    },
  );
  render(
    <AlertsBell
      services={services}
      statuses={{ 1: down, 2: down, 3: up }}
      blockedIds={new Set()}
      onOpen={() => {}}
    />,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: /1 fora do ar/ })).toBeTruthy());
});
