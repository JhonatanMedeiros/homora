import { createHash, X509Certificate } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const KEY = 'monitoring_ca';
const MAX_BYTES = 65_536;
const MAX_CERTIFICATES = 10;
const CERTIFICATE = /-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----/g;

export type MonitoringTrust = {
  bundle: string;
  hash: string;
  certificates: { subject: string; validFrom: string; validTo: string }[];
};

/** Parse only certificate PEM blocks; reject private keys, extra text and oversized bundles. */
export function parseMonitoringTrust(bundle: string, now = Date.now()): MonitoringTrust {
  if (Buffer.byteLength(bundle, 'utf8') > MAX_BYTES) throw new Error('Invalid certificate bundle.');
  const blocks = [...bundle.matchAll(CERTIFICATE)];
  if (
    blocks.length === 0 ||
    blocks.length > MAX_CERTIFICATES ||
    bundle.replaceAll(CERTIFICATE, '').trim() !== ''
  )
    throw new Error('Invalid certificate bundle.');

  try {
    const certificates = blocks.map(([pem]) => {
      const certificate = new X509Certificate(pem);
      const from = Date.parse(certificate.validFrom);
      const to = Date.parse(certificate.validTo);
      if (!Number.isFinite(from) || !Number.isFinite(to) || now < from || now >= to)
        throw new Error();
      return {
        subject: certificate.subject,
        validFrom: new Date(from).toISOString(),
        validTo: new Date(to).toISOString(),
      };
    });
    return { bundle, hash: createHash('sha256').update(bundle).digest('hex'), certificates };
  } catch {
    throw new Error('Invalid certificate bundle.');
  }
}

/** Invalid stored data is distinguished from an empty store so a caller can report it. */
export function createMonitoringTrustStore(db: DatabaseSync) {
  let cachedValue: string | undefined;
  let cached: MonitoringTrust | null = null;
  return {
    read(): { trust: MonitoringTrust | null; invalid: boolean } {
      const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(KEY) as
        | { value: string }
        | undefined;
      if (!row) {
        cachedValue = undefined;
        cached = null;
        return { trust: null, invalid: false };
      }
      try {
        // Recheck validity on every read: a cached certificate can expire while Homora runs.
        if (
          cachedValue !== row.value ||
          !cached ||
          cached.certificates.some((c) => Date.parse(c.validTo) <= Date.now())
        ) {
          cached = parseMonitoringTrust(row.value);
          cachedValue = row.value;
        }
        return { trust: cached, invalid: false };
      } catch {
        // Reported to the caller as `invalid: true` (surfaced in the UI), not thrown.
        cachedValue = undefined;
        cached = null;
        return { trust: null, invalid: true };
      }
    },
    set(bundle: string) {
      const trust = parseMonitoringTrust(bundle);
      db.prepare(
        'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ).run(KEY, bundle);
      cachedValue = bundle;
      cached = trust;
      return trust;
    },
    remove() {
      db.prepare('DELETE FROM app_settings WHERE key=?').run(KEY);
      cachedValue = undefined;
      cached = null;
    },
  };
}

/** A missing or corrupt store never supplies trust. */
export function monitoringTrustReader(db: DatabaseSync) {
  const store = createMonitoringTrustStore(db);
  return () => {
    try {
      return store.read().trust;
    } catch {
      // Documented above: a missing or corrupt store never supplies trust. `createApp` wraps the
      // same read with its own logging, so the cause is not repeated here.
      return null;
    }
  };
}
