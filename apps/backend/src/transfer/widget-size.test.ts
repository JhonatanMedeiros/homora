import { expect, it, vi } from 'vitest';
import { defineWidget } from '@homora/widgets';
import { parseTransfer, planImport, serializeConfiguration } from './index.js';

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
  const internal = {
    ...synthetic,
    type: 'internal',
    source: { contract: 'homora:monitoring-summary', version: 1 },
    portable: false,
  };
  return {
    resolveWidget: (type: string) =>
      type === 'synthetic' ? synthetic : type === 'internal' ? internal : undefined,
  };
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

it('imports internal sources as local, with no connection descriptor', () => {
  const widget = {
    page: 'Home',
    type: 'internal',
    name: 'Monitor',
    config: {},
    size: 'normal' as const,
  };
  const text = serializeConfiguration([], [], 'json', { pages: ['Home'], widgets: [widget] });
  expect(text).not.toContain('connectionId');
  const parsed = parseTransfer(text);
  expect(parsed.issues).toEqual([]);
  expect(parsed.document.widgets).toEqual([widget]);
  expect(planImport(parsed, { groups: [], services: [], pages: ['Home'] }).widgets[0].status).toBe(
    'new',
  );
});
