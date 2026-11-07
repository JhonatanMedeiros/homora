import http from 'node:http';
import https from 'node:https';
import type { IntegrationAdapter } from './integrations.js';

export type JellyfinConfig = { url: string };
export type JellyfinSummary = { name: string; version: string };

function validate(config: JellyfinConfig): JellyfinConfig {
  if (!config || typeof config.url !== 'string' || config.url.length > 2048)
    throw new Error('Informe uma URL válida para o Jellyfin.');
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw new Error('Informe uma URL válida para o Jellyfin.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Informe uma URL HTTP ou HTTPS sem credenciais, parâmetros ou fragmento.');
  return { url: url.toString().replace(/\/+$/, '') };
}

async function collect(config: JellyfinConfig): Promise<JellyfinSummary> {
  const { url } = validate(config);
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.get(`${url}/System/Info/Public`, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Jellyfin retornou HTTP ${res.statusCode ?? 'desconhecido'}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 262144) {
          req.destroy(new Error('Resposta Jellyfin excedeu o limite.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('aborted', () => reject(new Error('Resposta Jellyfin incompleta.')));
      res.on('error', () => reject(new Error('Resposta Jellyfin incompleta.')));
      res.on('end', () => {
        try {
          const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!body || typeof body !== 'object') throw new Error();
          const data = body as Record<string, unknown>;
          if (
            typeof data.ServerName !== 'string' ||
            !data.ServerName ||
            data.ServerName.length > 256 ||
            typeof data.Version !== 'string' ||
            !data.Version ||
            data.Version.length > 128
          )
            throw new Error();
          resolve({ name: data.ServerName, version: data.Version });
        } catch {
          reject(new Error('Resposta Jellyfin inválida.'));
        }
      });
    });
    const timer = setTimeout(
      () => req.destroy(new Error('Tempo de conexão Jellyfin esgotado.')),
      8000,
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(new Error('Não foi possível consultar o Jellyfin.')));
  });
}

/** Experimental: não disponibilizar na API até existir política de destinos de rede. */
export const jellyfinAdapter: IntegrationAdapter<JellyfinConfig, JellyfinSummary> = {
  type: 'jellyfin',
  label: 'Jellyfin',
  capabilities: ['server-info'],
  validate,
  collect,
};
