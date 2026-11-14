// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useViewPreferences } from './use-view-preferences';

afterEach(() => localStorage.clear());

it('defaults to compact tiles and keeps descriptions visible', () => {
  const { result } = renderHook(() => useViewPreferences());
  expect(result.current.view).toBe('tiles');
  expect(result.current.showDescriptions).toBe(true);
});

it('maps the older comfortable value to cards and compact to list', () => {
  localStorage.setItem('homora-density', 'comfortable');
  expect(renderHook(() => useViewPreferences()).result.current.view).toBe('cards');
  localStorage.setItem('homora-density', 'compact');
  expect(renderHook(() => useViewPreferences()).result.current.view).toBe('list');
});

it('saves the chosen view and descriptions preference', () => {
  const { result } = renderHook(() => useViewPreferences());
  act(() => result.current.setView('cards'));
  act(() => result.current.setShowDescriptions(false));
  expect(localStorage.getItem('homora-density')).toBe('cards');
  expect(localStorage.getItem('homora-descriptions')).toBe('hidden');
  expect(result.current.view).toBe('cards');
  expect(result.current.showDescriptions).toBe(false);
});

it('keeps a saved list choice and reads the new tiles value', () => {
  localStorage.setItem('homora-density', 'list');
  expect(renderHook(() => useViewPreferences()).result.current.view).toBe('list');
  localStorage.setItem('homora-density', 'tiles');
  expect(renderHook(() => useViewPreferences()).result.current.view).toBe('tiles');
});

it('saves how healthy groups and problems are handled', () => {
  const { result } = renderHook(() => useViewPreferences());
  expect(result.current.collapseHealthy).toBe(false);
  expect(result.current.problemsFirst).toBe(false);
  act(() => result.current.setCollapseHealthy(true));
  act(() => result.current.setProblemsFirst(true));
  expect(localStorage.getItem('homora-collapse-healthy')).toBe('on');
  expect(localStorage.getItem('homora-problems-first')).toBe('on');
  expect(result.current.collapseHealthy).toBe(true);
  expect(result.current.problemsFirst).toBe(true);
});
