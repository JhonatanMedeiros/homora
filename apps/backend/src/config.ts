import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { parseDockerHost } from './discovery/index.js';
import { parseLogLevel } from './logger.js';
import { parsePasskeyRpId, resolvePasskeyConfig } from './passkey-config.js';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export function parseAllowedOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return [];
  const origins = value.split(',').map((part) => part.trim());
  if (origins.some((origin) => !origin)) throw new Error('Invalid allowed origin.');
  return [
    ...new Set(
      origins.map((origin) => {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          throw new Error('Invalid allowed origin.');
        }
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.origin !== origin ||
          parsed.username ||
          parsed.password ||
          (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))
        )
          throw new Error('Invalid allowed origin. Use HTTPS, or HTTP only on localhost.');
        return parsed.origin;
      }),
    ),
  ];
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
  const port = (value: string | undefined, fallback: number) => {
    const result = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(result) || result < 1 || result > 65535)
      throw new Error('Invalid port in configuration.');
    return result;
  };
  const apiPort = port(env.HOMORA_API_PORT, 3000);
  const webPort = port(env.HOMORA_WEB_PORT, 5173);
  if (apiPort === webPort) throw new Error('API and web interface ports must be different.');
  const bindHost = env.HOMORA_BIND_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(bindHost)) throw new Error('Invalid bind host.');
  const allowedOrigins = parseAllowedOrigins(env.HOMORA_ALLOWED_ORIGINS);
  const passkeyRpId = parsePasskeyRpId(env.HOMORA_PASSKEY_RP_ID);
  // Fails at startup when the domain has no matching HTTPS origin.
  resolvePasskeyConfig({ webPort, allowedOrigins, rpId: passkeyRpId });
  if (!['true', 'false', undefined, ''].includes(env.HOMORA_TRUST_PROXY))
    throw new Error('HOMORA_TRUST_PROXY must be true or false.');
  const sessionSecret = env.HOMORA_SESSION_SECRET || undefined;
  if (sessionSecret !== undefined && sessionSecret.length < 32)
    throw new Error('HOMORA_SESSION_SECRET must have at least 32 characters.');
  return {
    logLevel: parseLogLevel(env.HOMORA_LOG_LEVEL),
    bindHost,
    apiPort,
    webPort,
    allowedOrigins,
    passkeyRpId,
    sessionSecret,
    trustProxy: env.HOMORA_TRUST_PROXY === 'true',
    developmentMocks: env.HOMORA_DEV_MOCKS === 'true',
    dockerHost: parseDockerHost(env.HOMORA_DOCKER_HOST),
    databasePath: resolve(root, env.HOMORA_DATABASE_PATH || 'data/homora.sqlite'),
  };
}
