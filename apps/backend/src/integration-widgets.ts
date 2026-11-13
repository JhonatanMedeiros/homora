import { eq } from 'drizzle-orm';
import { InputError } from './api-error.js';
import { z } from 'zod';
import { createDatabase, integrationInstances, integrationWidgets, services } from '@homora/db';

type Db = ReturnType<typeof createDatabase>['db'];
type Connection = typeof integrationInstances.$inferSelect;
const widgetSchema = z
  .object({
    id: z.number(),
    integrationId: z.number(),
    type: z.string(),
    name: z.string(),
    publicConfig: z.string(),
    serviceId: z.number().nullable(),
  })
  .strict();

/** Storage operations for dashboard widgets attached to integration connections. */
export function createIntegrationWidgets(
  db: Db,
  findConnection: (id: number) => Promise<Connection | undefined>,
  migrateLegacy: () => number | null,
) {
  async function serviceExists(id: number) {
    return (
      (await db.select({ id: services.id }).from(services).where(eq(services.id, id))).length > 0
    );
  }

  return {
    async listWidgets() {
      const rows = await db.select().from(integrationWidgets);
      return rows.map((row) => widgetSchema.parse(row));
    },
    async createWidget(
      target: { integrationId: number } | { source: 'proxmox' },
      name: string,
      serviceId: number | null = null,
    ) {
      const legacyId = migrateLegacy();
      if ('source' in target && legacyId === null) throw new InputError('proxmox-not-configured');
      const connection = await findConnection(
        'source' in target ? legacyId! : target.integrationId,
      );
      if (!connection) return null;
      if (serviceId !== null && !(await serviceExists(serviceId)))
        return 'service-missing' as const;
      const [widget] = await db
        .insert(integrationWidgets)
        .values({
          integrationId: connection.id,
          type: connection.type,
          name,
          publicConfig: '{}',
          serviceId,
        })
        .returning();
      return widgetSchema.parse(widget);
    },
    async updateWidget(id: number, patch: { serviceId?: number | null; name?: string }) {
      const serviceId = patch.serviceId;
      if (serviceId !== undefined && serviceId !== null && !(await serviceExists(serviceId)))
        return 'service-missing' as const;
      const [widget] = await db
        .update(integrationWidgets)
        .set(patch)
        .where(eq(integrationWidgets.id, id))
        .returning();
      return widget ? widgetSchema.parse(widget) : null;
    },
    async deleteWidget(id: number) {
      const rows = await db
        .delete(integrationWidgets)
        .where(eq(integrationWidgets.id, id))
        .returning();
      return rows.length > 0;
    },
  };
}
