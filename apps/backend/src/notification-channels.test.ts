import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import type { Service } from '@homora/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as network from './network-request.js';
import { createNotifications } from './notifications.js';
import { createVault } from './vault.js';
import type { ServiceStatus } from './service-monitor.js';

const service = {
  id: 1,
  name: 'Example',
  category: 'Home',
  url: 'https://service.example',
  description: '',
} as Service;
const down: ServiceStatus = {
  status: 'unavailable',
  reason: 'error-status',
  httpStatus: 502,
  latencyMs: null,
  lastAttempt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
};
const base = { enabled: true, allowPrivate: false, includeUrl: false };
const DISCORD = 'https://discord.com/api/webhooks/123456789/abc-DEF_ghi';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'homora-channels-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const db = getSqliteHandle(database.db);
  db.prepare(
    "INSERT INTO services(id,name,url,category,description) VALUES(1,'Example','https://service.example','Home','')",
  ).run();
  return { notifier: createNotifications(db, createVault(path)), dir };
}
afterEach(() => vi.restoreAllMocks());

describe('ntfy and Discord channels', () => {
  it('validates the address of each kind', () => {
    const { notifier, dir } = setup();
    try {
      const save = (value: object) => notifier.save({ name: 'c', ...base, ...value });
      expect(save({ type: 'discord', destination: DISCORD })).toMatchObject({ type: 'discord' });
      expect(() =>
        save({ type: 'discord', destination: 'https://example.com/api/webhooks/1/x' }),
      ).toThrow();
      expect(() =>
        save({ type: 'discord', destination: 'http://discord.com/api/webhooks/1/x' }),
      ).toThrow();
      expect(() => save({ type: 'discord', destination: 'https://discord.com/other' })).toThrow();
      expect(save({ type: 'ntfy', destination: 'https://ntfy.sh/homora' })).toMatchObject({
        type: 'ntfy',
      });
      expect(() => save({ type: 'ntfy', destination: 'https://ntfy.sh/' })).toThrow();
      expect(() => save({ type: 'ntfy', destination: 'https://ntfy.sh/a?x=1' })).toThrow();
      // Plain HTTP only for a private address and no token.
      expect(() => save({ type: 'ntfy', destination: 'http://ntfy.lan/homora' })).toThrow();
      expect(() =>
        save({
          type: 'ntfy',
          allowPrivate: true,
          token: 'tk_1',
          destination: 'http://ntfy.lan/homora',
        }),
      ).toThrow();
      expect(
        save({ type: 'ntfy', allowPrivate: true, destination: 'http://ntfy.lan/homora' }),
      ).toBeTruthy();
    } finally {
      notifier.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sends Discord a plain message that mentions nobody, and ntfy a JSON publish with its token', async () => {
    const { notifier, dir } = setup();
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValue({ status: 204, body: '' });
    try {
      notifier.save({ name: 'd', ...base, type: 'discord', destination: DISCORD });
      notifier.save({
        name: 'n',
        ...base,
        includeUrl: true,
        type: 'ntfy',
        destination: 'https://ntfy.example/homora-alerts',
        token: 'tk_secret',
      });
      notifier.publish([service], { 1: down });
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      const [discord, ntfy] = send.mock.calls;
      expect(discord?.[0]).toBe(DISCORD);
      expect(JSON.parse(discord?.[2]?.jsonBody ?? '{}')).toEqual({
        content: 'Homora: Example — DOWN (error-status)',
        allowed_mentions: { parse: [] },
      });
      expect(ntfy?.[0]).toBe('https://ntfy.example/');
      expect(ntfy?.[1]).toEqual({ origins: ['https://ntfy.example'], allowPrivate: false });
      expect(ntfy?.[2]?.headers).toEqual({ authorization: 'Bearer tk_secret' });
      expect(JSON.parse(ntfy?.[2]?.jsonBody ?? '{}')).toMatchObject({
        topic: 'homora-alerts',
        title: 'Example',
        priority: 4,
        message: expect.stringContaining('https://service.example'),
      });
    } finally {
      notifier.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
