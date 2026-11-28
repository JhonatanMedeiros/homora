import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { MAX_PAGE_WIDGETS, MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { expect, it } from 'vitest';
import { createPageWidgetStore } from './page-widget-store.js';

const note = (pageId: number, name: string) => ({
  pageId,
  type: 'note',
  name,
  config: { text: name },
  connectionId: null,
  size: 'normal' as const,
});

function setup() {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.exec('DELETE FROM page_widgets');
  const home = (db.prepare('SELECT id FROM pages').get() as { id: number }).id;
  const lab = Number(
    db.prepare("INSERT INTO pages(name,position) VALUES('Lab',1)").run().lastInsertRowid,
  );
  const store = createPageWidgetStore(db);
  const names = (pageId: number) => store.list(pageId).map((row) => [row.name, row.position]);
  return { storage, db, store, home, lab, names };
}

it('keeps each page numbered through inserts, moves and removals', () => {
  const { storage, store, home, lab, names } = setup();
  const a = store.insert(note(home, 'a'));
  store.insert(note(home, 'b'));
  store.insert(note(home, 'c'), 0);
  expect(names(home)).toEqual([
    ['c', 0],
    ['a', 1],
    ['b', 2],
  ]);
  store.move(store.find(a)!, lab, 0);
  expect(names(home)).toEqual([
    ['c', 0],
    ['b', 1],
  ]);
  expect(store.remove(a, home)).toBe(false);
  store.moveAll(lab, home);
  expect(names(home)).toEqual([
    ['c', 0],
    ['b', 1],
    ['a', 2],
  ]);
  expect(store.remove(a, home)).toBe(true);
  expect(store.remove(a)).toBe(false);
  storage.close();
});

it('counts the limits of a page and of the installation', () => {
  const { storage, db, store, home, lab } = setup();
  for (let index = 0; index < MAX_WIDGETS_PER_PAGE - 1; index += 1) store.insert(note(home, 'x'));
  expect(store.hasRoom(home)).toBe(true);
  expect(store.hasRoom(home, 2)).toBe(false);
  store.insert(note(home, 'x'));
  expect(store.pageHasRoom(home)).toBe(false);
  expect(store.hasRoom(lab)).toBe(true);
  const fill = db.prepare(
    "INSERT INTO page_widgets(page_id,type,name,config) VALUES(?,'note','','{}')",
  );
  for (let index = store.count(); index < MAX_PAGE_WIDGETS; index += 1) fill.run(home);
  expect(store.pageHasRoom(lab)).toBe(true);
  expect(store.hasRoom(lab)).toBe(false);
  storage.close();
});

it('is the only writer of page widgets', () => {
  const root = import.meta.dirname;
  const writers = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .filter((file) =>
      /(INSERT INTO|UPDATE|DELETE FROM) page_widgets/.test(readFileSync(join(root, file), 'utf8')),
    );
  // The development scenario writes sample data straight into an empty database.
  expect(writers.sort()).toEqual(['dev-scenario.ts', 'page-widget-store.ts']);
});
