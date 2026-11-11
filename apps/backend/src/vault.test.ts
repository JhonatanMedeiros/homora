import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { expect, it } from 'vitest';
import { createVault } from './vault.js';
it('protects token and rejects connections without TLS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-vault-'));
  try {
    const base = join(dir, 'db');
    const vault = createVault(base);
    expect(() =>
      vault.save({ url: 'http://example.com', tokenId: 'root@pam!homora', secret: 'secret' }),
    ).toThrow();
    await vault.save({
      url: 'https://pve.example.com:8006',
      tokenId: 'root@pam!homora',
      secret: 'secret',
    });
    expect(readFileSync(`${base}.proxmox`, 'utf8')).not.toContain('secret');
    expect(statSync(`${base}.key`).mode & 0o777).toBe(0o600);
    expect(vault.load()?.secret).toBe('secret');
    const ca = rootCertificates[0];
    expect(() =>
      vault.save({
        url: 'https://pve.example.com',
        tokenId: 'root@pam!homora',
        secret: 'secret',
        ca: 'invalid',
      }),
    ).toThrow('Invalid CA certificate');
    await vault.save({
      url: 'https://pve.example.com',
      tokenId: 'root@pam!homora',
      secret: 'secret',
      ca,
    });
    expect(vault.load()?.ca).toBe(ca);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
