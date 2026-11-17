import { parseHttpUrl } from '@homora/utils';
import { isValidCaPem } from '@homora/utils/node';
import type { ProxmoxConfig } from './contracts.js';

export function validateProxmoxConfig(
  input: ProxmoxConfig,
  inputError: (code: 'https-url-required' | 'invalid-token') => Error,
): ProxmoxConfig {
  const url = parseHttpUrl(input.url, {
    httpsOnly: true,
    allowPath: false,
    allowQuery: false,
    allowHash: false,
    maxLength: 2048,
  });
  if (!url) throw inputError('https-url-required');
  if (
    !/^[^\s!@]+@[^\s!@]+![^\s!@]+$/.test(input.tokenId) ||
    !input.secret ||
    input.secret.length > 512 ||
    /[\r\n]/.test(input.secret)
  )
    throw inputError('invalid-token');
  if (input.ca && !isValidCaPem(input.ca))
    throw new Error('Invalid CA certificate. Provide a public CA certificate in PEM format.');
  return {
    url: url.origin,
    tokenId: input.tokenId,
    secret: input.secret,
    ...(input.ca ? { ca: input.ca } : {}),
  };
}
