import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import type { Service } from '@homora/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Example')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://service.example','Home','')",
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

  it('keeps the configured language per channel and translates human messages', async () => {
    const { notifier, dir } = setup();
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValue({ status: 204, body: '' });
    try {
      const channel = notifier.save({
        name: 'd',
        ...base,
        type: 'discord',
        destination: DISCORD,
        locale: 'pt-BR',
      })!;
      expect(channel.locale).toBe('pt-BR');
      expect(notifier.save({ name: 'edited', ...base, type: 'discord' }, channel.id)?.locale).toBe(
        'pt-BR',
      );
      notifier.publish([service], { 1: down });
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(JSON.parse(send.mock.calls[0]?.[2]?.jsonBody ?? '{}').content).toBe(
        '🔴 Homora · Serviço indisponível\nExample\nDetalhes: erro do servidor · HTTP 502',
      );
      expect(() =>
        notifier.save({
          name: 'd',
          ...base,
          type: 'discord',
          destination: DISCORD,
          locale: 'invalid',
        }),
      ).toThrow();
    } finally {
      await notifier.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sends localized Telegram messages with the optional URL', async () => {
    const { notifier, dir } = setup();
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValue({ status: 200, body: '{"ok":true}' });
    try {
      notifier.save({
        name: 't',
        ...base,
        type: 'telegram',
        token: '123456:abc',
        chatId: '123',
        locale: 'pt-BR',
        includeUrl: true,
      });
      notifier.publish([service], { 1: down });
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(JSON.parse(send.mock.calls[0]![2]!.jsonBody!)).toMatchObject({
        chat_id: '123',
        text: '🔴 Homora · Serviço indisponível\nExample\nDetalhes: erro do servidor · HTTP 502\nhttps://service.example',
      });
    } finally {
      await notifier.stop();
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
        content: '🔴 Homora · Service unavailable\nExample\nDetails: server error · HTTP 502',
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
