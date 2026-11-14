// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { onProblemsRequest, requestProblemsView, takeProblemsRequest } from './home-intent';

it('remembers the request until the Home takes it, once', () => {
  expect(takeProblemsRequest()).toBe(false);
  requestProblemsView();
  expect(takeProblemsRequest()).toBe(true);
  expect(takeProblemsRequest()).toBe(false);
});

it('tells a mounted Home right away and stops after unsubscribing', () => {
  const listener = vi.fn();
  const off = onProblemsRequest(listener);
  requestProblemsView();
  expect(listener).toHaveBeenCalledOnce();
  off();
  requestProblemsView();
  expect(listener).toHaveBeenCalledOnce();
  takeProblemsRequest();
});
