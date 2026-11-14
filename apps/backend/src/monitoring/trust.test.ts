import { DatabaseSync } from 'node:sqlite';
import { X509Certificate } from 'node:crypto';
import { getCACertificates } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { createMonitoringTrustStore, parseMonitoringTrust } from './trust.js';

const certificate = getCACertificates('bundled').find((pem) => {
  const cert = new X509Certificate(pem);
  return Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now();
});
if (!certificate) throw new Error('No currently valid bundled certificate available for tests.');

describe('monitoring trust bundle', () => {
  it('parses multiple certificates and gives a stable hash and public metadata', () => {
    const result = parseMonitoringTrust(`${certificate}\n${certificate}`);
    expect(result.certificates).toHaveLength(2);
    expect(result.certificates[0].subject).toBe(new X509Certificate(certificate).subject);
    expect(result.hash).toBe(parseMonitoringTrust(result.bundle).hash);
    expect(result.hash).not.toBe(parseMonitoringTrust(certificate).hash);
  });

  it('rejects malformed, extra, oversized, excessive and expired input', () => {
    const expiry = Date.parse(new X509Certificate(certificate).validTo);
    for (const invalid of [
      '',
      '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----',
      `${certificate}\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----`,
      'x'.repeat(65_537),
      Array(11).fill(certificate).join('\n'),
    ])
      expect(() => parseMonitoringTrust(invalid)).toThrow('Invalid certificate bundle.');
    expect(() => parseMonitoringTrust(certificate, expiry)).toThrow('Invalid certificate bundle.');
  });

  it('persists, replaces and removes trust, and reports corrupt stored values', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      const store = createMonitoringTrustStore(db);
      expect(store.read()).toEqual({ trust: null, invalid: false });
      const saved = store.set(certificate);
      expect(store.read()).toEqual({ trust: saved, invalid: false });
      expect(() => store.set('invalid')).toThrow();
      expect(store.read().trust?.hash).toBe(saved.hash);
      db.prepare("UPDATE app_settings SET value='invalid' WHERE key='monitoring_ca'").run();
      expect(store.read()).toEqual({ trust: null, invalid: true });
      store.remove();
      expect(store.read()).toEqual({ trust: null, invalid: false });
    } finally {
      db.close();
    }
  });
});
