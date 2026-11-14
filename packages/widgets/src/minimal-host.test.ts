import { describe, expect, it } from 'vitest';
import { definePresenter, defineWidget, supportsSource } from '@homora/widgets';

describe('independent widget in a minimal host', () => {
  it('registers, validates, matches a source and presents synthetic data', () => {
    const definition = defineWidget({
      type: 'sample-counter',
      version: 1,
      locations: ['page'],
      source: { contract: 'sample-count', version: 1 },
      parseConfig(value: unknown) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const label = (value as Record<string, unknown>).label;
        return typeof label === 'string' && label.length > 0 && label.length <= 20
          ? { label }
          : null;
      },
    });
    const presentation = definePresenter({
      present: ({ config, count }: { config: { label: string }; count: number }) => ({
        text: `${config.label}: ${count}`,
      }),
    });
    const catalog = new Map([[definition.type, { definition, presentation }]]);
    const entry = catalog.get('sample-counter')!;
    const config = entry.definition.parseConfig({ label: 'Devices' });
    expect(config).toEqual({ label: 'Devices' });
    expect(entry.definition.parseConfig({ label: '' })).toBeNull();
    expect(entry.definition.parseConfig(null)).toBeNull();
    expect(supportsSource(entry.definition.source, { contract: 'sample-count', version: 1 })).toBe(
      true,
    );
    expect(supportsSource(entry.definition.source, { contract: 'sample-count', version: 2 })).toBe(
      false,
    );
    expect(supportsSource(entry.definition.source, { contract: 'other', version: 1 })).toBe(false);
    expect(entry.presentation.present({ config: config!, count: 4 })).toEqual({
      text: 'Devices: 4',
    });
  });
});
