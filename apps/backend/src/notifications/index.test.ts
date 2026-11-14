import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import type { Service } from '@homora/shared';
import { afterEach, expect, it, vi } from 'vitest';
import * as network from '../network-request.js';
import { createNotifications } from './index.js';
import { createVault } from '../vault.js';
import type { ServiceStatus } from '../monitoring/index.js';

const service = {
  id: 1,
  name: 'Example',
  category: 'Home',
  url: 'https://service.example',
  description: '',
} as Service;
const status = (value: 'available' | 'unavailable', minute: number): ServiceStatus => ({
  status: value,
  reason: value === 'available' ? 'responding' : 'no-response',
  httpStatus: null,
  latencyMs: null,
  lastAttempt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
});
const input = {
  name: 'Example',
  type: 'webhook',
  enabled: true,
  allowPrivate: false,
  includeUrl: false,
  destination: 'https://hooks.example/private-token',
};
afterEach(() => vi.restoreAllMocks());

it('persists transitions and encrypts destination without exposing it in payloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-notifications-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const db = getSqliteHandle(database.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Example')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://service.example','Home','')",
  ).run();
  const send = vi
    .spyOn(network, 'getAuthorizedResponse')
    .mockResolvedValue({ status: 200, body: '' });
  try {
    let notifier = createNotifications(db, createVault(path));
    const channel = notifier.save(input)!;
    expect(JSON.stringify(channel)).not.toContain('private-token');
    expect(JSON.stringify(db.prepare('SELECT * FROM notification_channels').all())).not.toContain(
      'private-token',
    );
    notifier.publish([service], { 1: status('unavailable', 0) });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][2]?.jsonBody).not.toContain('service.example');
    notifier.stop();
    notifier = createNotifications(db, createVault(path));
    notifier.publish([service], { 1: status('unavailable', 1) });
    expect(send).toHaveBeenCalledTimes(1);
    notifier.publish([service], { 1: status('available', 2) });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(JSON.parse(send.mock.calls[1][2]!.jsonBody!).event).toBe('up');
    notifier.stop();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('retries failures independently and exposes only a sanitized HTTP error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-notifications-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const db = getSqliteHandle(database.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Example')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://service.example','Home','')",
  ).run();
  const send = vi
    .spyOn(network, 'getAuthorizedResponse')
    .mockResolvedValue({ status: 503, body: 'private-token' });
  try {
    const notifier = createNotifications(db, createVault(path));
    const channel = notifier.save(input)!;
    notifier.publish([service], { 1: status('unavailable', 0) });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    await vi.waitFor(() =>
      expect(notifier.list()[0]).toMatchObject({ failures: 3, lastError: 'HTTP 503' }),
    );
    expect(await notifier.test(channel.id)).toBe('HTTP 503');
    expect(JSON.stringify(notifier.list())).not.toContain('private-token');
    notifier.stop();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('protects channel routes with the session and never returns credentials', async () => {
  const { createApp } = await import('../app.js');
  const { createTestSession } = await import('../test-auth.js');
  const dir = mkdtempSync(join(tmpdir(), 'homora-notification-routes-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth, createVault(path));
  try {
    expect(
      (await app.inject({ method: 'GET', url: '/api/notifications/channels' })).statusCode,
    ).toBe(401);
    const headers = { cookie, origin: 'http://localhost:5173' };
    const created = await app.inject({
      method: 'POST',
      url: '/api/notifications/channels',
      headers,
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain('private-token');
    const id = created.json().id;
    expect(
      (await app.inject({ method: 'GET', url: '/api/notifications/channels', headers })).body,
    ).not.toContain('private-token');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/notifications/channels',
          headers,
          payload: { ...input, destination: 'http://example.com' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/notifications/channels/${id}`, headers }))
        .statusCode,
    ).toBe(200);
  } finally {
    await app.close();
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('sends Telegram messages to Telegram only and keeps credentials out of the channel DTO', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-telegram-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const send = vi
    .spyOn(network, 'getAuthorizedResponse')
    .mockResolvedValue({ status: 200, body: '{"ok":true}' });
  try {
    const notifier = createNotifications(getSqliteHandle(database.db), createVault(path));
    const channel = notifier.save({
      name: 'Telegram',
      type: 'telegram',
      enabled: true,
      token: '12345:fakeToken',
      chatId: '-10012345',
    })!;
    expect(JSON.stringify(channel)).not.toContain('fakeToken');
    expect(await notifier.test(channel.id)).toBeNull();
    expect(send.mock.calls[0][0]).toBe('https://api.telegram.org/bot12345:fakeToken/sendMessage');
    expect(send.mock.calls[0][1]).toEqual({
      origins: ['https://api.telegram.org'],
      allowPrivate: false,
    });
    expect(JSON.parse(send.mock.calls[0][2]!.jsonBody!).chat_id).toBe('-10012345');
    await notifier.stop();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
