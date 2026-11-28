import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { resolveWidget } from '@homora/integrations';
import type { WidgetDefinition } from '@homora/widgets';
import { MAX_PAGE_WIDGETS } from '@homora/shared';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';
import { createPageWidgetStore } from '../page-widget-store.js';
import { checkPageWidget } from '../page-widget-validation.js';

const id = z.number().int().safe().positive();
const orderSchema = z.object({ pageId: id, ids: z.array(id).max(MAX_PAGE_WIDGETS) }).strict();

/** Page widget storage is independent of legacy integration widget identities. */
export function registerPageWidgetRoutes(
  app: FastifyInstance,
  sqlite: DatabaseSync,
  resolve: (type: string) => WidgetDefinition<unknown> | undefined = resolveWidget,
) {
  const store = createPageWidgetStore(sqlite);
  const bump = () => sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
  const transaction = <T>(work: () => T): T => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      bump();
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  };
  const list = () =>
    store.list().map((row) => {
      let config: unknown = null;
      try {
        config = JSON.parse(row.config);
      } catch {
        // Invalid saved data stays isolated: the widget is returned with `config: null`.
      }
      return { ...row, config, size: row.size === 'wide' ? 'wide' : 'normal' };
    });
  const validate = (raw: unknown) => {
    const checked = checkPageWidget(sqlite, raw, resolve);
    return checked.ok ? checked.value : null;
  };
  app.get('/api/page-widgets', async () => list());
  app.post('/api/page-widgets', async (request, reply) => {
    const value = validate(request.body);
    if (!value) return reply.code(400).send(errorBody('invalid-widget'));
    if (!store.hasRoom(value.pageId)) return reply.code(409).send(errorBody('widget-limit'));
    const id = transaction(() => store.insert(value));
    return reply.code(201).send(list().find((row) => row.id === id));
  });
  app.put('/api/page-widgets/order', async (request, reply) => {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const { pageId, ids } = parsed.data;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const current = store.idsOf(pageId);
      if (
        ids.length !== current.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !current.includes(id))
      ) {
        sqlite.exec('ROLLBACK');
        return reply.code(400).send(errorBody('invalid-data'));
      }
      store.arrange(ids);
      bump();
      sqlite.exec('COMMIT');
      return list();
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  });
  app.put<{ Params: { id: string } }>('/api/page-widgets/:id', async (request, reply) => {
    const widgetId = parseId(request.params.id);
    const value = validate(request.body);
    if (!value) return reply.code(400).send(errorBody('invalid-widget'));
    const current = widgetId === null ? undefined : store.find(widgetId);
    if (!current) return reply.code(404).send(errorBody('widget-not-found'));
    if (current.version !== 1) return reply.code(409).send(errorBody('invalid-widget'));
    if (current.pageId !== value.pageId && !store.pageHasRoom(value.pageId))
      return reply.code(409).send(errorBody('widget-limit'));
    transaction(() => store.update(current, value));
    return list().find((row) => row.id === widgetId);
  });
  app.delete<{ Params: { id: string } }>('/api/page-widgets/:id', async (request, reply) => {
    const widgetId = parseId(request.params.id);
    if (widgetId === null || !store.find(widgetId))
      return reply.code(404).send(errorBody('widget-not-found'));
    transaction(() => store.remove(widgetId));
    return reply.code(204).send();
  });
}
