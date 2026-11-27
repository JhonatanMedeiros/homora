import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { operationalSummary } from './operational-summary.js';

const now = Date.parse('2026-01-08T12:00:00Z');
const day = 86_400_000;
let db: DatabaseSync;
function setup() {
  db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY,service_id INTEGER,started_at INTEGER,ended_at INTEGER);
    INSERT INTO services VALUES(1);`);
  return db;
}
afterEach(() => db?.close());

describe('operational summary', () => {
  it('includes only recorded incident events in the inclusive requested window', () => {
    const database = setup();
    const insert = database.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)');
    insert.run(1, 1, now - day, now - 1000);
    insert.run(2, 2, now - day - 1, now);
    insert.run(3, 1, now + 1, null);
    const result = operationalSummary(database, '24h', now);
    const facts = result.evidence.items.filter((item) => item.kind === 'fact');
    expect(facts.map((item) => item.id)).toEqual([
      'incident:2:recovered',
      'incident:1:recovered',
      'incident:1:opened',
    ]);
    expect(facts[0]?.link).toBeNull();
    expect(facts[1]?.link).toBe('/services/1');
    expect(result.monitors).toEqual([
      { monitorId: 1, opened: 1, recovered: 1, total: 1 },
      { monitorId: 2, opened: 0, recovered: 1, total: 1 },
    ]);
    expect(result.evidence.items.at(-1)).toMatchObject({
      kind: 'unknown',
      missing: ['complete-incident-coverage'],
    });
  });
  it('does not interpret an empty incident table as complete history', () => {
    const result = operationalSummary(setup(), '7d', now);
    expect(result.evidence.items).toHaveLength(1);
    expect(result.evidence.items[0]?.kind).toBe('unknown');
    expect(result.monitors).toEqual([]);
    expect(result.from).toBe(new Date(now - 7 * day).toISOString());
  });
  it('bounds results and signals truncation', () => {
    const database = setup();
    const insert = database.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)');
    for (let i = 1; i <= 101; i++) insert.run(i, 1, now - i, null);
    const result = operationalSummary(database, '24h', now);
    expect(result.truncated).toBe(true);
    expect(result.evidence.items).toHaveLength(101);
    expect(result.monitors).toEqual([{ monitorId: 1, opened: 101, recovered: 0, total: 101 }]);
  });
  it('limits monitor groups and calculates the requested period independently of event truncation', () => {
    const database = setup();
    const insert = database.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)');
    for (let id = 1; id <= 101; id++) insert.run(id, id, now - day, null);
    insert.run(102, 1, now - 2 * day, now - day - 1);
    expect(operationalSummary(database, '24h', now)).toMatchObject({
      monitorsTruncated: true,
      monitors: expect.any(Array),
    });
    const week = operationalSummary(database, '7d', now);
    expect(week.monitors).toHaveLength(100);
    expect(week.monitors[0]).toEqual({ monitorId: 1, opened: 2, recovered: 1, total: 2 });
  });
});
