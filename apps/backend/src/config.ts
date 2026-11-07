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
  return {
    bindHost,
    apiPort,
    webPort,
    databasePath: resolve(root, env.HOMORA_DATABASE_PATH || 'data/homora.sqlite'),
  };
}
