import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { evidenceReferencesValid } from '@homora/shared';
import { investigateIncident } from './incident-investigation.js';

const now = Date.parse('2026-01-31T12:00:00Z');
const minute = 60_000;
let db: DatabaseSync;
function setup() {
  db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE monitors(id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE services(id INTEGER PRIMARY KEY);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY,service_id INTEGER,started_at INTEGER,ended_at INTEGER);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,observed_at INTEGER,observation TEXT);
    INSERT INTO monitors VALUES(1,'hostile-name'),(2,'other'); INSERT INTO services VALUES(1);`);
  return db;
}
afterEach(() => db?.close());

describe('incident investigation', () => {
  it('correlates bounded observations and overlapping incidents without asserting causality or leaking raw content', () => {
    const d = setup();
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(
      4,
      1,
      now - 20 * minute,
      now - 10 * minute,
    );
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(
      5,
      2,
      now - 15 * minute,
      now - 5 * minute,
    );
    d.prepare('INSERT INTO service_observation_history VALUES(?,?,?,?)').run(
      9,
      1,
      now - 19 * minute,
      JSON.stringify({ status: 'unavailable', reason: 'secret-canary', address: 'secret-canary' }),
    );
    const result = investigateIncident(d, 4, now)!;
    expect(result.evidence.items.map((item) => item.id)).toContain('check:9');
    expect(result.evidence.items).toContainEqual(
      expect.objectContaining({ id: 'incident:5:overlap', kind: 'fact' }),
    );
    expect(result.evidence.items).toContainEqual(
      expect.objectContaining({
        kind: 'hypothesis',
        confidence: 'inferred',
        evidenceIds: ['incident:4:opened', 'incident:5:overlap'],
      }),
    );
    expect(evidenceReferencesValid(result.evidence)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret-canary');
    expect(result.evidence.items.at(-1)).toMatchObject({
      kind: 'unknown',
      missing: expect.arrayContaining([
        'root-cause',
        'historical-dependencies',
        'complete-history',
      ]),
    });
  });
  it('distinguishes missing, expired and malformed history and never invents a hypothesis', () => {
    const d = setup();
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(
      1,
      1,
      now - 31 * 24 * 60 * minute,
      now - 31 * 24 * 60 * minute + minute,
    );
    const result = investigateIncident(d, 1, now)!;
    expect(result.from).toBeNull();
    expect(result.evidence.items.at(-1)).toMatchObject({
      missing: expect.arrayContaining(['history-outside-retention']),
    });
    expect(result.evidence.items.some((item) => item.kind === 'hypothesis')).toBe(false);
    expect(investigateIncident(d, 99, now)).toBeNull();
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(2, 1, now - 2 * minute, null);
    d.prepare('INSERT INTO service_observation_history VALUES(?,?,?,?)').run(
      1,
      1,
      now - minute,
      '{broken',
    );
    expect(investigateIncident(d, 2, now)!.evidence.items.at(-1)).toMatchObject({
      missing: expect.arrayContaining(['invalid-checks']),
    });
  });
  it('keeps conflicting check observations separate and does not invent a cause', () => {
    const d = setup();
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(1, 1, now - minute, null);
    const insert = d.prepare('INSERT INTO service_observation_history VALUES(?,?,?,?)');
    insert.run(1, 1, now - 1000, JSON.stringify({ status: 'available' }));
    insert.run(2, 1, now - 1000, JSON.stringify({ status: 'unavailable' }));
    const items = investigateIncident(d, 1, now)!.evidence.items;
    expect(
      items
        .filter((item) => item.source === 'monitor-check')
        .map((item) => item.attributes.status)
        .sort(),
    ).toEqual(['available', 'unavailable']);
    expect(items.some((item) => item.kind === 'hypothesis')).toBe(false);
    expect(items.at(-1)).toMatchObject({
      kind: 'unknown',
      missing: expect.arrayContaining(['root-cause']),
    });
  });
  it('bounds checks and reports truncation', () => {
    const d = setup();
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(1, 1, now - 2 * minute, null);
    const insert = d.prepare('INSERT INTO service_observation_history VALUES(?,?,?,?)');
    for (let i = 1; i <= 101; i++)
      insert.run(i, 1, now - i, JSON.stringify({ status: 'available' }));
    const result = investigateIncident(d, 1, now)!;
    expect(result.truncated).toBe(true);
    expect(result.evidence.items.filter((item) => item.source === 'monitor-check')).toHaveLength(
      100,
    );
    expect(result.evidence.items.at(-1)).toMatchObject({
      missing: expect.arrayContaining(['checks-truncated']),
    });
  });
  it('groups identical monitor windows, keeps their facts and declares omitted hypotheses', () => {
    const d = setup();
    d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)').run(1, 1, now - 20 * minute, null);
    const monitors = d.prepare('INSERT INTO monitors VALUES(?,?)');
    const incidents = d.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)');
    incidents.run(2, 2, now - 10 * minute, now - 5 * minute);
    incidents.run(3, 2, now - 10 * minute, now - 5 * minute);
    for (let id = 3; id <= 8; id++) {
      monitors.run(id, `monitor-${id}`);
      incidents.run(id + 1, id, now - (id + 8) * minute, null);
    }
    const result = investigateIncident(d, 1, now)!;
    const facts = result.evidence.items.filter(
      (item) => item.kind === 'fact' && item.attributes.event === 'overlap',
    );
    const hypotheses = result.evidence.items.filter((item) => item.kind === 'hypothesis');
    expect(facts).toHaveLength(8);
    expect(hypotheses).toHaveLength(5);
    expect(hypotheses.find((item) => item.attributes.relatedMonitorId === 2)).toMatchObject({
      attributes: { relatedIncidentId: 2, relatedMonitorId: 2, overlapCount: 2 },
      evidenceIds: ['incident:1:opened', 'incident:2:overlap', 'incident:3:overlap'],
    });
    expect(result.evidence.items.at(-1)).toMatchObject({
      missing: expect.arrayContaining(['hypotheses-truncated']),
    });
    expect(evidenceReferencesValid(result.evidence)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('monitor-3');
  });
});
