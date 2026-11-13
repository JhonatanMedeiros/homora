import type { DatabaseSync } from 'node:sqlite';
import type { Service } from '@homora/shared';
import { z } from 'zod';
import type { createVault } from './vault.js';
import type { ServiceStatus } from './service-monitor.js';
import {
  createNotificationTransitions,
  type NotificationEvent,
} from './notification-transitions.js';
import { getAuthorizedResponse } from './network-request.js';

/** Channels that send to one address (plus an optional token for ntfy). */
const CHANNEL_TYPES = ['webhook', 'telegram', 'ntfy', 'discord'] as const;
type ChannelType = (typeof CHANNEL_TYPES)[number];
const DISCORD_HOSTS = /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/;

const channelSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(CHANNEL_TYPES),
    enabled: z.boolean(),
    allowPrivate: z.boolean().default(false),
    includeUrl: z.boolean().default(false),
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
type Channel = {
  id: number;
  name: string;
  type: ChannelType;
  secret: string;
  enabled: number;
  allow_private: number;
  include_url: number;
  created_at: string;
  last_sent_at: string | null;
  last_error: string | null;
  failures: number;
};
type Vault = ReturnType<typeof createVault>;
type Job = { channelId: number; event: NotificationEvent; url: string };
const maxQueue = 100;

export function createNotifications(db: DatabaseSync, vault?: Vault) {
  let stopped = false;
  let working = false;
  let pending: Promise<void> | undefined;
  const queue: Job[] = [];
  const row = (id: number) =>
    db.prepare('SELECT * FROM notification_channels WHERE id=?').get(id) as Channel | undefined;
  const publicRow = (c: Channel) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    enabled: !!c.enabled,
    allowPrivate: !!c.allow_private,
    includeUrl: !!c.include_url,
    hasSecret: true,
    createdAt: c.created_at,
    lastSentAt: c.last_sent_at,
    lastError: c.last_error,
    failures: c.failures,
  });
  function credentials(c: Channel) {
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
        'UPDATE notification_channels SET name=?,type=?,secret=?,enabled=?,allow_private=?,include_url=? WHERE id=?',
      ).run(
        data.name,
        data.type,
        sealed,
        Number(data.enabled),
        Number(data.allowPrivate),
        Number(data.includeUrl),
        old.id,
      );
      return publicRow(row(old.id)!);
    }
    const result = db
      .prepare(
        'INSERT INTO notification_channels(name,type,secret,enabled,allow_private,include_url,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        data.name,
        data.type,
        sealed,
        Number(data.enabled),
        Number(data.allowPrivate),
        Number(data.includeUrl),
        new Date().toISOString(),
      );
    return publicRow(row(Number(result.lastInsertRowid))!);
  }
  async function deliver(c: Channel, event: NotificationEvent, serviceUrl: string) {
    const secret = credentials(c);
    const text = `Homora: ${event.service.name} — ${event.event.toUpperCase()} (${event.reason})${c.include_url ? `\n${serviceUrl}` : ''}`;
    let destination = secret.destination!;
    let headers: Record<string, string> | undefined;
    let payload: unknown;
    if (c.type === 'telegram') {
      destination = `https://api.telegram.org/bot${secret.token}/sendMessage`;
      payload = { chat_id: secret.chatId, text };
    } else if (c.type === 'discord') {
      payload = { content: text.slice(0, 2000), allowed_mentions: { parse: [] } };
    } else if (c.type === 'ntfy') {
      // ntfy's JSON publishing: the topic is the path of the address, the request goes to the server root.
      const url = new URL(secret.destination!);
      const topic = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
      destination = `${url.origin}/`;
      payload = {
        topic,
        title: event.service.name,
        message: `${event.event.toUpperCase()} (${event.reason})${c.include_url && serviceUrl ? `\n${serviceUrl}` : ''}`,
        priority: event.event === 'down' ? 4 : 3,
        tags: [event.event === 'down' ? 'rotating_light' : 'white_check_mark'],
      };
      if (secret.token) headers = { authorization: `Bearer ${secret.token}` };
    } else {
      payload = {
        ...event,
        service: { ...event.service, ...(c.include_url ? { url: serviceUrl } : {}) },
      };
    }
    const response = await getAuthorizedResponse(
      destination,
      {
        origins: [new URL(destination).origin],
        allowPrivate: !!c.allow_private && (c.type === 'webhook' || c.type === 'ntfy'),
      },
      {
        timeoutMs: 5000,
        maxBodyBytes: 16384,
        jsonBody: JSON.stringify(payload),
        ...(headers ? { headers } : {}),
      },
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    if (c.type === 'telegram') {
      const parsed = z
        .object({ ok: z.literal(true) })
        .safeParse(JSON.parse(response.body) as unknown);
      if (!parsed.success) throw new Error('Telegram response invalid');
    }
  }
  const safeError = (error: unknown) =>
    error instanceof Error && /^HTTP \d{3}$/.test(error.message)
      ? error.message
      : 'Delivery failed';
  async function attempt(c: Channel, event: NotificationEvent, url: string) {
    try {
      await deliver(c, event, url);
      db.prepare(
        'UPDATE notification_channels SET last_sent_at=?,last_error=NULL,failures=0 WHERE id=?',
      ).run(new Date().toISOString(), c.id);
      return null;
    } catch (error) {
      const message = safeError(error);
      db.prepare(
        'UPDATE notification_channels SET last_error=?,failures=failures+1 WHERE id=?',
      ).run(message, c.id);
      return message;
    }
  }
  async function drain() {
    if (working || stopped) return;
    working = true;
    try {
      while (!stopped && queue.length) {
        const job = queue.shift()!;
        for (let tries = 0; tries < 3 && !stopped; tries++) {
          const channel = row(job.channelId);
          if (!channel || !channel.enabled) break;
          if (!(await attempt(channel, job.event, job.url))) break;
        }
      }
    } catch {
      // A storage or delivery failure never propagates to the monitor.
    } finally {
      working = false;
    }
  }
  return {
    list() {
      return (db.prepare('SELECT * FROM notification_channels ORDER BY id').all() as Channel[]).map(
        publicRow,
      );
    },
    save,
    remove(id: number) {
      return Number(db.prepare('DELETE FROM notification_channels WHERE id=?').run(id).changes) > 0;
    },
    async test(id: number) {
      const channel = row(id);
      if (!channel) return undefined;
      const event: NotificationEvent = {
        event: 'down',
        service: { id: 0, name: 'Homora test', category: '' },
        status: 'unavailable',
        reason: 'unchecked',
        httpStatus: null,
        latencyMs: null,
        at: new Date().toISOString(),
      };
      return await attempt(channel, event, '');
    },
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
      const channels = db
        .prepare('SELECT id FROM notification_channels WHERE enabled=1 ORDER BY id')
        .all() as { id: number }[];
      for (const event of events)
        for (const channel of channels) {
          if (queue.length >= maxQueue) {
            db.prepare(
              "UPDATE notification_channels SET last_error='Queue full',failures=failures+1 WHERE id=?",
            ).run(channel.id);
            continue;
          }
          queue.push({
            channelId: channel.id,
            event,
            url: services.find((s) => s.id === event.service.id)?.url ?? '',
          });
        }
      if (!working) pending = drain();
    },
    async stop() {
      stopped = true;
      queue.length = 0;
      await pending;
    },
  };
}
