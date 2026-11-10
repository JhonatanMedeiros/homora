import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { createVault } from './vault.js';
const database = createDatabase(':memory:');
const auth = createAuth(join(mkdtempSync(join(tmpdir(), 'homora-auth-')), 'auth'));
auth.setup('senha-super-segura');
const token = auth.login('senha-super-segura', 'test')!;
const cookie = `homora_session=${token}`;
const app = createApp(database.db, 5173, auth);
afterEach(async () => {
  const response = await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } });
  for (const service of response.json() as { id: number }[])
    await app.inject({
      method: 'DELETE',
      url: `/api/services/${service.id}`,
      headers: { origin: 'http://localhost:5173', cookie },
    });
});
describe('API de serviços', () => {
  it('protege o catálogo de integrações e retorna apenas metadados', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/integrations/catalog' })).statusCode).toBe(
      401,
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/integrations/catalog',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory'] },
      { type: 'jellyfin', label: 'Jellyfin', capabilities: ['server-info'] },
      { type: 'home-assistant', label: 'Home Assistant', capabilities: ['entity-state'] },
      { type: 'uptime-kuma', label: 'Uptime Kuma', capabilities: ['status-page'] },
      { type: 'adguard-home', label: 'AdGuard Home', capabilities: ['dns-status'] },
    ]);
  });
  it('não expõe serviços sem sessão', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/services' })).statusCode).toBe(401);
  });
  it('cria, lista, atualiza e remove serviços', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const created = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'Jellyfin', url: 'http://localhost:8096', category: 'Mídia' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}`,
          headers,
          payload: { name: 'Novo', url: 'http://localhost:8096', category: 'Mídia' },
        })
      ).json().name,
    ).toBe('Novo');
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${id}`, headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toEqual([]);
  });
  it('bloqueia origens externas e dados inválidos', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/services',
          headers: { origin: 'http://malicioso.test' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/services',
          headers: { origin: 'http://localhost:5173', cookie },
          payload: { name: 'Teste', category: 'Casa', url: 'javascript:alert(1)' },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('autenticação pela API', () => {
  it('cria conta uma vez, autentica e encerra a sessão', async () => {
    const localAuth = createAuth(join(mkdtempSync(join(tmpdir(), 'homora-api-auth-')), 'auth'));
    const localApp = createApp(database.db, 5173, localAuth);
    const headers = { origin: 'http://localhost:5173' };
    expect((await localApp.inject({ method: 'GET', url: '/api/services' })).statusCode).toBe(401);
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/auth/setup',
          headers,
          payload: { password: 'senha-super-segura' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/auth/setup',
          headers,
          payload: { password: 'outra-senha-segura' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers,
          payload: { password: 'senha-errada' },
        })
      ).statusCode,
    ).toBe(401);
    const login = await localApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { password: 'senha-super-segura' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['set-cookie'] as string;
    expect(cookie).toContain('HttpOnly');
    expect(
      (await localApp.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    await localApp.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...headers, cookie },
    });
    expect(
      (await localApp.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
        .statusCode,
    ).toBe(401);
    await localApp.close();
  });
});

it('atualiza e remove CA sem apagar as credenciais existentes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-api-vault-'));
  const vault = createVault(join(dir, 'db'));
  const localApp = createApp(database.db, 5173, auth, vault);
  const headers = { origin: 'http://localhost:5173', cookie };
  try {
    await vault.save({
      url: 'https://pve.example:8006',
      tokenId: 'user@pve!homora',
      secret: 'segredo',
    });
    const ca = rootCertificates[0];
    for (const payload of [{ url: 'https://outro.example:8006' }, { tokenId: 'other@pve!token' }]) {
      for (const route of ['/api/proxmox/config', '/api/proxmox/test']) {
        const response = await localApp.inject({ method: 'POST', url: route, headers, payload });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toContain('Informe novamente o segredo');
      }
    }
    expect(vault.load()?.secret).toBe('segredo');
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/proxmox/config',
          headers,
          payload: { ca },
        })
      ).statusCode,
    ).toBe(200);
    expect(vault.load()).toEqual({
      url: 'https://pve.example:8006',
      tokenId: 'user@pve!homora',
      secret: 'segredo',
      ca,
    });
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/proxmox/config',
          headers,
          payload: { ca: 'inválido' },
        })
      ).statusCode,
    ).toBe(400);
    expect(vault.load()?.ca).toBe(ca);
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/proxmox/config',
          headers,
          payload: { removeCa: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(vault.load()).toEqual({
      url: 'https://pve.example:8006',
      tokenId: 'user@pve!homora',
      secret: 'segredo',
    });
  } finally {
    await localApp.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
