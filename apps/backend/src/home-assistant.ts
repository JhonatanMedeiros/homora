import type { IntegrationAdapter } from './integrations.js';

// Experimental: no production transport, registry entry, route, or credential
// storage exists yet. A future transport must enforce destination authorization,
// DNS pinning, TLS, timeout, body limits and reject redirects before activation.
export type HomeAssistantConfig = { url: string; token: string; entityId: string };
type HomeAssistantState = { entityId: string; state: string; lastUpdated: string | null };
type TrustedTransport = (request: {
  origin: string;
  path: string;
  authorization: string;
}) => Promise<{ status: number; body: unknown }>;

function validate(input: HomeAssistantConfig): HomeAssistantConfig {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new Error('Informe uma URL HTTPS válida.');
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
    typeof input.token !== 'string' ||
    !input.token ||
    input.token.length > 4096 ||
    !/^[\x21-\x7e]+$/.test(input.token)
  )
    throw new Error('Informe um token válido.');
  if (
    typeof input.entityId !== 'string' ||
    !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(input.entityId) ||
    input.entityId.length > 255
  )
    throw new Error('Informe um identificador de entidade válido.');
  return { url: url.origin, token: input.token, entityId: input.entityId };
}

/** Only inject a trusted, network-policy-enforcing transport. */
export function createHomeAssistantAdapter(
  transport: TrustedTransport,
): IntegrationAdapter<HomeAssistantConfig, HomeAssistantState> {
  return {
    type: 'home-assistant',
    label: 'Home Assistant',
    capabilities: ['entity-state'],
    validate,
    async collect(config) {
      const safe = validate(config);
      let response: { status: number; body: unknown };
      try {
        response = await transport({
          origin: safe.url,
          path: `/api/states/${safe.entityId}`,
          authorization: `Bearer ${safe.token}`,
        });
      } catch {
        throw new Error('Não foi possível conectar ao Home Assistant.');
      }
      if (response.status === 401 || response.status === 403)
        throw new Error('O Home Assistant recusou a autenticação ou o acesso.');
      if (response.status === 404) throw new Error('Entidade não encontrada no Home Assistant.');
      if (response.status !== 200)
        throw new Error('O Home Assistant não retornou uma resposta válida.');
      const body = response.body;
      if (!body || typeof body !== 'object')
        throw new Error('Resposta inválida do Home Assistant.');
      const state = body as Record<string, unknown>;
      if (
        state.entity_id !== safe.entityId ||
        typeof state.state !== 'string' ||
        state.state.length > 1024 ||
        state.state.includes(safe.token) ||
        (state.last_updated != null &&
          (typeof state.last_updated !== 'string' ||
            state.last_updated.length > 128 ||
            state.last_updated.includes(safe.token)))
      )
        throw new Error('Resposta inválida do Home Assistant.');
      return {
        entityId: safe.entityId,
        state: state.state,
        lastUpdated: (state.last_updated as string | null | undefined) ?? null,
      };
    },
  };
}
