import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { integrationWidgetDefinition, resolveWidget } from '@homora/integrations';
import { supportsSource, type WidgetDefinition } from '@homora/widgets';
import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';

const id = z.number().int().safe().positive();
const bodySchema = z
  .object({
    pageId: id,
    type: z.string().min(1).max(80),
    name: z.string().trim().max(80),
    config: z.unknown(),
    connectionId: id.nullable(),
    size: z.enum(['normal', 'wide']).default('normal'),
  })
  .strict();
const orderSchema = z.object({ pageId: id, ids: z.array(id).max(200) }).strict();

type Row = {
  id: number;
  pageId: number;
  type: string;
  name: string;
  config: string;
  version: number;
  connectionId: number | null;
  position: number;
  size: string;
};

/** Page widget storage is independent of legacy integration widget identities. */
export function registerPageWidgetRoutes(
  app: FastifyInstance,
  sqlite: DatabaseSync,
  resolve: (type: string) => WidgetDefinition<unknown> | undefined = resolveWidget,
) {
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
    (
      sqlite
        .prepare(
          'SELECT id,page_id AS pageId,type,name,config,version,connection_id AS connectionId,position,size FROM page_widgets ORDER BY page_id,position,id',
        )
        .all() as Row[]
    ).map((row) => {
      let config: unknown = null;
      try {
        config = JSON.parse(row.config);
      } catch {
        // Invalid saved data stays isolated: the widget is returned with `config: null`.
      }
      return { ...row, config, size: row.size === 'wide' ? 'wide' : 'normal' };
    });
  const validate = (raw: unknown) => {
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return null;
    const value = parsed.data;
    if (!sqlite.prepare('SELECT id FROM pages WHERE id=?').get(value.pageId)) return null;
    const definition = resolve(value.type);
    if (!definition || !(definition.sizes ?? ['normal']).includes(value.size)) return null;
    const config = definition.parseConfig(value.config);
    if (config === null) return null;
    if (definition.source === null)
      return value.connectionId === null ? { ...value, config } : null;
    if (value.connectionId === null) return null;
    const connection = sqlite
      .prepare('SELECT type FROM integration_instances WHERE id=?')
      .get(value.connectionId) as { type: string } | undefined;
    const offered = connection && integrationWidgetDefinition(connection.type)?.source;
    if (!offered || !supportsSource(definition.source, offered)) return null;
    return value;
  };
  app.get('/api/page-widgets', async () => list());
  app.post('/api/page-widgets', async (request, reply) => {
    const value = validate(request.body);
    if (!value || list().length >= 200) return reply.code(400).send(errorBody('invalid-widget'));
    if (list().filter((row) => row.pageId === value.pageId).length >= MAX_WIDGETS_PER_PAGE)
      return reply.code(409).send(errorBody('widget-limit'));
    const result = transaction(() =>
      sqlite
        .prepare(
          'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM page_widgets WHERE page_id=?))',
        )
        .run(
          value.pageId,
          value.type,
          value.name,
          JSON.stringify(value.config),
          value.connectionId,
          value.size,
          value.pageId,
        ),
    );
    return reply.code(201).send(list().find((row) => row.id === Number(result.lastInsertRowid)));
  });
  app.put('/api/page-widgets/order', async (request, reply) => {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const { pageId, ids } = parsed.data;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const current = list().filter((row) => row.pageId === pageId);
      if (
        ids.length !== current.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !current.some((row) => row.id === id))
      ) {
        sqlite.exec('ROLLBACK');
        return reply.code(400).send(errorBody('invalid-data'));
      }
      const update = sqlite.prepare('UPDATE page_widgets SET position=? WHERE id=?');
      ids.forEach((id, position) => update.run(position, id));
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
    const current = list().find((row) => row.id === widgetId);
    if (!current) return reply.code(404).send(errorBody('widget-not-found'));
    if (current.version !== 1) return reply.code(409).send(errorBody('invalid-widget'));
    if (
      current.pageId !== value.pageId &&
      list().filter((row) => row.pageId === value.pageId).length >= MAX_WIDGETS_PER_PAGE
    )
      return reply.code(409).send(errorBody('widget-limit'));
    const position =
      current.pageId === value.pageId
        ? current.position
        : (
            sqlite
              .prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM page_widgets WHERE page_id=?')
              .get(value.pageId) as { n: number }
          ).n;
    transaction(() =>
      sqlite
        .prepare(
          'UPDATE page_widgets SET page_id=?,type=?,name=?,config=?,version=1,connection_id=?,size=?,position=? WHERE id=?',
        )
        .run(
          value.pageId,
          value.type,
          value.name,
          JSON.stringify(value.config),
          value.connectionId,
          value.size,
          position,
          widgetId,
        ),
    );
    return list().find((row) => row.id === widgetId);
  });
  app.delete<{ Params: { id: string } }>('/api/page-widgets/:id', async (request, reply) => {
    const widgetId = parseId(request.params.id);
    if (widgetId === null || !list().some((row) => row.id === widgetId))
      return reply.code(404).send(errorBody('widget-not-found'));
    transaction(() => sqlite.prepare('DELETE FROM page_widgets WHERE id=?').run(widgetId));
    return reply.code(204).send();
  });
}
