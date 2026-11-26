// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { IncidentInvestigationDialog } from './incident-investigation-dialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows cited facts, a qualified hypothesis, missing data and proposed next steps', async () => {
  const at = '2026-01-01T12:00:00Z';
  const base = {
    version: 1,
    subject: { type: 'monitor', id: '1' },
    evaluatedAt: at,
    link: null,
    attributes: {},
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          incidentId: 1,
          monitorId: 1,
          from: at,
          to: at,
          truncated: false,
          evidence: {
            version: 1,
            evaluatedAt: at,
            items: [
              {
                ...base,
                id: 'incident:1:opened',
                kind: 'fact',
                source: 'monitor-incident',
                observedAt: at,
                freshness: 'historical',
                confidence: 'confirmed',
                summary: 'event',
                attributes: { event: 'opened' },
              },
              {
                ...base,
                id: 'incident:2:overlap',
                kind: 'fact',
                source: 'monitor-incident',
                observedAt: at,
                freshness: 'historical',
                confidence: 'confirmed',
                summary: 'event',
                attributes: { event: 'overlap' },
              },
              {
                ...base,
                id: 'hypothesis:1',
                kind: 'hypothesis',
                source: 'temporal-correlation',
                observedAt: null,
                freshness: 'historical',
                confidence: 'inferred',
                summary: 'hypothesis',
                evidenceIds: ['incident:1:opened', 'incident:2:overlap'],
              },
              {
                ...base,
                id: 'gap:1',
                kind: 'unknown',
                source: 'coverage-assessment',
                observedAt: null,
                freshness: 'unknown',
                confidence: 'unknown',
                summary: 'gap',
                missing: ['root-cause', 'complete-history'],
              },
            ],
          },
        }),
        { status: 200 },
      ),
    ),
  );
  render(<IncidentInvestigationDialog incidentId={1} onClose={() => {}} />);
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText(/coincidência de horários|timing alone/i)).toBeTruthy();
  expect(within(dialog).getByRole('link', { name: 'incident:1:opened' }).getAttribute('href')).toBe(
    '#evidence-incident:1:opened',
  );
  expect(within(dialog).getByText(/causa raiz é desconhecida|root cause is unknown/i)).toBeTruthy();
  expect(
    within(dialog).getByText(/verifique as dependências|verify relevant dependencies/i),
  ).toBeTruthy();
});

it('reports an unavailable incident instead of claiming no events', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  render(<IncidentInvestigationDialog incidentId={1} onClose={() => {}} />);
  expect(await screen.findByRole('alert')).toBeTruthy();
});

it('rejects a malformed response instead of rendering untrusted evidence', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          incidentId: 1,
          monitorId: 1,
          from: null,
          to: null,
          truncated: false,
          evidence: {
            version: 1,
            evaluatedAt: '2026-01-01T12:00:00Z',
            items: [
              {
                id: 'incident:1:opened',
                version: 1,
                kind: 'fact',
                source: 'monitor-incident',
                subject: { type: 'monitor', id: '1' },
                observedAt: '2026-01-01T12:00:00Z',
                evaluatedAt: '2026-01-01T12:00:00Z',
                freshness: 'historical',
                confidence: 'confirmed',
                summary: 'Synthetic',
                link: 'javascript:alert(1)',
                attributes: { event: 'opened' },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    ),
  );
  render(<IncidentInvestigationDialog incidentId={1} onClose={() => {}} />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /abrir detalhes|open service details/i })).toBeNull();
});
