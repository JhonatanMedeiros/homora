import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createApp } from './app.js';

it('stores check method and interval, validates bounds, and carries values in export/import', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-check-settings-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup('test-password');
  const cookie = `homora_session=${auth.login('test-password', 'test')}`;
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth);
  const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const base = { name: 'NAS', url: 'http://192.168.1.5', category: 'Home', description: '' };
  try {
    // default: HTTP, null interval
    const plain = (await send('POST', '/api/services', base)).json();
    expect(plain).toMatchObject({ checkType: 'http', checkInterval: null });

    const ping = (
      await send('POST', '/api/services', {
        ...base,
        name: 'Router',
        checkType: 'ping',
        checkInterval: 30,
      })
    ).json();
    expect(ping).toMatchObject({ checkType: 'ping', checkInterval: 30 });

    // bounds and invalid values
    for (const bad of [
      { checkInterval: 29 },
      { checkInterval: 3601 },
      { checkInterval: 1.5 },
      { checkType: 'tcp' },
    ])
      expect((await send('POST', '/api/services', { ...base, name: 'X', ...bad })).statusCode).toBe(
        400,
      );
    expect(
      (await send('POST', '/api/services', { ...base, name: 'Y', checkInterval: 3600 })).statusCode,
    ).toBe(201);

    // editing without fields preserves existing; null restores default
    const kept = (
      await send('PUT', `/api/services/${ping.id}`, { ...base, name: 'New router' })
    ).json();
    expect(kept).toMatchObject({ name: 'New router', checkType: 'ping', checkInterval: 30 });
    const reset = (
      await send('PUT', `/api/services/${ping.id}`, {
        ...base,
        name: 'New router',
        checkType: 'http',
        checkInterval: null,
      })
    ).json();
    expect(reset).toMatchObject({ checkType: 'http', checkInterval: null });
    await send('PUT', `/api/services/${ping.id}`, {
      ...base,
      name: 'New router',
      checkType: 'ping',
      checkInterval: 120,
    });

    // export: carries only values differing from defaults
    const exported = parse((await send('GET', '/api/config/export?format=yaml')).body);
    const items = Object.fromEntries(
      exported.groups[0].services.map((s: { name: string }) => [s.name, s]),
    );
    expect(items['New router']).toMatchObject({ check: 'ping', interval: 120 });
    expect('check' in items.NAS || 'interval' in items.NAS).toBe(false);

    // import: valid values apply; invalid values trigger warnings and are ignored
    const content = [
      'version: 1',
      'groups:',
      '  - name: Network',
      '    services:',
      '      - name: Switch',
      '        url: http://192.168.1.2',
      '        check: ping',
      '        interval: 45',
      '      - name: Firewall',
      '        url: http://192.168.1.3',
      '        check: icmp',
      '        interval: 5',
    ].join('\n');
    const preview = (await send('POST', '/api/config/import/preview', { content })).json();
    const paths = preview.plan.issues
      .filter((issue: { code: string }) => issue.code === 'check-ignored')
      .map((issue: { path: string }) => issue.path)
      .sort();
    expect(paths).toEqual(['groups[0].services[1].check', 'groups[0].services[1].interval']);
    expect((await send('POST', '/api/config/import/apply', { content })).statusCode).toBe(200);
    const all = (await send('GET', '/api/services')).json() as {
      name: string;
      checkType: string;
      checkInterval: number | null;
    }[];
    expect(all.find((s) => s.name === 'Switch')).toMatchObject({
      checkType: 'ping',
      checkInterval: 45,
    });
    expect(all.find((s) => s.name === 'Firewall')).toMatchObject({
      checkType: 'http',
      checkInterval: null,
    });
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
