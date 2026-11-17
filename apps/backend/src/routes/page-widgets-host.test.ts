import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { defineWidget } from '@homora/widgets';
import { registerPageWidgetRoutes } from './page-widgets.js';

it('validates and persists an injected synthetic widget without type-specific host code', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE pages(id INTEGER PRIMARY KEY);
    INSERT INTO pages VALUES(1);
    CREATE TABLE config_version(id INTEGER PRIMARY KEY, version INTEGER);
    INSERT INTO config_version VALUES(1, 0);
    CREATE TABLE page_widgets(id INTEGER PRIMARY KEY, page_id INTEGER, type TEXT, name TEXT, config TEXT, version INTEGER, connection_id INTEGER, position INTEGER);`);
  const synthetic = defineWidget({
    type: 'sample',
    version: 1,
    locations: ['page'],
    source: null,
    parseConfig(value: unknown) {
      if (
        !value ||
        typeof value !== 'object' ||
        !('label' in value) ||
        typeof value.label !== 'string'
      )
        return null;
      return { label: value.label.trim() };
    },
  });
  const app = Fastify();
  registerPageWidgetRoutes(app, db, (type) => (type === synthetic.type ? synthetic : undefined));
  const body = {
    pageId: 1,
    type: 'sample',
    name: '',
    config: { label: ' test ' },
    connectionId: null,
  };
  expect(
    (await app.inject({ method: 'POST', url: '/api/page-widgets', payload: body })).json().config,
  ).toEqual({ label: 'test' });
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/page-widgets',
        payload: { ...body, config: { label: 2 } },
      })
    ).statusCode,
  ).toBe(400);
  expect((await app.inject({ method: 'GET', url: '/api/page-widgets' })).json()[0].type).toBe(
    'sample',
  );
  await app.close();
  db.close();
});
