import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createMonitoringSource, toMonitoringService } from './service-source.js';

/** A database with the `monitors`/`services` split and the read view the engine uses. */
const database = () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE services (id integer PRIMARY KEY, url text NOT NULL);
    CREATE TABLE monitors (
      id integer PRIMARY KEY,
      name text NOT NULL,
      url text,
      allow_private integer DEFAULT 0 NOT NULL,
      check_insecure integer DEFAULT 0 NOT NULL,
      check_type text,
      check_interval integer,
      expected_status text,
      check_path text,
      check_url text,
      check_match text
    );
    CREATE VIEW monitor_targets AS
      SELECT m.id AS id, m.name AS name, s.url AS link_url,
        m.allow_private AS allow_private, m.check_insecure AS check_insecure,
        m.check_type AS check_type, m.check_interval AS check_interval,
        m.expected_status AS expected_status, m.check_path AS check_path,
        m.check_url AS check_url, m.check_match AS check_match
      FROM monitors m LEFT JOIN services s ON s.id = m.id;
  `);
  return sqlite;
};

describe('monitoring source', () => {
  it('turns the SQLite 0/1 flag into a real boolean for a card', () => {
    const sqlite = database();
    sqlite.exec(`
      INSERT INTO services (id, url) VALUES (1, 'https://proxmox.labphobos.com/');
      INSERT INTO monitors (id, name, url, allow_private, check_type, check_url)
        VALUES (1, 'Proxmox', NULL, 1, 'http', 'https://192.168.1.10:8006/');
    `);

    const [service] = createMonitoringSource(sqlite).list();

    // The engine compares `allowPrivate === true`; a raw 1 makes it refuse every private target.
    expect(service.allowPrivate).toBe(true);
    expect(typeof service.allowPrivate).toBe('boolean');
    expect(service.url).toBe('https://proxmox.labphobos.com/');
    expect(service.checkUrl).toBe('https://192.168.1.10:8006/');
  });

  it('keeps a probe address and a disabled private flag as false, not 0', () => {
    const sqlite = database();
    sqlite.exec(`
      INSERT INTO monitors (id, name, url, allow_private, check_type, check_url)
        VALUES (2, 'WAN', NULL, 0, 'ping', 'http://1.1.1.1/');
    `);

    const [probe] = createMonitoringSource(sqlite).list();

    expect(probe.allowPrivate).toBe(false);
    expect(probe.url).toBeNull();
    expect(probe.checkUrl).toBe('http://1.1.1.1/');
  });

  it('coerces check_insecure the same way', () => {
    const sqlite = database();
    sqlite.exec(`
      INSERT INTO services (id, url) VALUES (3, 'https://portainer.labphobos.com/');
      INSERT INTO monitors (id, name, url, allow_private, check_insecure, check_type, check_url)
        VALUES (3, 'Portainer', NULL, 1, 1, 'http', 'https://192.168.1.12:9443/');
    `);

    expect(createMonitoringSource(sqlite).list()[0].checkInsecure).toBe(true);
  });

  it('never trusts the row cast: a raw 1 reaches the mapper as a number', () => {
    const mapped = toMonitoringService({
      id: 4,
      name: 'Raw',
      url: 'https://example.test/',
      category: '',
      description: '',
      allowPrivate: 1 as unknown as boolean,
      checkInsecure: 0 as unknown as boolean,
    });

    expect(mapped.allowPrivate).toBe(true);
    expect(mapped.checkInsecure).toBe(false);
  });
});
