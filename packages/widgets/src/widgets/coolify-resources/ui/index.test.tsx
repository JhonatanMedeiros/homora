// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WidgetHostProvider, type WidgetHost } from '../../../ui/host.js';
import { en } from '../messages.js';
import { defaultConfig } from '../definition.js';
import { widgetUI } from './index.js';
afterEach(cleanup);
const t = (key: string) => en[key as keyof typeof en] ?? key;
function show(connectionReading: WidgetHost['connectionReading']) {
  const View = widgetUI.View;
  return render(
    <WidgetHostProvider value={{ locale: 'en', t, connectionReading }}>
      <View config={defaultConfig} />
    </WidgetHostProvider>,
  );
}
it('shows raw unknown state and multiple links', () => {
  show({
    status: 'ready',
    stale: false,
    data: {
      resources: [
        {
          uuid: 'a',
          name: 'App',
          type: 'application',
          state: 'unknown',
          rawStatus: 'restarting',
          urls: ['https://one.example.test', 'https://two.example.test'],
        },
      ],
    },
  });
  expect(screen.getByText(/restarting/)).toBeTruthy();
  expect(screen.getAllByRole('link')).toHaveLength(2);
});
it('shows empty and authentication failure without links', () => {
  show({ status: 'ready', stale: false, data: { resources: [] } });
  expect(screen.getByText(en['coolifyResources.empty'])).toBeTruthy();
  cleanup();
  show({ status: 'error' });
  expect(screen.getByRole('alert').textContent).toBe(en['coolifyResources.error']);
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});

it('does not show cached links when a reading is stale', () => {
  show({
    status: 'ready',
    stale: true,
    data: {
      resources: [
        {
          uuid: 'a',
          name: 'App',
          type: 'application',
          state: 'running',
          rawStatus: 'running',
          urls: ['https://one.example.test'],
        },
      ],
    },
  });
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});
