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
import { parseAllowedOrigins } from './config.js';
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
  const groups = await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } });
  for (const group of groups.json() as { id: number }[])
    await app.inject({
      method: 'DELETE',
      url: `/api/groups/${group.id}`,
      headers: { origin: 'http://localhost:5173', cookie },
    });
});
describe('API de serviços', () => {
  it('exporta, pré-visualiza e importa configuração sem sobrescrever nada', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers, payload: payload as object });
    for (const [name, category] of [
      ['Jellyfin', 'Mídia'],
      ['Proxmox', 'Infra'],
    ])
      await post('/api/services', {
        name,
        url: `http://localhost/${name}`,
        category,
        icon: 'lucide:server',
        allowPrivate: true,
      });
    expect((await app.inject({ method: 'GET', url: '/api/config/export' })).statusCode).toBe(401);
    const exported = await app.inject({
      method: 'GET',
      url: '/api/config/export?format=yaml',
      headers: { cookie },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('homora-config.yaml');
    expect(exported.body).toContain('lucide:server');
    expect(exported.body).not.toContain('"id"');

    const preview = await post('/api/config/import/preview', { content: exported.body });
    expect(preview.json().plan.summary).toMatchObject({ newServices: 0, duplicates: 2 });
    const applied = await post('/api/config/import/apply', {
      content: exported.body,
      expectedVersion: preview.json().version,
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().created).toBe(0);

    const fresh = `version: 1
groups:
  - name: Casa
    services:
      - { name: Pi-hole, url: "http://192.168.1.2/admin", allowPrivate: true }
      - { name: Quebrado, url: "nada" }
`;
    const plan = await post('/api/config/import/preview', { content: fresh });
    expect(plan.json().plan.summary).toMatchObject({ newGroups: 1, newServices: 1, errors: 1 });
    const stale = await post('/api/config/import/apply', {
      content: fresh,
      expectedVersion: plan.json().version - 1,
    });
    expect(stale.statusCode).toBe(409);
    const done = await post('/api/config/import/apply', {
      content: fresh,
      expectedVersion: plan.json().version,
    });
    expect(done.json().created).toBe(1);
    const list = (
      await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })
    ).json() as { name: string; category: string; allowPrivate: boolean }[];
    const imported = list.find((item) => item.name === 'Pi-hole');
    expect(imported).toMatchObject({ category: 'Casa', allowPrivate: false });
    expect(list.find((item) => item.name === 'Jellyfin')?.allowPrivate).toBe(true);
    const kept = await post('/api/config/import/apply', {
      content: fresh.replace('Pi-hole', 'Pi-hole 2').replace('/admin', '/outro'),
      keepPrivate: true,
    });
    expect(kept.json().created).toBe(1);
    expect(
      (
        (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json() as {
          name: string;
          allowPrivate: boolean;
        }[]
      ).find((item) => item.name === 'Pi-hole 2')?.allowPrivate,
    ).toBe(true);
  });

  it('recusa importação sem origem permitida e com corpo inválido', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/config/import/preview',
          headers: { cookie },
          payload: { content: 'x' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/config/import/apply',
          headers: { origin: 'http://localhost:5173', cookie },
          payload: { content: 'x', extra: true },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('persiste ícones por nome e por URL e descarta valores inválidos', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const create = async (icon: string) =>
      app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name: 'Icone', url: 'http://localhost:8096', category: 'Mídia', icon },
      });
    const stored = async () =>
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json() as {
        icon: string;
      }[];
    expect((await create('lucide:film')).statusCode).toBe(201);
    expect((await create('https://exemplo.test/film.svg')).statusCode).toBe(201);
    expect((await create('https://user:pass@exemplo.test/a.png')).statusCode).toBe(201);
    expect((await stored()).map((service) => service.icon).sort()).toEqual([
      '',
      'https://exemplo.test/film.svg',
      'lucide:film',
    ]);
    expect((await create('x'.repeat(513))).statusCode).toBe(400);
  });
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
    expect((await app.inject({ method: 'GET', url: '/api/service-status' })).statusCode).toBe(401);
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
    expect(created.json().allowPrivate).toBe(false);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}`,
          headers,
          payload: {
            name: 'Novo',
            url: 'http://localhost:8096',
            category: 'Mídia',
            allowPrivate: true,
          },
        })
      ).json(),
    ).toMatchObject({ name: 'Novo', allowPrivate: true });
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json()[0],
    ).toMatchObject({ id, name: 'Novo', allowPrivate: true });
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${id}`, headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toEqual([]);
  });
  it('gerencia grupos vazios e preserva cards ao renomear', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const createdGroup = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers,
      payload: { name: 'Painel' },
    });
    expect(createdGroup.statusCode).toBe(201);
    const groupId = createdGroup.json().id;
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers,
      payload: { name: 'Painel' },
    });
    expect(duplicate.statusCode).toBe(409);
    const service = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'App', url: 'http://localhost:8100', category: 'Painel' },
    });
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/groups/${groupId}`, headers })).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/groups/${groupId}`,
          headers,
          payload: { name: 'Dashboard' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json()[0]
        .category,
    ).toBe('Dashboard');
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${service.json().id}`, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/groups/${groupId}`, headers })).statusCode,
    ).toBe(200);
  });
  it('valida e persiste a ordenação dos grupos vazios', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    await app.inject({ method: 'POST', url: '/api/groups', headers, payload: { name: 'Sala' } });
    await app.inject({ method: 'POST', url: '/api/groups', headers, payload: { name: 'Quarto' } });
    const groups = (
      await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } })
    ).json() as { name: string }[];
    const reversed = groups.map((group) => group.name).reverse();
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/groups/order',
          headers,
          payload: { names: reversed },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        (await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } })).json() as {
          name: string;
        }[]
      ).map((group) => group.name),
    ).toEqual(reversed);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/groups/order',
          headers,
          payload: { names: ['ausente'] },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('valida e persiste a ordenação individual dos cards', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const ids: number[] = [];
    for (const name of ['Primeiro', 'Segundo', 'Terceiro']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name, url: `http://localhost:${8100 + ids.length}`, category: 'Ordem' },
      });
      ids.push(response.json().id);
    }
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/services/order',
          headers,
          payload: { category: 'Ordem', ids: [ids[2], ids[0], ids[1]] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
        .json()
        .filter((service: { category: string }) => service.category === 'Ordem')
        .map((service: { id: number }) => service.id),
    ).toEqual([ids[2], ids[0], ids[1]]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/services/order',
          headers,
          payload: { category: 'Ordem', ids: [ids[0]] },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('rejeita corpos e parâmetros que não correspondem aos contratos HTTP', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const invalidRequests = [
      {
        method: 'POST',
        url: '/api/services',
        payload: { name: 42, url: 'https://example.test', category: 'Casa' },
      },
      {
        method: 'POST',
        url: '/api/services',
        payload: { name: 'Casa', url: 'https://example.test', category: 'Casa', admin: true },
      },
      { method: 'POST', url: '/api/groups', payload: { name: 42 } },
      { method: 'PUT', url: '/api/groups/order', payload: { names: ['Casa', 42] } },
      { method: 'PUT', url: '/api/services/order', payload: { category: 'Casa', ids: ['1'] } },
      {
        method: 'POST',
        url: '/api/agents',
        payload: { name: 'Agente', scopes: ['admin'] },
      },
      {
        method: 'POST',
        url: '/api/connections',
        payload: { type: 'jellyfin', name: 'Mídia', url: 'https://media.example', admin: true },
      },
    ] as const;
    for (const { method, url, payload } of invalidRequests) {
      expect(
        (await app.inject({ method, url, headers, payload })).statusCode,
        `${method} ${url}`,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/services/9007199254740992',
          headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/proxmox/resources?refresh=perhaps',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('acrescenta cards depois da maior posição mesmo quando há lacunas', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const ids: number[] = [];
    for (const name of ['A', 'B', 'C']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name, url: `http://localhost:${8200 + ids.length}`, category: 'Lacunas' },
      });
      ids.push(response.json().id);
    }
    await app.inject({ method: 'DELETE', url: `/api/services/${ids[1]}`, headers });
    const added = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'D', url: 'http://localhost:8203', category: 'Lacunas' },
    });
    expect(added.json().position).toBe(3);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
        .json()
        .filter((service: { category: string }) => service.category === 'Lacunas')
        .map((service: { name: string }) => service.name),
    ).toEqual(['A', 'C', 'D']);
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
  it('exige correspondência exata da origem em toda mutação', async () => {
    const headers = { cookie, origin: 'http://localhost:51730' };
    for (const [method, url] of [
      ['POST', '/api/services'],
      ['POST', '/api/auth/logout'],
      ['POST', '/api/proxmox/config'],
      ['POST', '/api/connections'],
      ['POST', '/api/widgets'],
    ] as const) {
      expect((await app.inject({ method, url, headers, payload: {} })).statusCode).toBe(403);
    }
    expect(
      (await app.inject({ method: 'POST', url: '/api/services', headers: { cookie }, payload: {} }))
        .statusCode,
    ).toBe(403);
  });
});

describe('autenticação pela API', () => {
  it('contabiliza senhas curtas como tentativas inválidas de login', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'homora-api-login-limit-'));
    const localAuth = createAuth(join(dir, 'auth'));
    const localApp = createApp(database.db, 5173, localAuth);
    const headers = { origin: 'http://localhost:5173' };
    try {
      localAuth.setup('senha-super-segura');
      for (let attempt = 0; attempt < 5; attempt++) {
        expect(
          (
            await localApp.inject({
              method: 'POST',
              url: '/api/auth/login',
              headers,
              payload: { password: 'x' },
            })
          ).statusCode,
        ).toBe(401);
      }
      expect(
        (
          await localApp.inject({
            method: 'POST',
            url: '/api/auth/login',
            headers,
            payload: { password: 'senha-super-segura' },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await localApp.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

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
    expect(cookie).not.toContain('Secure');
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
  it('define Secure em login HTTPS permitido e no encerramento HTTPS', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'homora-https-auth-'));
    const localAuth = createAuth(join(dir, 'auth'));
    const localApp = createApp(database.db, 5173, localAuth, undefined, ['https://homora.example']);
    try {
      await localApp.inject({
        method: 'POST',
        url: '/api/auth/setup',
        headers: { origin: 'https://homora.example' },
        payload: { password: 'senha-super-segura' },
      });
      const login = await localApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: 'https://homora.example' },
        payload: { password: 'senha-super-segura' },
      });
      expect(login.headers['set-cookie']).toContain('; Secure');
      const logout = await localApp.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          origin: 'https://homora.example',
          cookie: login.headers['set-cookie'] as string,
        },
      });
      expect(logout.headers['set-cookie']).toContain('; Secure');
    } finally {
      await localApp.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('HOMORA_ALLOWED_ORIGINS', () => {
  it('separa origens exatas, remove duplicatas e rejeita valores inválidos', () => {
    expect(
      parseAllowedOrigins('https://homora.example, http://localhost:8080,https://homora.example'),
    ).toEqual(['https://homora.example', 'http://localhost:8080']);
    for (const value of [
      'https://example.test/path',
      'https://example.test/',
      'http://example.test',
      '*,https://ok.test',
      'https://u:p@example.test',
    ])
      expect(() => parseAllowedOrigins(value)).toThrow();
    expect(parseAllowedOrigins(undefined)).toEqual([]);
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
