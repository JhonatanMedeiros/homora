import { expect, it, vi } from 'vitest';
import { defineWidget } from '@homora/widgets';
import { parseTransfer, serializeConfiguration } from './index.js';

vi.mock('@homora/integrations', async () => {
  const { defineWidget } = await import('@homora/widgets');
  const synthetic = defineWidget({
    type: 'synthetic',
    version: 1,
    locations: ['page'],
    source: null,
    portable: true,
    sizes: ['normal', 'wide'],
    parseConfig: (value: unknown) => value,
  });
  return { resolveWidget: (type: string) => (type === 'synthetic' ? synthetic : undefined) };
});

it('round-trips wide and defaults old files to normal', () => {
  const widget = {
    page: 'Home',
    type: 'synthetic',
    name: 'Sample',
    config: {},
    size: 'wide' as const,
  };
  for (const format of ['json', 'yaml'] as const) {
    const text = serializeConfiguration([], [], format, { pages: ['Home'], widgets: [widget] });
    expect(parseTransfer(text).document.widgets).toEqual([widget]);
    const old = serializeConfiguration([], [], format, {
      pages: ['Home'],
      widgets: [{ ...widget, size: undefined }],
    });
    expect(parseTransfer(old).document.widgets?.[0]?.size).toBe('normal');
  }
});

it('defaults definitions and rejects invalid sizes', () => {
  const base = {
    type: 'sample',
    version: 1,
    locations: ['page'] as const,
    source: null,
    parseConfig: (value: unknown) => value,
  };
  expect(defineWidget(base).sizes).toEqual(['normal']);
  expect(() => defineWidget({ ...base, sizes: ['wide'] })).toThrow();
});
