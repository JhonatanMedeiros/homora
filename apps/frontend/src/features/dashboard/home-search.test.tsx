// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { setHomeSearch, useHomeSearch } from './home-search';

afterEach(() => {
  cleanup();
  setHomeSearch('');
});

it('shares the typed text with every reader and clears it', () => {
  const a = renderHook(() => useHomeSearch());
  const b = renderHook(() => useHomeSearch());
  act(() => setHomeSearch('plex'));
  expect(a.result.current).toBe('plex');
  expect(b.result.current).toBe('plex');
  act(() => setHomeSearch(''));
  expect(a.result.current).toBe('');
});
