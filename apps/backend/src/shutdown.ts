type ShutdownOptions = {
  /** Releases the resources that must be drained before the process exits. */
  close: () => Promise<void>;
  exit: (code: number) => void;
  /** Safety net for a hanging close; the container would be killed anyway. */
  timeoutMs?: number;
  log?: (message: string) => void;
};

/**
 * Builds the SIGTERM/SIGINT handler for the API process.
 *
 * Docker sends SIGTERM to PID 1 and waits for the stop grace period before
 * sending SIGKILL. A Node process running as PID 1 does not terminate on
 * SIGTERM by itself (the kernel ignores default signal dispositions for PID 1),
 * so every deployment used to burn the full grace period. Closing Fastify
 * drains in-flight requests, stops the service monitor and closes the database
 * through the `onClose` hooks before the process exits explicitly.
 */
export function createShutdownHandler({
  close,
  exit,
  timeoutMs = 10_000,
  log = console.log,
}: ShutdownOptions) {
  let closing = false;
  return async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (closing) return;
    closing = true;
    log(`Received ${signal}. Shutting down.`);
    const forceExit = setTimeout(() => {
      log(`Shutdown did not finish within ${timeoutMs}ms. Forcing exit.`);
      exit(1);
    }, timeoutMs);
    forceExit.unref();
    try {
      await close();
      clearTimeout(forceExit);
      exit(exitCode);
    } catch (error) {
      clearTimeout(forceExit);
      log(`Shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      exit(1);
    }
  };
}

/**
 * Last-resort handlers: an uncaught exception or unhandled rejection leaves the process in an
 * unknown state, so it is logged with its stack and the process closes in a controlled way and
 * exits non-zero, letting the container restart policy bring it back.
 */
export function installFatalErrorHandlers({
  on = (event, listener) => void process.on(event, listener),
  logFatal,
  shutdown,
}: {
  on?: (
    event: 'uncaughtException' | 'unhandledRejection',
    listener: (error: unknown) => void,
  ) => void;
  logFatal: (error: unknown, event: string) => void;
  shutdown: (signal: string, exitCode: number) => Promise<void>;
}) {
  for (const event of ['uncaughtException', 'unhandledRejection'] as const)
    on(event, (error) => {
      logFatal(error, event);
      void shutdown(event, 1);
    });
}
