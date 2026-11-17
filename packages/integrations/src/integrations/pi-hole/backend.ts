import { hasControlChars, parseHttpUrl } from '@homora/utils';
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
    const url = parseHttpUrl(config.url, {
      httpsOnly: true,
      allowPath: false,
      allowQuery: false,
      allowHash: false,
      maxLength: 2048,
    });
    if (!url) throw inputError('https-url-required');
    if (
      typeof config.secret !== 'string' ||
      config.secret.length === 0 ||
      config.secret.length > 256 ||
      hasControlChars(config.secret)
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
