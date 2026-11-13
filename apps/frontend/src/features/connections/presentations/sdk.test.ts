import { expect, it } from 'vitest';
import { renderManifestDisplay } from '@homora/integrations/frontend';
import { jellyfinManifest, uptimeKumaManifest } from '@homora/integrations';

const translate = (_key: string | undefined, fallback: string, params?: Record<string, string>) =>
  fallback.replace(/\{(\w+)\}/g, (_, key: string) => params?.[key] ?? '');

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
