import https from 'node:https';
import { getCACertificates } from 'node:tls';
import type { ProxmoxConfig } from './vault.js';
export class ProxmoxError extends Error {}

function connectionError(error: NodeJS.ErrnoException): ProxmoxError {
  const code = error.code ?? '';
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS/.test(code))
    return new ProxmoxError(
      'Certificado TLS do Proxmox não é confiável ou não corresponde ao endereço. Configure uma CA confiável para o backend.',
    );
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return new ProxmoxError(
      'Não foi possível resolver o endereço do Proxmox. Verifique o DNS e a URL configurada.',
    );
  if (code === 'ECONNREFUSED')
    return new ProxmoxError(
      'Conexão recusada pelo Proxmox. Verifique o endereço, a porta e se o serviço está ativo.',
    );
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH')
    return new ProxmoxError(
      'Não foi possível alcançar o Proxmox. Verifique a rede, o firewall e o endereço configurado.',
    );
  return new ProxmoxError(
    'Falha de conexão com o Proxmox. Verifique a rede e o endereço configurado.',
  );
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
                ? 'O Proxmox recusou a autenticação (HTTP 401). Verifique o ID e o segredo do token.'
                : status === 403
                  ? 'O Proxmox negou o acesso (HTTP 403). Verifique as permissões do usuário e do token.'
                  : `O Proxmox retornou HTTP ${status ?? 'desconhecido'}. Verifique o serviço e o endereço configurado.`,
            ),
          );
          return;
        }
        let text = '';
        res.on('error', () => reject(new ProxmoxError('Resposta incompleta do Proxmox.')));
        res.on('aborted', () => reject(new ProxmoxError('Resposta incompleta do Proxmox.')));
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
          if (text.length > 2_000_000)
            req.destroy(new ProxmoxError('Resposta do Proxmox excedeu o tamanho permitido.'));
        });
        res.on('end', () => {
          try {
            const body = JSON.parse(text) as { data?: unknown } | null;
            if (!body || !Array.isArray(body.data)) throw new Error('Resposta inválida.');
            resolve(body.data);
          } catch {
            reject(
              new ProxmoxError(
                'Resposta inválida do Proxmox. Verifique se a URL aponta para um servidor Proxmox.',
              ),
            );
          }
        });
      },
    );
    req.on('timeout', () =>
      req.destroy(
        new ProxmoxError('Tempo de conexão com o Proxmox esgotado. Verifique a rede e o firewall.'),
      ),
    );
    req.on('error', (error: NodeJS.ErrnoException) =>
      reject(error instanceof ProxmoxError ? error : connectionError(error)),
    );
  });
}
