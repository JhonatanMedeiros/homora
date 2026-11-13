import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { createVault } from './vault.js';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from './monitoring/index.js';
import { createNotificationTransitions } from './notification-transitions.js';
import { createNotificationDelivery } from './notification-delivery.js';
import { createNotificationChannels } from './notification-channels.js';

const stateSchema = z
  .object({
    signature: z.string(),
    attempt: z.string(),
    status: z.enum(['available', 'unavailable', 'unknown']),
    lastDown: z.number().nullable(),
    notifiedDown: z.boolean(),
    failures: z.number().int().nonnegative().optional(),
    oks: z.number().int().nonnegative().optional(),
  })
  .strict();
type Vault = ReturnType<typeof createVault>;

export function createNotifications(db: DatabaseSync, vault?: Vault) {
  const channels = createNotificationChannels(db, vault);
  const delivery = createNotificationDelivery(db, channels);
  return {
    list: channels.list,
    save: channels.save,
    remove: channels.remove,
    test: delivery.test,
    publish(services: Service[], states: Record<number, ServiceStatus>) {
      if (!services.length) return;
      const saved = (
        db.prepare('SELECT service_id,state FROM notification_states').all() as {
          service_id: number;
          state: string;
        }[]
      ).flatMap((r) => {
        try {
          const parsed = stateSchema.safeParse(JSON.parse(r.state) as unknown);
          return parsed.success ? [[r.service_id, parsed.data] as const] : [];
        } catch {
          return [];
        }
      });
      const limits = new Map(
        (
          db
            .prepare(
              'SELECT service_id,failure_threshold,recovery_threshold FROM service_monitor_settings',
            )
            .all() as {
            service_id: number;
            failure_threshold: number;
            recovery_threshold: number;
          }[]
        ).map((r) => [
          r.service_id,
          { failureThreshold: r.failure_threshold, recoveryThreshold: r.recovery_threshold },
        ]),
      );
      const tracker = createNotificationTransitions(
        300_000,
        saved.map(([id, value]) => [id, value]),
        (id) => limits.get(id) ?? { failureThreshold: 1, recoveryThreshold: 1 },
      );
      const events = tracker.observe(services, states);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM notification_states').run();
        const insert = db.prepare('INSERT INTO notification_states(service_id,state) VALUES(?,?)');
        for (const [id, state] of tracker.snapshot()) insert.run(id, JSON.stringify(state));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      delivery.publish(events, services);
    },
    stop: delivery.stop,
  };
}
