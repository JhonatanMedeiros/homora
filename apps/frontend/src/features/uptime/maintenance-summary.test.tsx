// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MaintenanceSummary } from './maintenance-summary';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows unknown when there is no usable observation instead of claiming recovery', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          state: 'insufficient',
          observedAt: null,
          evaluatedAt: new Date().toISOString(),
        }),
      ),
    ),
  );
  render(<MaintenanceSummary serviceId={1} windowId={2} now={Date.now()} />);
  fireEvent.click(screen.getByRole('button', { name: /revisar observações|review observations/i }));
  expect(await screen.findByText(/resultado é desconhecido|outcome is unknown/i)).toBeTruthy();
  expect(screen.getByText(/não comprova recuperação|does not establish recovery/i)).toBeTruthy();
});
