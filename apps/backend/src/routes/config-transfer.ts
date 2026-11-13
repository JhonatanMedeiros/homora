import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';
import {
  IMPORT_SOURCES,
  MAX_TRANSFER_CHARS,
  parseBySource,
  serializeConfiguration,
} from '../transfer/index.js';
import { errorBody } from '../api-error.js';
import type { AppearanceStore } from '../appearance.js';
import type { CustomCssStore } from '../custom-css.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;

const previewSchema = z
  .object({
    content: z.string().max(MAX_TRANSFER_CHARS),
    source: z.enum(IMPORT_SOURCES).optional(),
  })
  .strict();
const applySchema = previewSchema
  .extend({
    keepPrivate: z.boolean().optional(),
    // Every new group goes on this page (the page picker of the import dialog).
    pageId: z.number().int().safe().positive().optional(),
    expectedVersion: z.number().int().safe().nonnegative().optional(),
  })
  .strict();

/** Export and import of services and groups. No secrets or connections enter the file. */
export function registerConfigTransferRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
  settings?: { appearance: AppearanceStore; customCss: CustomCssStore },
) {
  app.get<{ Querystring: { format?: string } }>('/api/config/export', async (request, reply) => {
    const format = request.query.format === 'json' ? 'json' : 'yaml';
    const { groups, services, pages } = configuration.exportData();
    return reply
      .header('Content-Type', format === 'json' ? 'application/json' : 'application/yaml')
      .header('Content-Disposition', `attachment; filename="homora-config.${format}"`)
      .send(
        serializeConfiguration(groups, services, format, {
          pages,
          ...(settings && {
            appearance: settings.appearance.get(),
            customCss: (({ enabled, css }) => ({ enabled, css }))(settings.customCss.get()),
          }),
        }),
      );
  });

  app.post(
    '/api/config/import/preview',
    { bodyLimit: MAX_TRANSFER_CHARS + 1024 },
    async (request, reply) => {
      const body = previewSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
      return configuration.previewImport(
        parseBySource(body.data.source ?? 'homora', body.data.content),
      );
    },
  );

  app.post(
    '/api/config/import/apply',
    { bodyLimit: MAX_TRANSFER_CHARS + 1024 },
    async (request, reply) => {
      const body = applySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
      const result = configuration.applyImport(
        parseBySource(body.data.source ?? 'homora', body.data.content),
        {
          keepPrivate: body.data.keepPrivate === true,
          pageId: body.data.pageId,
          expectedVersion: body.data.expectedVersion,
        },
      );
      if (result.status === 'stale') return reply.code(409).send(errorBody('config-changed'));
      void monitor.invalidate();
      return { created: result.created, plan: result.plan };
    },
  );
}
