import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { validateProxmoxConfig } from './integrations/proxmox/validation.js';
import type { ProxmoxConfig } from './integrations/proxmox/contracts.js';
import type { InputErrorFactory } from './backend.js';

export function createVault(base: string, inputError: InputErrorFactory) {
  const keyPath = `${base}.key`,
    dataPath = `${base}.proxmox`;
  function key(create: boolean) {
    try {
      const value = readFileSync(keyPath);
      if (value.length !== 32) throw new Error('Invalid key.');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
      if (existsSync(dataPath)) throw new Error('Missing integration key.', { cause: error });
      const value = randomBytes(32);
      writeFileSync(keyPath, value, { mode: 0o600, flag: 'wx' });
      return value;
    }
  }
  function save(input: ProxmoxConfig) {
    const config = validateProxmoxConfig(input, inputError);
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
