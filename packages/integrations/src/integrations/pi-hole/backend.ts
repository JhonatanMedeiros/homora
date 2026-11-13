import type { IntegrationAdapter, IntegrationTransport, InputErrorFactory } from '../../backend.js';
import { piHoleDefinition } from './definition.js';

type Config = { url: string; secret: string };
import { parseBlocking, parseSummary, type Summary } from './contracts.js';
export function createPiHoleAdapter(
  transport: IntegrationTransport,
  inputError: InputErrorFactory,
): IntegrationAdapter<Config, Summary> {
  function validate(config: Config): Config {
    if (!config || typeof config !== 'object') throw inputError('invalid-data');
    if (typeof config.url !== 'string' || config.url.length > 2048)
      throw inputError('https-url-required');
    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      throw inputError('https-url-required');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw inputError('https-url-required');
    if (
      typeof config.secret !== 'string' ||
      config.secret.length < 1 ||
      config.secret.length > 256 ||
      [...config.secret].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      throw inputError('invalid-token');
    return { url: url.origin, secret: config.secret };
  }
  return {
    type: piHoleDefinition.type,
    label: piHoleDefinition.label,
    capabilities: piHoleDefinition.capabilities,
    validate,
    async collect(config) {
      const safe = validate(config);
      let response;
      try {
        response = await transport({
          origin: safe.url,
          path: '/api/stats/summary',
          maxBodyBytes: 262144,
        });
      } catch {
        throw new Error('Could not query Pi-hole.');
      }
      if (response.status !== 200) throw new Error('Could not query Pi-hole.');
      const summary = parseSummary(response.body);
      try {
        const status = await transport({
          origin: safe.url,
          path: '/api/dns/blocking',
          maxBodyBytes: 16384,
        });
        if (status.status === 200) summary.blocking = parseBlocking(status.body);
      } catch {
        // A failed status request is unknown, never interpreted as disabled.
      }
      return summary;
    },
  };
}
