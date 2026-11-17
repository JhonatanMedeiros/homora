import { expect, it } from 'vitest';
import {
  defineWidget,
  isInternalSource,
  isPortableWidget,
  monitoringSources,
  supportsSource,
  type MonitoringSummary,
} from './index.js';

it('lets a minimal host resolve only exact, versioned internal contracts', () => {
  const widget = defineWidget({
    type: 'synthetic',
    version: 1,
    locations: ['page'],
    source: monitoringSources.summary,
    parseConfig: (value: unknown) => value,
  });
  const host = new Map([
    [
      monitoringSources.summary.contract,
      {
        source: monitoringSources.summary,
        read: (): MonitoringSummary => ({
          generatedAt: 1,
          counts: { down: 0, degraded: 0, ok: 0, maintenance: 0, blocked: 0, unknown: 0 },
          stale: 0,
          measurementFailure: false,
        }),
      },
    ],
  ]);
  const reader = host.get(widget.source!.contract)!;
  expect(supportsSource(widget.source, reader.source)).toBe(true);
  expect(reader.read().counts.down).toBe(0);
  expect(isInternalSource(widget.source)).toBe(true);
  expect(isPortableWidget(widget)).toBe(true);
  expect(isInternalSource({ ...monitoringSources.summary, version: 2 })).toBe(false);
  expect(supportsSource(widget.source, { ...monitoringSources.summary, version: 2 })).toBe(false);
  expect(
    isPortableWidget({ ...widget, source: { contract: 'integration:sample', version: 1 } }),
  ).toBe(false);
});
