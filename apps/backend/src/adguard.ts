import type { IntegrationAdapter } from './integrations.js';

export type AdGuardConfig = { url: string; username: string; password: string };
export type AdGuardStatus = { running: boolean; protectionEnabled: boolean; version: string };
type Transport = (request: {
  origin: string;
  path: string;
  authorization: string;
}) => Promise<{ status: number; body: unknown }>;
const hasControl = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

function validate(config: AdGuardConfig): AdGuardConfig {
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw new Error('Informe uma URL HTTPS válida para o AdGuard Home.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Informe uma origem HTTPS sem caminho ou credenciais.');
  if (
    typeof config.username !== 'string' ||
    !config.username ||
    config.username.length > 256 ||
    config.username.includes(':') ||
    hasControl(config.username) ||
    typeof config.password !== 'string' ||
    !config.password ||
    config.password.length > 4096 ||
    hasControl(config.password)
  )
    throw new Error('Informe usuário e senha válidos para o AdGuard Home.');
  return { url: url.origin, username: config.username, password: config.password };
}

/** The injected transport must enforce network policy, TLS and response limits. */
export function createAdGuardAdapter(
  transport: Transport,
): IntegrationAdapter<AdGuardConfig, AdGuardStatus> {
  return {
    type: 'adguard-home',
    label: 'AdGuard Home',
    capabilities: ['dns-status'],
    validate,
    async collect(config) {
      const safe = validate(config);
      let response: { status: number; body: unknown };
      try {
        response = await transport({
          origin: safe.url,
          path: '/control/status',
          authorization: `Basic ${Buffer.from(`${safe.username}:${safe.password}`, 'utf8').toString('base64')}`,
        });
      } catch {
        throw new Error('Não foi possível conectar ao AdGuard Home.');
      }
      if (response.status === 401 || response.status === 403)
        throw new Error('O AdGuard Home recusou a autenticação ou o acesso.');
      if (response.status !== 200 || !response.body || typeof response.body !== 'object')
        throw new Error('Resposta inválida do AdGuard Home.');
      const body = response.body as Record<string, unknown>;
      if (
        typeof body.running !== 'boolean' ||
        typeof body.protection_enabled !== 'boolean' ||
        typeof body.version !== 'string' ||
        body.version.length > 128 ||
        body.version.includes(safe.password)
      )
        throw new Error('Resposta inválida do AdGuard Home.');
      return {
        running: body.running,
        protectionEnabled: body.protection_enabled,
        version: body.version,
      };
    },
  };
}
