// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WidgetHostProvider, type WidgetHost } from '../../../ui/host.js';
import { en } from '../messages.js';
import { widgetUI } from './index.js';

afterEach(cleanup);
const t = (key: string) => en[key as keyof typeof en] ?? key;
function show(connectionReading: WidgetHost['connectionReading'], group = '') {
  const View = widgetUI.View;
  return render(
    <WidgetHostProvider value={{ locale: 'en', t, connectionReading }}>
      <View config={{ group, limit: 10 }} />
    </WidgetHostProvider>,
  );
}
it('renders text states and groups from a connection', () => {
  show({
    status: 'ready',
    stale: false,
    data: {
      monitors: [
        { id: 1, name: 'Web', group: 'Services', status: 'up' },
        { id: 2, name: 'DB', group: 'Services', status: 'down' },
      ],
    },
  });
  expect(
    screen.getByText('Reported by Uptime Kuma · Only published monitors are visible'),
  ).toBeTruthy();
  expect(screen.getByText('Up')).toBeTruthy();
  expect(screen.getByText('Down')).toBeTruthy();
});
it('renders empty, failed, and stale readings', () => {
  const data = { monitors: [{ id: 1, name: 'Web', group: 'Services', status: 'up' }] };
  show({ status: 'ready', stale: true, data }, 'Other');
  expect(screen.getByText(en['kumaMonitors.empty'])).toBeTruthy();
  expect(screen.getByText(en['kumaMonitors.stale'])).toBeTruthy();
  cleanup();
  show({ status: 'error' });
  expect(screen.getByRole('alert').textContent).toBe(en['kumaMonitors.error']);
});
