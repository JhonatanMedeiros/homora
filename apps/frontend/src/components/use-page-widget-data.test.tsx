// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { usePageWidgetData } from './use-page-widget-data';

vi.mock('@homora/widgets/registry', () => ({
  getWidget: (type: string) =>
    type === 'inventory-example' ? { connectionData: 'resources' } : undefined,
}));
vi.mock('@/components/widget-ui-registry', () => ({ getWidgetUI: () => ({}) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('deduplicates inventory reads and discards the old inventory after an error', async () => {
  let fail = false;
  const widgets = [1, 2].map((id) => ({
    id,
    pageId: 1,
    type: 'inventory-example',
    name: '',
    config: {},
    connectionId: 7,
    position: id,
    version: 1,
    size: 'normal',
  }));
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/page-widgets' && options?.method === 'POST') {
      fail = true;
      return { ok: true };
    }
    if (url === '/api/page-widgets')
      return { ok: true, json: async () => widgets.map((widget) => ({ ...widget })) };
    if (url === '/api/connections')
      return { ok: true, json: async () => [{ id: 7, name: 'Example' }] };
    if (url === '/api/connections/7/resources')
      return fail
        ? { ok: false }
        : { ok: true, json: async () => ({ data: { resources: [{ name: 'Example' }] } }) };
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => usePageWidgetData(1));
  await waitFor(() => expect(result.current.readings[1]?.status).toBe('ready'));
  expect(result.current.readings[2]?.status).toBe('ready');
  expect(
    fetchMock.mock.calls.filter(([url]) => url === '/api/connections/7/resources'),
  ).toHaveLength(1);
  await act(async () => {
    await result.current.change('/api/page-widgets', 'POST', {});
  });
  await waitFor(() => expect(result.current.readings[1]?.status).toBe('error'));
  expect(result.current.readings[2]?.status).toBe('error');
});
