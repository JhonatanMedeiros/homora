import { expect, it } from 'vitest';
import { renderManifestDisplay } from '@homora/integrations/frontend';
import { createPresentationCatalog } from '@homora/integrations/frontend/catalog';
import { jellyfinManifest, uptimeKumaManifest } from '@homora/integrations';

const translate = (_key: string | undefined, fallback: string, params?: Record<string, string>) =>
  fallback.replace(/\{(\w+)\}/g, (_, key: string) => params?.[key] ?? '');

it('provides built-in widget presentations and placeholders without host registrations', () => {
  const catalog = createPresentationCatalog((key) => key);
  expect(catalog.get('proxmox')?.stats({ unavailable: true })).toEqual([
    { label: 'stat.node', value: 'stat.nodeUnavailable' },
  ]);
  expect(
    catalog.get('coolify')?.stats({ total: 1, running: 1, degraded: 0, stopped: 0, unknown: 0 }),
  ).toEqual([
    { label: 'resources.stat.total', value: '1' },
    { label: 'resources.stat.running', value: '1' },
  ]);
  expect(catalog.get('__proto__')).toBeUndefined();
  expect(catalog.placeholderCount('jellyfin')).toBe(2);
  expect(catalog.placeholderCount('proxmox')).toBe(5);
});

it('renders manifest data with injected translation and rejects malformed data', () => {
  expect(
    renderManifestDisplay(jellyfinManifest.display, { name: 'Home', version: '1' }, translate),
  ).toEqual({
    summary: 'Server: Home · Version: 1',
    stats: [
      { label: 'Server', value: 'Home' },
      { label: 'Version', value: '1' },
    ],
  });
  expect(renderManifestDisplay(jellyfinManifest.display, { name: 1 }, translate)).toBeNull();
  expect(renderManifestDisplay(jellyfinManifest.display, [], translate)).toBeNull();
  expect(
    renderManifestDisplay(
      jellyfinManifest.display,
      { name: 'x'.repeat(1025), version: '1' },
      translate,
    ),
  ).toBeNull();
});

it('omits zero-valued optional metrics', () => {
  const result = renderManifestDisplay(
    uptimeKumaManifest.display,
    { up: 1, down: 0, pending: 0, maintenance: 0, unknown: 0 },
    translate,
  );
  expect(result?.stats).toEqual([
    { label: 'Up', value: '1' },
    { label: 'Down', value: '0' },
  ]);
});
