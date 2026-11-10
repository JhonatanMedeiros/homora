import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env && existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
  const port = (value: string | undefined, fallback: number) => {
    const result = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(result) || result < 1 || result > 65535)
      throw new Error('Porta inválida na configuração.');
    return result;
  };
  const apiPort = port(env.HOMORA_API_PORT, 3000);
  const webPort = port(env.HOMORA_WEB_PORT, 5173);
  if (apiPort === webPort) throw new Error('As portas da API e da interface devem ser diferentes.');
  const bindHost = env.HOMORA_BIND_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(bindHost)) throw new Error('Endereço de escuta inválido.');
  const allowedOrigins = (env.HOMORA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of allowedOrigins) {
    let origin: URL;
    try {
      origin = new URL(value);
    } catch {
      throw new Error('Origem permitida inválida.');
    }
    if (
      !['https:', 'http:'].includes(origin.protocol) ||
      origin.origin !== value ||
      (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
    )
      throw new Error('Origem permitida inválida. Use HTTPS ou HTTP apenas em localhost.');
  }
  return {
    bindHost,
    apiPort,
    webPort,
    allowedOrigins,
    databasePath: resolve(root, env.HOMORA_DATABASE_PATH || 'data/homora.sqlite'),
  };
}
