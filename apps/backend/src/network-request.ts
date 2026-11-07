import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { authorizeDestination, type DestinationPolicy } from './network-policy.js';

/** Consulta somente leitura. Nenhum redirecionamento é seguido. */
export async function getAuthorizedJson(
  destination: string,
  policy: DestinationPolicy,
): Promise<unknown> {
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
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [{ address: address.address, family: address.family }]);
    else callback(null, address.address, address.family);
  };
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, { lookup: pinnedLookup, agent: false }, (res) => {
      if (res.statusCode !== 200) {
        res.destroy();
        reject(new Error(`Resposta HTTP ${res.statusCode ?? 'desconhecida'}.`));
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
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        } catch {
          reject(new Error('Resposta JSON inválida.'));
        }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Tempo limite excedido.')), 8000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(new Error('Falha de conexão.')));
  });
}
