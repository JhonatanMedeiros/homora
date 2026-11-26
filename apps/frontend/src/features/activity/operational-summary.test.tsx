// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperationalSummary } from './operational-summary';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('loads incident evidence on request and lets the user change the period', async () => {
  const fetchMock = vi.fn(
    async (_url: string) =>
      new Response(
        JSON.stringify({
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-02T00:00:00Z',
          truncated: false,
          evidence: {
            version: 1,
            evaluatedAt: '2026-01-02T00:00:00Z',
            items: [
              {
                id: 'incident:1:opened',
                kind: 'fact',
                subject: { type: 'monitor', id: '1' },
                observedAt: '2026-01-01T12:00:00Z',
                link: '/services/1',
                attributes: { event: 'opened' },
              },
            ],
          },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<OperationalSummary />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: /mostrar mudanças|show monitoring changes/i }),
  );
  expect((await screen.findByRole('link', { name: /monitor 1/i })).getAttribute('href')).toBe(
    '/services/1',
  );
  expect(screen.getByText(/pode estar incompleto|may be incomplete/i)).toBeTruthy();
  expect(screen.getByText(/pode estar desatualizado|may be out of date/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^atualizar$|^refresh$/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('radio', { name: /7 dias|7 days/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(fetchMock.mock.calls[2]?.[0]).toContain('range=7d');
});

it('reports failure and allows retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
  render(<OperationalSummary />);
  fireEvent.click(
    screen.getByRole('button', { name: /mostrar mudanças|show monitoring changes/i }),
  );
  expect((await screen.findByRole('alert')).textContent).toMatch(
    /não foi possível|could not load/i,
  );
});

it('opens the exact probe incident and reports when it has disappeared', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/operational-summary'))
      return new Response(
        JSON.stringify({
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-02T00:00:00Z',
          truncated: false,
          evidence: {
            version: 1,
            evaluatedAt: '2026-01-02T00:00:00Z',
            items: [
              {
                id: 'incident:42:opened',
                kind: 'fact',
                subject: { type: 'monitor', id: '7' },
                observedAt: '2026-01-01T12:00:00Z',
                link: null,
                attributes: { event: 'opened' },
              },
            ],
          },
        }),
        { status: 200 },
      );
    return new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<OperationalSummary />);
  fireEvent.click(
    screen.getByRole('button', { name: /mostrar mudanças|show monitoring changes/i }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: /ver incidente do monitor 7|view incident for monitor 7/i,
    }),
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(await screen.findByText(/não está mais disponível|no longer available/i)).toBeTruthy();
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/services/7/incidents/42');
});
