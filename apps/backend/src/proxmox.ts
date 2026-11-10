import https from 'node:https';
import { getCACertificates } from 'node:tls';
import { ERROR_MESSAGES, type ErrorCode } from './api-error.js';
import type { ProxmoxConfig } from './vault.js';
export class ProxmoxError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
    this.name = 'ProxmoxError';
  }
}

function connectionError(error: NodeJS.ErrnoException): ProxmoxError {
  const code = error.code ?? '';
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS/.test(code))
    return new ProxmoxError('proxmox-tls');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new ProxmoxError('proxmox-dns');
  if (code === 'ECONNREFUSED') return new ProxmoxError('proxmox-refused');
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH')
    return new ProxmoxError('proxmox-unreachable');
  return new ProxmoxError('proxmox-connection-failed');
}
export async function readProxmox(config: ProxmoxConfig): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `${config.url}/api2/json/cluster/resources`,
      {
        headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.secret}` },
        ...(config.ca ? { ca: [...getCACertificates('default'), config.ca] } : {}),
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          const status = res.statusCode;
          reject(
            new ProxmoxError(
              status === 401
                ? 'proxmox-unauthorized'
                : status === 403
                  ? 'proxmox-forbidden'
                  : 'proxmox-http-error',
            ),
          );
          return;
        }
        let text = '';
        res.on('error', () => reject(new ProxmoxError('proxmox-incomplete-response')));
        res.on('aborted', () => reject(new ProxmoxError('proxmox-incomplete-response')));
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
          if (text.length > 2_000_000) req.destroy(new ProxmoxError('proxmox-response-too-large'));
        });
        res.on('end', () => {
          try {
            const body = JSON.parse(text) as { data?: unknown } | null;
            if (!body || !Array.isArray(body.data)) throw new Error('Resposta inválida.');
            resolve(body.data);
          } catch {
            reject(new ProxmoxError('proxmox-invalid-response'));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new ProxmoxError('proxmox-timeout')));
    req.on('error', (error: NodeJS.ErrnoException) =>
      reject(error instanceof ProxmoxError ? error : connectionError(error)),
    );
  });
}
