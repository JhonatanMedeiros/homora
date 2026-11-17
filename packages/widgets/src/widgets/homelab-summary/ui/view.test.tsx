// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WidgetHostProvider } from '../../../ui/host.js';
import { defaultHomelabSummaryConfig } from '../definition.js';
import { widgetUI } from './index.js';

afterEach(cleanup);
it('labels every state and sends the selected state to the host', async () => {
  const filterStatus = vi.fn();
  const View = widgetUI.View;
  render(
    <WidgetHostProvider
      value={{
        locale: 'en',
        t: (key) => key,
        monitoring: {
          readScopes: async () => ({ groups: [], pages: [] }),
          readSummary: async () => ({
            generatedAt: Date.now(),
            stale: 0,
            measurementFailure: false,
            counts: { ok: 3, degraded: 1, down: 2, maintenance: 1, blocked: 1, unknown: 1 },
          }),
          filterStatus,
        },
      }}
    >
      <View config={defaultHomelabSummaryConfig} />
    </WidgetHostProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('2 summary.unmeasured'),
  );
  fireEvent.click(screen.getByRole('button', { name: /summary.down/ }));
  expect(filterStatus).toHaveBeenCalledWith('down');
});
