import { X509Certificate } from 'node:crypto';
import { getCACertificates } from 'node:tls';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestSession } from '../test-auth.js';
import { serviceSignature } from './signature.js';

it('authenticates, validates, audits and removes the monitoring trust bundle without returning PEM', async () => {
  const ca = getCACertificates('bundled').find((pem) => {
    const cert = new X509Certificate(pem);
    return Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now();
  });
  if (!ca) throw new Error('No valid bundled certificate');
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);
  const headers = { origin: 'http://localhost:5173', cookie };
  try {
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/monitoring/trust',
          headers: { origin: 'http://localhost:5173' },
          payload: { bundle: ca },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/monitoring/trust',
          headers,
          payload: { bundle: 'invalid' },
        })
      ).statusCode,
    ).toBe(400);
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/monitoring/trust',
      headers,
      payload: { bundle: ca },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().certificates).toHaveLength(1);
    expect(saved.body).not.toContain('BEGIN CERTIFICATE');
    expect(
      (await app.inject({ method: 'GET', url: '/api/monitoring/trust', headers })).body,
    ).not.toContain('BEGIN CERTIFICATE');
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/monitoring/trust', headers })).json(),
    ).toEqual({ certificates: [], invalid: false });
    const events = getSqliteHandle(database.db)
      .prepare("SELECT detail FROM audit_events WHERE action='monitoring-ca-update' ORDER BY id")
      .all();
    expect(events).toEqual([{ detail: 'certificates:1' }, { detail: 'removed' }]);
  } finally {
    await app.close();
    database.close();
  }
});

it('preserves legacy signatures and scopes trust changes to eligible checks', () => {
  const service = { url: 'https://private.test', allowPrivate: true, checkType: 'http' as const };
  expect(serviceSignature(service)).toBe(serviceSignature(service, undefined));
  expect(serviceSignature(service, 'a')).not.toBe(serviceSignature(service, 'b'));
  expect(serviceSignature({ ...service, allowPrivate: false }, 'a')).toBe(
    serviceSignature({ ...service, allowPrivate: false }),
  );
  expect(serviceSignature({ ...service, checkType: 'tcp' }, 'a')).toBe(
    serviceSignature({ ...service, checkType: 'tcp' }),
  );
  expect(serviceSignature({ ...service, checkInsecure: true }, 'a')).toBe(
    serviceSignature({ ...service, checkInsecure: true }),
  );
});
