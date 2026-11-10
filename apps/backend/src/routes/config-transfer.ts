import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';
import { MAX_TRANSFER_CHARS, parseTransfer, serializeConfiguration } from '../config-transfer.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;

const previewSchema = z.object({ content: z.string().max(MAX_TRANSFER_CHARS) }).strict();
const applySchema = previewSchema
  .extend({
    keepPrivate: z.boolean().optional(),
    expectedVersion: z.number().int().safe().nonnegative().optional(),
  })
  .strict();

/** Exportação e importação de serviços e grupos. Nenhum segredo ou conexão entra no arquivo. */
export function registerConfigTransferRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
) {
  app.get<{ Querystring: { format?: string } }>('/api/config/export', async (request, reply) => {
    const format = request.query.format === 'json' ? 'json' : 'yaml';
    const { groups, services } = configuration.exportData();
    return reply
      .header('Content-Type', format === 'json' ? 'application/json' : 'application/yaml')
      .header('Content-Disposition', `attachment; filename="homora-config.${format}"`)
      .send(serializeConfiguration(groups, services, format));
  });

  app.post(
    '/api/config/import/preview',
    { bodyLimit: MAX_TRANSFER_CHARS + 1024 },
    async (request, reply) => {
      const body = previewSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });
      return configuration.previewImport(parseTransfer(body.data.content));
    },
  );

  app.post(
    '/api/config/import/apply',
    { bodyLimit: MAX_TRANSFER_CHARS + 1024 },
    async (request, reply) => {
      const body = applySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Dados inválidos.' });
      const result = configuration.applyImport(parseTransfer(body.data.content), {
        keepPrivate: body.data.keepPrivate === true,
        expectedVersion: body.data.expectedVersion,
      });
      if (result.status === 'stale')
        return reply.code(409).send({ error: 'A configuração mudou. Revise a prévia novamente.' });
      void monitor.invalidate();
      return { created: result.created, plan: result.plan };
    },
  );
}
