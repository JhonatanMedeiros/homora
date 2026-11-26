// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperationalSummary } from './operational-summary';
import { setLocale } from '@/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('pt-BR');
});

it.each(['en', 'pt-BR'] as const)(
  'resolves service names locally with fallback in %s',
  async (locale) => {
    setLocale(locale);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url === '/api/services'
                ? [{ id: 1, name: 'Synthetic service' }]
                : {
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
                        {
                          id: 'incident:2:opened',
                          kind: 'fact',
                          subject: { type: 'monitor', id: '2' },
                          observedAt: '2026-01-01T12:00:00Z',
                          link: null,
                          attributes: { event: 'opened' },
                        },
                      ],
                    },
                  },
            ),
          ),
      ),
    );
    render(<OperationalSummary />);
    fireEvent.click(
      screen.getByRole('button', { name: /mostrar mudanças|show monitoring changes/i }),
    );
    expect(await screen.findByRole('link', { name: 'Synthetic service' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /synthetic service/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /monitor 2/i }).length).toBeGreaterThan(0);
  },
);

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
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/operational-summary')),
    ).toHaveLength(2),
  );
  fireEvent.click(screen.getByRole('radio', { name: /7 dias|7 days/i }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/operational-summary')),
    ).toHaveLength(3),
  );
  expect(fetchMock.mock.calls.some(([url]) => url.includes('range=7d'))).toBe(true);
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
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/services/7/incidents/42')).toBe(true);
});

it('shows the selected probe incident without displaying unrelated records', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
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
      return new Response(
        JSON.stringify({ id: 42, serviceId: 7, startedAt: 1767268800000, endedAt: null }),
        { status: 200 },
      );
    }),
  );
  render(<OperationalSummary />);
  fireEvent.click(
    screen.getByRole('button', { name: /mostrar mudanças|show monitoring changes/i }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: /ver incidente do monitor 7|view incident for monitor 7/i,
    }),
  );
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog.textContent).toMatch(/em andamento|in progress/i));
});
