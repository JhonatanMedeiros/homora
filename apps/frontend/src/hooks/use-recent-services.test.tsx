// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { parseRecent, useRecentServices } from './use-recent-services';

afterEach(() => localStorage.clear());

it('keeps the newest first, without duplicates, up to five', () => {
  const { result } = renderHook(() => useRecentServices());
  for (const id of [1, 2, 3, 4, 5, 6, 3]) act(() => result.current.remember(id));
  expect(result.current.recent).toEqual([3, 6, 5, 4, 2]);
});

it('persists between reloads and survives corrupted data', () => {
  const first = renderHook(() => useRecentServices());
  act(() => first.result.current.remember(7));
  first.unmount();
  expect(renderHook(() => useRecentServices()).result.current.recent).toEqual([7]);
  expect(parseRecent('not json')).toEqual([]);
  expect(parseRecent('[1,"a",1,-2,2.5,3]')).toEqual([1, 3]);
});
