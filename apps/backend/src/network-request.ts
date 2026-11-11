import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { getCACertificates } from 'node:tls';
import { authorizeDestination, type DestinationPolicy } from './network-policy.js';

export type RequestOptions = {
  headers?: Readonly<Record<string, string>>;
  ca?: string;
  timeoutMs?: number;
  /** Returns 3xx status code instead of failing. Redirect is not followed. */
  reportRedirect?: boolean;
};
export type AuthorizedResponse = { status: number; body: string };

/** Read-only query, pinning DNS and not following redirects. */
export async function getAuthorizedResponse(
  destination: string,
  policy: DestinationPolicy,
  options: RequestOptions = {},
): Promise<AuthorizedResponse> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const startedAt = Date.now();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    const name = key.toLowerCase();
    if (
      !['authorization', 'x-api-key', 'accept'].includes(name) ||
      typeof value !== 'string' ||
      value.length > 4096 ||
      /[\r\n]/.test(value) ||
      headers[name] !== undefined
    )
      throw new Error('Invalid integration headers.');
    headers[name] = value;
  }
  const dnsTimer = AbortSignal.timeout(timeoutMs);
  const { url, address } = await Promise.race([
    authorizeDestination(destination, policy),
    new Promise<never>((_, reject) =>
      dnsTimer.addEventListener('abort', () => reject(new Error('DNS resolution timed out.')), {
        once: true,
      }),
    ),
  ]);
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs <= 0) throw new Error('Timeout exceeded.');
  if (url.protocol !== 'https:' && (headers.authorization || headers['x-api-key']))
    throw new Error('Credentials require an HTTPS connection.');
  const pinnedLookup: LookupFunction = (_host, lookupOptions, callback) => {
    if (lookupOptions.all) callback(null, [{ address: address.address, family: address.family }]);
    else callback(null, address.address, address.family);
  };
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(
      url,
      {
        lookup: pinnedLookup,
        agent: false,
        headers,
        ...(options.ca && url.protocol === 'https:'
          ? { ca: [...getCACertificates('default'), options.ca] }
          : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          if (options.reportRedirect) {
            resolve({ status, body: '' });
            return;
          }
          reject(new Error(`HTTP ${status} redirect not allowed.`));
          return;
        }
        if (status < 200 || status >= 300) {
          res.destroy();
          resolve({ status, body: '' });
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        res.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 262144) {
            req.destroy(new Error('Response exceeded limit.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('aborted', () => reject(new Error('Incomplete response.')));
        res.on('error', () => reject(new Error('Incomplete response.')));
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Timeout exceeded.')), remainingMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(new Error('Connection failed.')));
  });
}

/** Compatibility with consumers expecting only JSON from HTTP 200 response. */
export async function getAuthorizedJson(
  destination: string,
  policy: DestinationPolicy,
  options?: RequestOptions,
): Promise<unknown> {
  const response = await getAuthorizedResponse(destination, policy, options);
  if (response.status !== 200) throw new Error(`HTTP response ${response.status || 'unknown'}.`);
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new Error('Invalid JSON response.');
  }
}
