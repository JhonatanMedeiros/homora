import { expect, it } from 'vitest';
import { textDiff } from './proposal-text-diff';

it('isolates the part that changed', () => {
  expect(textDiff('http://jellyfin.lan:8096', 'http://jellyfin.lan:8920')).toEqual({
    prefix: 'http://jellyfin.lan:8',
    before: '096',
    after: '920',
    suffix: '',
  });
});
it('keeps a shared ending', () => {
  expect(textDiff('a.lan/x', 'b.lan/x')?.suffix).toBe('.lan/x');
});
it('skips values with nothing in common or nothing to compare', () => {
  expect(textDiff('Plex', 'Jellyfin')).toBeNull();
  expect(textDiff('', 'x')).toBeNull();
  expect(textDiff('same', 'same')).toBeNull();
});
