import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { createDatabase } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createApp } from './app.js';
import { parseTransfer } from './transfer/index.js';

it('stores check method and interval, validates bounds, and carries values in export/import', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-check-settings-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
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
      { checkType: 'smtp' },
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

it('validates HTTP expectations and paths and preserves them through export and import', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-http-check-'));
  const db = createDatabase(join(dir, 'db.sqlite'));
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth);
  const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const base = {
    name: 'Service',
    url: 'https://example.test/dashboard',
    category: 'Home',
    description: '',
  };
  try {
    for (const checkPath of [
      '//evil.test/x',
      '/\\evil.test',
      'https://evil.test',
      '/has space',
      '/a#fragment',
    ]) {
      expect((await send('POST', '/api/services', { ...base, checkPath })).statusCode).toBe(400);
    }
    expect(
      (await send('POST', '/api/services', { ...base, expectedStatus: '600' })).statusCode,
    ).toBe(400);
    expect(
      (
        await send('POST', '/api/services', {
          ...base,
          name: 'Numeric',
          url: 'https://numeric.example.test/',
          expectedStatus: 200,
        })
      ).json(),
    ).toMatchObject({ expectedStatus: '200' });
    const created = (
      await send('POST', '/api/services', {
        ...base,
        checkPath: '/health?full=1',
        expectedStatus: '2xx',
      })
    ).json();
    expect(created).toMatchObject({ checkPath: '/health?full=1', expectedStatus: '2xx' });
    expect((await send('PUT', `/api/services/${created.id}`, base)).json()).toMatchObject({
      checkPath: '/health?full=1',
      expectedStatus: '2xx',
    });
    for (const format of ['yaml', 'json']) {
      const content = (await send('GET', `/api/config/export?format=${format}`)).body;
      const preview = (await send('POST', '/api/config/import/preview', { content })).json();
      expect(preview.plan.issues).toEqual([]);
      const exported = parse(content);
      expect(
        parseTransfer(content).document.groups[0].services.find(
          (service) => service.name === 'Service',
        ),
      ).toMatchObject({ checkPath: '/health?full=1', expectedStatus: '2xx' });
      expect(
        exported.groups[0].services.find((service: { name: string }) => service.name === 'Service'),
      ).toMatchObject({
        checkPath: '/health?full=1',
        expectedStatus: '2xx',
      });
    }
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
