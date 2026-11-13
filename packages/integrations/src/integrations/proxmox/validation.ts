import { X509Certificate } from 'node:crypto';
import type { ProxmoxConfig } from './contracts.js';

export function validateProxmoxConfig(
  input: ProxmoxConfig,
  inputError: (code: 'https-url-required' | 'invalid-token') => Error,
): ProxmoxConfig {
  if (typeof input.url !== 'string' || input.url.length > 2048)
    throw inputError('https-url-required');
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw inputError('https-url-required');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw inputError('https-url-required');
  if (
    !/^[^\s!@]+@[^\s!@]+![^\s!@]+$/.test(input.tokenId) ||
    !input.secret ||
    input.secret.length > 512 ||
    /[\r\n]/.test(input.secret)
  )
    throw inputError('invalid-token');
  if (input.ca) {
    try {
      if (
        Buffer.byteLength(input.ca) > 65536 ||
        !/^\s*-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(
          input.ca,
        )
      )
        throw new Error();
      const cert = new X509Certificate(input.ca);
      if (!cert.ca) throw new Error();
    } catch {
      throw new Error('Invalid CA certificate. Provide a public CA certificate in PEM format.');
    }
  }
  return {
    url: url.origin,
    tokenId: input.tokenId,
    secret: input.secret,
    ...(input.ca ? { ca: input.ca } : {}),
  };
}
