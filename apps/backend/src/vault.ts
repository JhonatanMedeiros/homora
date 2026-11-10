import { createCipheriv, createDecipheriv, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
export type ProxmoxConfig = { url: string; tokenId: string; secret: string; ca?: string };
export function validateProxmoxConfig(input: ProxmoxConfig): ProxmoxConfig {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new Error('Informe uma URL HTTPS válida.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Informe uma origem HTTPS sem caminho ou credenciais.');
  if (
    !/^[^\s!@]+@[^\s!@]+![^\s!@]+$/.test(input.tokenId) ||
    !input.secret ||
    input.secret.length > 512 ||
    /[\r\n]/.test(input.secret)
  )
    throw new Error('Informe um ID e segredo de token válidos.');
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
      throw new Error(
        'Certificado de CA inválido. Envie um certificado público de CA em formato PEM.',
      );
    }
  }
  return {
    url: url.origin,
    tokenId: input.tokenId,
    secret: input.secret,
    ...(input.ca ? { ca: input.ca } : {}),
  };
}
export function createVault(base: string) {
  const keyPath = `${base}.key`,
    dataPath = `${base}.proxmox`;
  function key(create: boolean) {
    try {
      const value = readFileSync(keyPath);
      if (value.length !== 32) throw new Error('Chave inválida.');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
      if (existsSync(dataPath)) throw new Error('Chave de integração ausente.', { cause: error });
      const value = randomBytes(32);
      writeFileSync(keyPath, value, { mode: 0o600, flag: 'wx' });
      return value;
    }
  }
  function save(input: ProxmoxConfig) {
    const config = validateProxmoxConfig(input);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(true), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
    const encoded = JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    });
    const temporary = `${dataPath}.${randomBytes(8).toString('hex')}.tmp`;
    writeFileSync(temporary, encoded, { mode: 0o600, flag: 'wx' });
    // Atomic replacement avoids partial credentials if interrupted.
    return import('node:fs').then(({ renameSync }) => renameSync(temporary, dataPath));
  }
  function load(): ProxmoxConfig | null {
    let raw: string;
    try {
      raw = readFileSync(dataPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const stored = JSON.parse(raw) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv('aes-256-gcm', key(false), Buffer.from(stored.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(stored.data, 'base64')),
        decipher.final(),
      ]).toString('utf8'),
    ) as ProxmoxConfig;
  }
  function seal(value: string, allowCreate: boolean): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(allowCreate), iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    });
  }
  function unseal(value: string): string {
    const stored = JSON.parse(value) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv('aes-256-gcm', key(false), Buffer.from(stored.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(stored.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
  return { save, load, seal, unseal };
}
