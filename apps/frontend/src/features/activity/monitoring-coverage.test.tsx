// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MonitoringCoverage } from './monitoring-coverage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('loads on demand and presents reasons and review links', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        evaluatedAt: new Date().toISOString(),
        total: 2,
        truncated: false,
        items: [
          {
            id: 1,
            kind: 'service',
            reason: 'missing-target',
            observedAt: null,
            link: '/manage/services/1/edit',
          },
          { id: 2, kind: 'probe', reason: 'unknown', observedAt: null, link: '/manage/probes' },
        ],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<MonitoringCoverage />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: /revisar cobertura|review monitoring coverage/i }),
  );
  expect((await screen.findByRole('link', { name: /monitor 1/i })).getAttribute('href')).toBe(
    '/manage/services/1/edit',
  );
  expect(screen.getByRole('link', { name: /monitor 2/i }).getAttribute('href')).toBe(
    '/manage/probes',
  );
  expect(
    screen.getByText(/não significa que o monitor esteja desativado|not necessarily disabled/i),
  ).toBeTruthy();
});

it('reports a failed request and offers retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
  render(<MonitoringCoverage />);
  fireEvent.click(
    screen.getByRole('button', { name: /revisar cobertura|review monitoring coverage/i }),
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /atualizar cobertura|refresh coverage/i }),
  ).toBeTruthy();
});
