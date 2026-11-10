import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';

it('protege credenciais de múltiplas integrações e preserva vínculos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-connections-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup('senha-para-testes');
  const cookie = `homora_session=${auth.login('senha-para-testes', 'test')}`;
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  try {
    expect((await app.inject({ method: 'GET', url: '/api/connections' })).statusCode).toBe(401);
    const first = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: {
        type: 'home-assistant',
        name: 'Casa',
        url: 'https://hass.example',
        entityId: 'sensor.temperatura',
        secret: 'fake-test-token-123',
        ca: rootCertificates[0],
        allowPrivate: true,
      },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ hasSecret: true, hasCa: true, allowPrivate: true });
    expect(first.body).not.toContain('fake-test-token-123');
    expect(first.body).not.toContain('BEGIN CERTIFICATE');
    const id = first.json().id;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/connections/${id}/data?refresh=invalid`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/connections/not-an-id/data',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
    const second = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: {
        type: 'adguard-home',
        name: 'DNS',
        url: 'https://dns.example',
        username: 'usuario',
        secret: 'outro-fake-segredo',
      },
    });
    expect(second.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/api/connections', headers: { cookie } });
    expect(list.json()).toHaveLength(2);
    expect(list.body).not.toContain('fake-test-token-123');
    expect(readFileSync(path).includes('fake-test-token-123')).toBe(false);
    const changed = await app.inject({
      method: 'PUT',
      url: `/api/connections/${id}`,
      headers,
      payload: { url: 'https://outro.example' },
    });
    expect(changed.statusCode).toBe(400);
    expect(changed.json().code).toBe('secret-required');
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/connections/${id}`,
          headers,
          payload: { name: 'Casa nova', removeCa: true },
        })
      ).json(),
    ).toMatchObject({ hasSecret: true, hasCa: false });
    const widget = await app.inject({
      method: 'POST',
      url: '/api/widgets',
      headers,
      payload: { integrationId: id, name: 'Temperatura' },
    });
    expect(widget.statusCode).toBe(201);
    const secondWidget = await app.inject({
      method: 'POST',
      url: '/api/widgets',
      headers,
      payload: { integrationId: id, name: 'Clima sala' },
    });
    expect(secondWidget.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: '/api/widgets', headers })).json()).toHaveLength(
      2,
    );
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/connections/${id}`, headers })).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/widgets/${widget.json().id}`, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/widgets/${widget.json().id}`, headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/connections/${id}`, headers })).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/widgets/${secondWidget.json().id}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/connections/${id}`, headers })).statusCode,
    ).toBe(200);
    unlinkSync(`${path}.key`);
    const lost = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: {
        type: 'home-assistant',
        name: 'Nova',
        url: 'https://outra.example',
        entityId: 'sensor.x',
        secret: 'outra-chave',
      },
    });
    expect(lost.statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/connections', headers: { cookie } })).json(),
    ).toHaveLength(1);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
