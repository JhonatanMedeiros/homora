// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WidgetHostProvider, type WidgetHost, type WidgetSourceParams } from '../../../ui/host.js';
import { defaultConfig, type Config } from '../definition.js';
import { en } from '../messages.js';
import { widgetUI } from './index.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(
  config: Config,
  options: { connectionId?: number | null; readSource?: WidgetHost['readSource'] } = {},
) {
  const View = widgetUI.View;
  return render(
    <WidgetHostProvider
      value={{
        locale: 'en-US',
        connectionId: options.connectionId,
        readSource: options.readSource,
        t: (key, params) =>
          params
            ? `${en[key as keyof typeof en] ?? key}:${Object.values(params).join(',')}`
            : (en[key as keyof typeof en] ?? key),
      }}
    >
      <View config={config} />
    </WidgetHostProvider>,
  );
}

it('shows selected entity states and timestamps, including per-entity missing results', async () => {
  const data = {
    entities: [
      {
        entityId: 'sensor.temperature',
        status: 'ready' as const,
        state: '21.5',
        lastUpdated: '2026-01-01T10:00:00+00:00',
        attributes: { latitude: 0 },
      },
      { entityId: 'light.living_room', status: 'not-found' as const },
    ],
    fetchedAt: 1,
    stale: false,
  };
  const readSource: NonNullable<WidgetHost['readSource']> = vi.fn(
    async <T,>(_contract: string, _params: WidgetSourceParams, _signal: AbortSignal) => data as T,
  );
  show({ entities: ['sensor.temperature', 'light.living_room'] }, { connectionId: 7, readSource });
  expect(await screen.findByText('21.5')).toBeTruthy();
  expect(screen.getByText('Not found')).toBeTruthy();
  expect(screen.getByText('sensor.temperature')).toBeTruthy();
  expect(screen.queryByText(/latitude/)).toBeNull();
  expect(readSource).toHaveBeenCalledWith(
    'home-assistant-entities',
    { connectionId: 7, entities: 'sensor.temperature,light.living_room' },
    expect.any(AbortSignal),
  );
  expect(document.querySelector('time')?.getAttribute('datetime')).toBe(
    '2026-01-01T10:00:00+00:00',
  );
});

it('marks cached data stale and shows errors when no result is available', async () => {
  const readSource: NonNullable<WidgetHost['readSource']> = vi.fn(
    async <T,>() =>
      ({
        entities: [
          { entityId: 'sensor.temperature', status: 'ready', state: '21.5', lastUpdated: null },
        ],
        fetchedAt: 1,
        stale: true,
      }) as T,
  );
  show({ entities: ['sensor.temperature'] }, { connectionId: 2, readSource });
  expect(await screen.findByText('21.5')).toBeTruthy();
  expect(screen.getByText('Showing the last successful reading.')).toBeTruthy();

  cleanup();
  const failedRead: NonNullable<WidgetHost['readSource']> = vi.fn(async () => {
    throw new Error('unavailable');
  });
  show({ entities: ['sensor.temperature'] }, { connectionId: 2, readSource: failedRead });
  expect(await screen.findByRole('alert')).toBeTruthy();
});

it('requires a Home Assistant connection', () => {
  show({ entities: ['sensor.temperature'] });
  expect(
    screen.getByText('Choose a Home Assistant connection to load these entities.'),
  ).toBeTruthy();
});

it('exposes an accessible entity editor and prevents invalid configuration saves', () => {
  const onChange = vi.fn();
  const Editor = widgetUI.Editor;
  render(
    <WidgetHostProvider value={{ locale: 'en', t: (key) => en[key as keyof typeof en] ?? key }}>
      <Editor config={defaultConfig} onChange={onChange} />
    </WidgetHostProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Entity IDs' });
  fireEvent.change(input, { target: { value: 'sensor.temperature\nbad id' } });
  expect(onChange).toHaveBeenCalledWith({ entities: ['sensor.temperature', 'bad id'] });
  expect(widgetUI.canSubmit?.({ entities: ['bad id'] })).toBe(false);
  expect(widgetUI.canSubmit?.({ entities: ['sensor.temperature'] })).toBe(true);
});
