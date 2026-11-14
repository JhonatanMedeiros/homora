import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createAppTestContext } from './app-test-context.js';

const context = await createAppTestContext();
const { app, cookie } = context;
const headers = { origin: 'http://localhost:5173', cookie };
afterAll(context.close);
afterEach(async () => {
  await context.clean();
  for (const probe of (await app.inject({ method: 'GET', url: '/api/probes', headers })).json())
    await app.inject({ method: 'DELETE', url: `/api/probes/${probe.id}`, headers });
});

const create = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/probes', headers, payload });

describe('Probes API', () => {
  it('creates, lists, edits and deletes a monitor that has no card', async () => {
    const created = await create({ name: 'WAN', address: 'http://1.1.1.1/', checkType: 'ping' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'WAN',
      address: 'http://1.1.1.1',
      checkType: 'ping',
      checkInterval: null,
      allowPrivate: false,
      isPublic: false,
    });
    const { id } = created.json();
    expect((await app.inject({ method: 'GET', url: '/api/probes', headers })).json()).toHaveLength(
      1,
    );

    const edited = await app.inject({
      method: 'PUT',
      url: `/api/probes/${id}`,
      headers,
      payload: { name: 'Internet', address: 'http://1.1.1.1', checkType: 'tcp', checkInterval: 45 },
    });
    expect(edited.json()).toMatchObject({
      id,
      name: 'Internet',
      checkType: 'tcp',
      checkInterval: 45,
    });

    expect(
      (await app.inject({ method: 'DELETE', url: `/api/probes/${id}`, headers })).statusCode,
    ).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/probes', headers })).json()).toEqual([]);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/probes/${id}`, headers })).statusCode,
    ).toBe(404);
  });

  it('refuses invalid forms with a code for each field', async () => {
    const body = async (payload: Record<string, unknown>) => {
      const response = await create(payload);
      return [response.statusCode, response.json().code];
    };
    expect(await body({ name: ' ', address: 'http://1.1.1.1' })).toEqual([
      400,
      'invalid-probe-name',
    ]);
    expect(await body({ name: 'x', address: 'ftp://1.1.1.1' })).toEqual([
      400,
      'invalid-probe-address',
    ]);
    expect(await body({ name: 'x', address: 'http://u:p@1.1.1.1' })).toEqual([
      400,
      'invalid-probe-address',
    ]);
    expect(await body({ name: 'x', address: 'http://1.1.1.1', checkInterval: 5 })).toEqual([
      400,
      'invalid-probe-option',
    ]);
    expect(await body({ name: 'x', address: 'http://1.1.1.1', checkType: 'nope' })).toEqual([
      400,
      'invalid-probe-option',
    ]);
    expect(await body({ name: 'x', address: 'http://1.1.1.1', extra: 1 })).toEqual([
      400,
      'invalid-data',
    ]);
  });

  it('keeps probes and cards apart', async () => {
    const probe = (
      await create({ name: 'DNS', address: 'http://dns.lan', checkType: 'dns' })
    ).json();
    const card = (
      await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name: 'Wiki', url: 'http://wiki.lan', category: 'Apps', description: '' },
      })
    ).json();
    const cards = (await app.inject({ method: 'GET', url: '/api/services', headers })).json();
    expect(cards.map((row: { id: number }) => row.id)).toEqual([card.id]);
    const probes = (await app.inject({ method: 'GET', url: '/api/probes', headers })).json();
    expect(probes.map((row: { id: number }) => row.id)).toEqual([probe.id]);
    // A probe is not a card, and a card is not a probe.
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${probe.id}`, headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/probes/${card.id}`,
          headers,
          payload: { name: 'x', address: 'http://x.lan' },
        })
      ).statusCode,
    ).toBe(404);
    // Removing the card leaves the probe alone.
    await app.inject({ method: 'DELETE', url: `/api/services/${card.id}`, headers });
    expect((await app.inject({ method: 'GET', url: '/api/probes', headers })).json()).toHaveLength(
      1,
    );
  });

  it('is monitored, can be acknowledged and appears under Connectivity when shared', async () => {
    const { id } = (
      await create({ name: 'WAN', address: 'http://1.1.1.1', checkType: 'ping' })
    ).json();
    expect(
      (await app.inject({ method: 'GET', url: `/api/services/${id}/status-detail`, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}/acknowledgement`,
          headers,
          payload: { muteMinutes: 30 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}/public`,
          headers,
          payload: { isPublic: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/probes', headers })).json()[0].isPublic,
    ).toBe(true);
    const admin = (
      await app.inject({ method: 'GET', url: '/api/public-status/admin', headers })
    ).json();
    expect(admin.preview.services).toEqual([
      expect.objectContaining({ name: 'WAN', category: 'Connectivity' }),
    ]);
  });
});
