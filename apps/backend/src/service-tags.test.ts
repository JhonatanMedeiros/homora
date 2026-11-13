import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createTagStore } from './service-tags.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'PRAGMA foreign_keys=ON; CREATE TABLE services(id INTEGER PRIMARY KEY); INSERT INTO services VALUES(1),(2);' +
      'CREATE TABLE service_tags(service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY(service_id,tag));',
  );
  return { db, tags: createTagStore(db) };
}

it('normalises, de-duplicates and caps tags', () => {
  const { tags } = setup();
  expect(tags.set(1, [' Prod ', 'prod', 'Media Server', '', '<b>', 'x'.repeat(40)])).toEqual([
    'media-server',
    'prod',
  ]);
  expect(tags.set(1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toHaveLength(6);
});

it('replaces the tags of one service and lists them all', () => {
  const { tags } = setup();
  tags.set(1, ['prod', 'media']);
  tags.set(2, ['prod']);
  tags.set(1, ['infra']);
  expect(tags.all()).toEqual({ 1: ['infra'], 2: ['prod'] });
});

it('refuses an unknown service and drops tags with the service', () => {
  const { db, tags } = setup();
  expect(tags.set(9, ['x'])).toBeNull();
  tags.set(2, ['x']);
  db.exec('DELETE FROM services WHERE id=2');
  expect(tags.all()).toEqual({});
});
