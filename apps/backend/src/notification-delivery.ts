import type { DatabaseSync } from 'node:sqlite';
import type { Service } from '@homora/shared';
import { z } from 'zod';
import { getAuthorizedResponse } from './network-request.js';
import type { NotificationEvent } from './notification-transitions.js';

export type NotificationChannel = {
  id: number;
  name: string;
  type: 'webhook' | 'telegram';
  secret: string;
  enabled: number;
  allow_private: number;
  include_url: number;
  created_at: string;
  last_sent_at: string | null;
  last_error: string | null;
  failures: number;
};

type NotificationCredentials = {
  destination?: string;
  token?: string;
  chatId?: string;
};

type Job = { channelId: number; event: NotificationEvent; url: string };
const maxQueue = 100;

/** Keeps outbound notification requests, retries, and queue lifecycle away from channel CRUD. */
export function createNotificationDelivery(
  db: DatabaseSync,
  {
    row,
    credentials,
  }: {
    row: (id: number) => NotificationChannel | undefined;
    credentials: (channel: NotificationChannel) => NotificationCredentials;
  },
) {
  let stopped = false;
  let working = false;
  let pending: Promise<void> | undefined;
  const queue: Job[] = [];

  async function deliver(
    channel: NotificationChannel,
    event: NotificationEvent,
    serviceUrl: string,
  ) {
    const secret = credentials(channel);
    const destination =
      channel.type === 'telegram'
        ? `https://api.telegram.org/bot${secret.token}/sendMessage`
        : secret.destination!;
    const payload =
      channel.type === 'telegram'
        ? {
            chat_id: secret.chatId,
            text: `Homora: ${event.service.name} — ${event.event.toUpperCase()} (${event.reason})${channel.include_url ? `\n${serviceUrl}` : ''}`,
          }
        : {
            ...event,
            service: {
              ...event.service,
              ...(channel.include_url ? { url: serviceUrl } : {}),
            },
          };
    const response = await getAuthorizedResponse(
      destination,
      {
        origins: [new URL(destination).origin],
        allowPrivate: !!channel.allow_private && channel.type === 'webhook',
      },
      { timeoutMs: 5000, maxBodyBytes: 16384, jsonBody: JSON.stringify(payload) },
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    if (channel.type === 'telegram') {
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

  async function attempt(channel: NotificationChannel, event: NotificationEvent, url: string) {
    try {
      await deliver(channel, event, url);
      db.prepare(
        'UPDATE notification_channels SET last_sent_at=?,last_error=NULL,failures=0 WHERE id=?',
      ).run(new Date().toISOString(), channel.id);
      return null;
    } catch (error) {
      const message = safeError(error);
      db.prepare(
        'UPDATE notification_channels SET last_error=?,failures=failures+1 WHERE id=?',
      ).run(message, channel.id);
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

  function publish(events: NotificationEvent[], services: Service[]) {
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
          url: services.find((service) => service.id === event.service.id)?.url ?? '',
        });
      }
    if (!working) pending = drain();
  }

  function test(id: number) {
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
    return attempt(channel, event, '');
  }

  async function stop() {
    stopped = true;
    queue.length = 0;
    await pending;
  }

  return { publish, test, stop };
}
