import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { createVault } from './vault.js';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from './service-monitor.js';
import { createNotificationTransitions } from './notification-transitions.js';
import {
  CHANNEL_TYPES,
  createNotificationDelivery,
  type NotificationChannel,
} from './notification-delivery.js';

const DISCORD_HOSTS = /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/;

const channelSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(CHANNEL_TYPES),
    enabled: z.boolean(),
    allowPrivate: z.boolean().default(false),
    includeUrl: z.boolean().default(false),
    locale: z.enum(['en', 'pt-BR']).optional(),
    destination: z.string().max(2048).optional(),
    token: z.string().max(256).optional(),
    chatId: z.string().max(128).optional(),
  })
  .strict();
const secretsSchema = z
  .object({
    destination: z.string().max(2048).optional(),
    token: z.string().max(256).optional(),
    chatId: z.string().max(128).optional(),
  })
  .strict();
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
  const row = (id: number) =>
    db.prepare('SELECT * FROM notification_channels WHERE id=?').get(id) as
      NotificationChannel | undefined;
  const publicRow = (c: NotificationChannel) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    enabled: !!c.enabled,
    allowPrivate: !!c.allow_private,
    includeUrl: !!c.include_url,
    locale: c.locale,
    hasSecret: true,
    createdAt: c.created_at,
    lastSentAt: c.last_sent_at,
    lastError: c.last_error,
    failures: c.failures,
  });
  function credentials(c: NotificationChannel) {
    if (!vault) throw new Error('Vault unavailable');
    return secretsSchema.parse(JSON.parse(vault.unseal(c.secret)) as unknown);
  }
  function save(input: unknown, id?: number) {
    if (!vault) throw new Error('Vault unavailable');
    const data = channelSchema.parse(input);
    const old = id === undefined ? undefined : row(id);
    if (id !== undefined && !old) return null;
    const previous = old && old.type === data.type ? credentials(old) : {};
    const secret =
      data.type === 'telegram'
        ? { token: data.token || previous.token, chatId: data.chatId || previous.chatId }
        : data.type === 'ntfy'
          ? {
              destination: data.destination || previous.destination,
              // An empty token on edit keeps the stored one; there is no way to clear it but replacing the channel.
              token: data.token || previous.token,
            }
          : { destination: data.destination || previous.destination };
    if (data.type !== 'telegram') {
      if (!secret.destination) throw new Error('Destination required');
      const url = new URL(secret.destination);
      const secure = url.protocol === 'https:';
      // ntfy on the LAN is usually plain HTTP; that is only accepted for a private address without a token.
      const lan = data.type === 'ntfy' && data.allowPrivate && !('token' in secret && secret.token);
      if (
        (!secure && !(lan && url.protocol === 'http:')) ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error('Invalid destination');
      if (
        data.type === 'discord' &&
        !(
          DISCORD_HOSTS.test(url.hostname) && /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)
        )
      )
        throw new Error('Invalid destination');
      if (data.type === 'ntfy' && (url.pathname.replace(/\/+$/, '') === '' || url.search))
        throw new Error('Invalid destination');
    } else if (
      !secret.token ||
      !secret.chatId ||
      !/^\d+:[A-Za-z0-9_-]+$/.test(secret.token) ||
      !/^-?\d+$/.test(secret.chatId)
    )
      throw new Error('Invalid Telegram credentials');
    // Never create a replacement key over any existing encrypted credentials.
    const encrypted =
      db
        .prepare('SELECT 1 FROM integration_instances WHERE secret_ref IS NOT NULL LIMIT 1')
        .get() || db.prepare('SELECT 1 FROM notification_channels LIMIT 1').get();
    const sealed = vault.seal(JSON.stringify(secret), !encrypted);
    if (old) {
      db.prepare(
        'UPDATE notification_channels SET name=?,type=?,secret=?,enabled=?,allow_private=?,include_url=?,locale=? WHERE id=?',
      ).run(
        data.name,
        data.type,
        sealed,
        Number(data.enabled),
        Number(data.allowPrivate),
        Number(data.includeUrl),
        data.locale ?? old.locale,
        old.id,
      );
      return publicRow(row(old.id)!);
    }
    const result = db
      .prepare(
        'INSERT INTO notification_channels(name,type,secret,enabled,allow_private,include_url,locale,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        data.name,
        data.type,
        sealed,
        Number(data.enabled),
        Number(data.allowPrivate),
        Number(data.includeUrl),
        data.locale ?? 'en',
        new Date().toISOString(),
      );
    return publicRow(row(Number(result.lastInsertRowid))!);
  }
  const delivery = createNotificationDelivery(db, { row, credentials });
  return {
    list() {
      return (
        db.prepare('SELECT * FROM notification_channels ORDER BY id').all() as NotificationChannel[]
      ).map(publicRow);
    },
    save,
    remove(id: number) {
      return Number(db.prepare('DELETE FROM notification_channels WHERE id=?').run(id).changes) > 0;
    },
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
