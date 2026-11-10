import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { getCACertificates } from 'node:tls';
import { authorizeDestination, type DestinationPolicy } from './network-policy.js';

export type RequestOptions = { headers?: Readonly<Record<string, string>>; ca?: string };
export type AuthorizedResponse = { status: number; body: string };

/** Consulta somente leitura, fixando DNS e sem seguir redirecionamentos. */
export async function getAuthorizedResponse(
  destination: string,
  policy: DestinationPolicy,
  options: RequestOptions = {},
): Promise<AuthorizedResponse> {
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
      throw new Error('Cabeçalhos da integração inválidos.');
    headers[name] = value;
  }
  const dnsTimer = AbortSignal.timeout(8000);
  const { url, address } = await Promise.race([
    authorizeDestination(destination, policy),
    new Promise<never>((_, reject) =>
      dnsTimer.addEventListener(
        'abort',
        () => reject(new Error('Tempo de resolução DNS esgotado.')),
        { once: true },
      ),
    ),
  ]);
  if (url.protocol !== 'https:' && (headers.authorization || headers['x-api-key']))
    throw new Error('Credenciais exigem uma conexão HTTPS.');
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
          reject(new Error(`Redirecionamento HTTP ${status} não permitido.`));
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
            req.destroy(new Error('Resposta excedeu o limite.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('aborted', () => reject(new Error('Resposta incompleta.')));
        res.on('error', () => reject(new Error('Resposta incompleta.')));
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Tempo limite excedido.')), 8000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(new Error('Falha de conexão.')));
  });
}

/** Compatibilidade com consumidores que esperam somente JSON de resposta HTTP 200. */
export async function getAuthorizedJson(
  destination: string,
  policy: DestinationPolicy,
  options?: RequestOptions,
): Promise<unknown> {
  const response = await getAuthorizedResponse(destination, policy, options);
  if (response.status !== 200)
    throw new Error(`Resposta HTTP ${response.status || 'desconhecida'}.`);
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new Error('Resposta JSON inválida.');
  }
}
