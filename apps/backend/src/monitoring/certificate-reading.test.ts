import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { certificateReading } from './certificate-reading.js';
import { serviceSignature } from './signature.js';
import type { MonitoringService } from './service-source.js';

const now = 1_800_000_000_000;
const service = {
  id: 1,
  url: 'https://example.test',
  checkType: 'tls',
  checkInterval: 60,
  allowPrivate: false,
  checkInsecure: false,
  expectedStatus: null,
  checkPath: null,
  checkUrl: null,
  checkMatch: null,
} as MonitoringService;
let db: DatabaseSync;
function setup() {
  db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE service_observation_history(service_id INTEGER, signature TEXT, observed_at INTEGER, observation TEXT)',
  );
  return (at: number, observation: string, signature = serviceSignature(service)) =>
    db
      .prepare('INSERT INTO service_observation_history VALUES (?, ?, ?, ?)')
      .run(1, signature, at, observation);
}
afterEach(() => db?.close());
describe('certificate readings', () => {
  it('uses the latest expiry, including invalid checks and renewals', () => {
    const add = setup();
    add(now - 2000, JSON.stringify({ certExpiresAt: now - 1, reason: 'cert-expired' }));
    add(now - 1000, JSON.stringify({ certExpiresAt: now + 10000, reason: 'cert-invalid' }));
    expect(certificateReading(db, service, now)).toEqual({
      expiresAt: now + 10000,
      observedAt: now - 1000,
      stale: false,
    });
  });
  it('marks an earlier reading stale after a failure and rejects different signatures and old history', () => {
    const add = setup();
    add(now - 31 * 86400000, JSON.stringify({ certExpiresAt: now + 1 }));
    add(now - 3000, JSON.stringify({ certExpiresAt: now + 2 }), 'different');
    add(now - 2000, JSON.stringify({ certExpiresAt: now + 3 }));
    add(now - 1000, '{"reason":"no-response"}');
    expect(certificateReading(db, service, now)).toEqual({
      expiresAt: now + 3,
      observedAt: now - 2000,
      stale: true,
    });
    expect(certificateReading(db, { ...service, url: 'https://changed.test' }, now)).toEqual({
      expiresAt: null,
      observedAt: null,
      stale: false,
    });
  });
  it('never infers expiry from malformed, unavailable, future or non-TLS readings', () => {
    const add = setup();
    add(now - 1000, 'not json');
    add(now - 500, '{"certExpiresAt":true}');
    add(now, '{"certExpiresAt":"123"}');
    add(now + 1, '{"certExpiresAt":123}');
    expect(certificateReading(db, service, now).expiresAt).toBeNull();
    expect(certificateReading(db, { ...service, checkType: 'http' }, now).expiresAt).toBeNull();
  });
});

it('preserves readings across restart and scopes them to trust changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'homora-cert-test-'));
  const path = join(directory, 'test.sqlite');
  const privateService = { ...service, allowPrivate: true };
  try {
    db = new DatabaseSync(path);
    db.exec(
      'CREATE TABLE service_observation_history(service_id INTEGER, signature TEXT, observed_at INTEGER, observation TEXT)',
    );
    db.prepare('INSERT INTO service_observation_history VALUES (?, ?, ?, ?)').run(
      1,
      serviceSignature(privateService, 'old-ca'),
      now - 1000,
      JSON.stringify({ certExpiresAt: now + 10000 }),
    );
    db.close();
    db = new DatabaseSync(path);
    expect(certificateReading(db, privateService, now, 'old-ca').expiresAt).toBe(now + 10000);
    expect(certificateReading(db, privateService, now, 'new-ca').expiresAt).toBeNull();
    db.close();
    db = new DatabaseSync(':memory:');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
