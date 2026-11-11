import { expect, it, vi } from 'vitest';
import { createShutdownHandler } from './shutdown.js';

it('closes resources and exits cleanly once, ignoring duplicate signals', async () => {
  const close = vi.fn(async () => undefined);
  const exit = vi.fn();
  const log = vi.fn();
  const shutdown = createShutdownHandler({ close, exit, log });

  await shutdown('SIGTERM');
  await shutdown('SIGINT');

  expect(close).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(0);
  expect(log).toHaveBeenCalledWith('Received SIGTERM. Shutting down.');
});

it('exits with a failure code when closing rejects', async () => {
  const close = vi.fn(async () => {
    throw new Error('database is locked');
  });
  const exit = vi.fn();
  const log = vi.fn();
  const shutdown = createShutdownHandler({ close, exit, log });

  await shutdown('SIGTERM');

  expect(exit).toHaveBeenCalledWith(1);
  expect(log).toHaveBeenCalledWith('Shutdown failed: database is locked');
});

it('forces an exit when closing hangs past the timeout', async () => {
  vi.useFakeTimers();
  try {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const exit = vi.fn();
    const log = vi.fn();
    const shutdown = createShutdownHandler({ close, exit, log, timeoutMs: 5_000 });

    void shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith('Shutdown did not finish within 5000ms. Forcing exit.');
  } finally {
    vi.useRealTimers();
  }
});
