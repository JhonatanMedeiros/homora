import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createServiceConfiguration } from '../service-configuration.js';
import { parseTransfer, serializeConfiguration } from './index.js';

it('round trips the portable monitoring widget and its scope without a connection', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
  const config = { limit: 7, pages: ['Home'], groups: ['Media'], includeDegraded: false };
  a.prepare(
    "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,'current-problems','Problems',?,1,NULL,'normal',0)",
  ).run(page, JSON.stringify(config));
  const data = createServiceConfiguration(a).exportData();
  expect(data.widgets).toEqual([
    { page: 'Home', type: 'current-problems', name: 'Problems', config },
  ]);
  const serialized = serializeConfiguration(data.groups, data.services, 'json', {
    pages: data.pages,
    widgets: data.widgets,
  });
  const target = createServiceConfiguration(b);
  const parsed = parseTransfer(serialized);
  expect(target.previewImport(parsed).plan.widgets[0].status).toBe('new');
  expect(target.applyImport(parsed, { keepPrivate: false })).toMatchObject({
    status: 'applied',
    widgetsCreated: 1,
  });
  const saved = b
    .prepare('SELECT type, config, connection_id AS connectionId FROM page_widgets')
    .get() as { type: string; config: string; connectionId: null };
  expect(saved.type).toBe('current-problems');
  expect(saved.connectionId).toBeNull();
  expect(JSON.parse(saved.config)).toEqual(config);
  a.close();
  b.close();
});
