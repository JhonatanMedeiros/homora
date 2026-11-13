// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { watchSession } from './session-guard';

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

const answer = (status: number) => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status })) as typeof fetch;
};

it('reports a 401 from an API route that needs a session', async () => {
  answer(401);
  const onExpired = vi.fn();
  watchSession(onExpired);
  await fetch('/api/services');
  expect(onExpired).toHaveBeenCalledTimes(1);
});

it('ignores a wrong password at sign-in and successful answers', async () => {
  const onExpired = vi.fn();
  answer(401);
  watchSession(onExpired);
  await fetch('/api/auth/sign-in/email', { method: 'POST' });
  answer(200);
  await fetch('/api/services');
  expect(onExpired).not.toHaveBeenCalled();
});

it('restores the original fetch when stopped', () => {
  answer(200);
  const before = globalThis.fetch;
  const stop = watchSession(vi.fn());
  expect(globalThis.fetch).not.toBe(before);
  stop();
  expect(globalThis.fetch).toBe(before);
});
