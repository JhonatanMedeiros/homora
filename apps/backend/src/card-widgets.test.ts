import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';

it('attaches a widget to a card, switches it, detaches it, and preserves the widget when removing the card', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-card-widgets-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  try {
    const card = (
      await send('POST', '/api/services', {
        name: 'Casa',
        url: 'https://casa.example',
        category: 'Essenciais',
        description: '',
      })
    ).json();
    const connection = (
      await send('POST', '/api/connections', {
        type: 'home-assistant',
        name: 'Casa',
        url: 'https://hass.example',
        entityId: 'sensor.temperatura',
        secret: 'fake-test-token-123',
      })
    ).json();

    const plain = await send('POST', '/api/widgets', { integrationId: connection.id, name: 'A' });
    expect(plain.json().serviceId).toBeNull();

    const attached = await send('POST', '/api/widgets', {
      integrationId: connection.id,
      name: 'B',
      serviceId: card.id,
    });
    expect(attached.statusCode).toBe(201);
    expect(attached.json().serviceId).toBe(card.id);

    const missing = await send('POST', '/api/widgets', {
      integrationId: connection.id,
      name: 'C',
      serviceId: 9999,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('service-not-found');

    const moved = await send('PATCH', `/api/widgets/${plain.json().id}`, { serviceId: card.id });
    expect(moved.json().serviceId).toBe(card.id);
    expect(
      (await send('PATCH', `/api/widgets/${plain.json().id}`, { serviceId: null })).json()
        .serviceId,
    ).toBeNull();
    expect((await send('PATCH', `/api/widgets/${plain.json().id}`, {})).statusCode).toBe(400);
    expect((await send('PATCH', `/api/widgets/${plain.json().id}`, { x: 1 })).statusCode).toBe(400);
    expect((await send('PATCH', '/api/widgets/9999', { serviceId: null })).json().code).toBe(
      'widget-not-found',
    );
    expect(
      (await send('PATCH', `/api/widgets/${plain.json().id}`, { serviceId: 9999 })).json().code,
    ).toBe('service-not-found');

    expect((await send('DELETE', `/api/services/${card.id}`)).statusCode).toBe(200);
    const widgets = (await app.inject({ method: 'GET', url: '/api/widgets', headers })).json();
    expect(widgets).toHaveLength(2);
    expect(widgets.every((widget: { serviceId: number | null }) => widget.serviceId === null)).toBe(
      true,
    );
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
