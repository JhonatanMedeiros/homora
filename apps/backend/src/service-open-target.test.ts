import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createApp } from './app.js';

it('preserves the opening preference across edits and exports and imports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-open-target-'));
  const db = createDatabase(join(dir, 'db.sqlite'));
  const { auth, cookie } = await createTestSession();
  const app = createApp(db.db, 5173, auth);
  const headers = { origin: 'http://localhost:5173', cookie };
  const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const base = { name: 'NAS', url: 'https://example.com', category: 'Home', description: '' };
  try {
    const plain = (await send('POST', '/api/services', base)).json();
    expect(plain.openTarget).toBe('new-tab');
    const same = (
      await send('POST', '/api/services', {
        ...base,
        name: 'Wiki',
        url: 'https://wiki.example.com',
        openTarget: 'same-tab',
      })
    ).json();
    expect(same.openTarget).toBe('same-tab');
    expect((await send('POST', '/api/services', { ...base, openTarget: 'other' })).statusCode).toBe(
      400,
    );
    expect(
      (
        await send('PUT', `/api/services/${same.id}`, {
          ...base,
          name: 'Wiki',
          url: 'https://wiki.example.com',
        })
      ).json().openTarget,
    ).toBe('same-tab');
    for (const format of ['yaml', 'json']) {
      const content = (await send('GET', `/api/config/export?format=${format}`)).body;
      expect(content).toContain('same-tab');
      const preview = (await send('POST', '/api/config/import/preview', { content })).json();
      expect(preview.plan.issues).toEqual([]);
    }
    const content =
      'version: 1\ngroups:\n  - name: Other\n    services:\n      - name: App\n        url: https://app.example.com\n        openTarget: same-tab\n      - name: Old\n        url: https://old.example.com\n      - name: Invalid\n        url: https://invalid.example.com\n        openTarget: invalid\n';
    const preview = (await send('POST', '/api/config/import/preview', { content })).json();
    expect(preview.plan.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'open-target-ignored' })]),
    );
    expect((await send('POST', '/api/config/import/apply', { content })).statusCode).toBe(200);
    const services = (await send('GET', '/api/services')).json() as {
      name: string;
      openTarget: string;
    }[];
    expect(services.find((service) => service.name === 'App')?.openTarget).toBe('same-tab');
    expect(services.find((service) => service.name === 'Old')?.openTarget).toBe('new-tab');
    expect(services.find((service) => service.name === 'Invalid')?.openTarget).toBe('new-tab');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
