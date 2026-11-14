import { readFileSync } from 'node:fs';
import Fastify, { type FastifyBaseLogger } from 'fastify';

/** What modules need to log. A Fastify/pino logger satisfies it; tests and scripts can pass `noopLog`. */
export type Log = Pick<FastifyBaseLogger, 'debug' | 'info' | 'warn' | 'error'>;

const noop = () => undefined;
export const noopLog: Log = { debug: noop, info: noop, warn: noop, error: noop };

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined || value.trim() === '') return 'info';
  const level = value.trim().toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(level))
    throw new Error(`HOMORA_LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}.`);
  return level as LogLevel;
}

/**
 * Keys whose value never reaches the log, wherever they appear in a logged object. Request and
 * response bodies are not logged at all; this list is the second line of defence for values that
 * a future log call could attach by mistake. See ADR 0022.
 */
const secretKeys = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'sessionSecret',
  'apiKey',
  'privateKey',
  'passphrase',
  'credentials',
] as const;
const redactPaths = [
  ...secretKeys.flatMap((key) => {
    const accessor = /^[A-Za-z_]\w*$/.test(key) ? `.${key}` : `["${key}"]`;
    return [
      accessor.startsWith('.') ? key : accessor,
      `*${accessor}`,
      `*.*${accessor}`,
      `req.headers${accessor}`,
      `res.headers${accessor}`,
    ];
  }),
  'body',
  '*.body',
  'req.body',
];

export type LoggerOptions = {
  level?: LogLevel;
  /** Defaults to stdout. Tests pass a collecting stream. */
  stream?: { write(line: string): void };
};

/** Paths that must not produce a request log line (health checks run every few seconds). */
const quietPaths = new Set(['/api/health']);
export const isQuietRequest = (request: { url?: string }) =>
  quietPaths.has((request.url ?? '').split('?')[0]);

/**
 * Fastify's logger configuration: JSON lines on stdout, no request/response bodies and no query
 * strings (they can carry tokens), secrets redacted, and the original error kept with its stack.
 */
export function loggerConfig({ level = 'info', stream }: LoggerOptions = {}) {
  return {
    level,
    // ISO 8601 instead of epoch milliseconds, so lines are readable without tooling.
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    redact: { paths: redactPaths, censor: '[redacted]' },
    serializers: {
      req(request: { id?: string; method?: string; url?: string }) {
        return {
          method: request.method,
          url: (request.url ?? '').split('?')[0],
        };
      },
      res(reply: { statusCode?: number }) {
        return { statusCode: reply.statusCode };
      },
    },
    ...(stream ? { stream } : {}),
  };
}

/**
 * Builds the pino instance the whole process shares. Fastify constructs it from the options
 * above, so the process can log (migrations, fatal errors) before the application exists and
 * the application then adopts the same instance.
 */
export function createLogger(options: LoggerOptions = {}): FastifyBaseLogger {
  return Fastify({ logger: loggerConfig(options) }).log;
}

/** Build identity reported at startup and by `/api/health`. */
export function buildInfo(env: NodeJS.ProcessEnv = process.env) {
  let version = 'unknown';
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    if (manifest.version) version = manifest.version;
  } catch {
    // Not fatal: a build without the manifest still runs; the version just reads "unknown".
  }
  return { version, commit: env.HOMORA_BUILD_COMMIT || 'unknown' };
}
