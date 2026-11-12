import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { createProposalService } from './proposals.js';

it('requires a session for settings and recreation and uses the persisted TTL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proposal-lifecycle-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const sqlite = getSqliteHandle(db.db);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db.db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  try {
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/proposal-settings',
          headers: { origin: 'http://localhost:5173' },
          payload: { ttlMinutes: 20 },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/proposal-settings',
          headers,
          payload: { ttlMinutes: 121 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/proposal-settings',
          headers,
          payload: { ttlMinutes: 20 },
        })
      ).json(),
    ).toEqual({ ttlMinutes: 20 });
    const proposals = createProposalService(sqlite);
    const agent = proposals.issue('test', ['proposals:create']);
    const proposal = proposals.propose(agent.id, {
      op: 'create',
      service: { name: 'Example', url: 'https://example.test', category: 'Apps' },
    });
    sqlite.prepare('UPDATE service_proposals SET expires_at=0 WHERE id=?').run(proposal.id);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${proposal.id}/recreate`,
          headers: { origin: 'http://localhost:5173' },
        })
      ).statusCode,
    ).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url: `/api/proposals/${proposal.id}/recreate`,
      headers,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().proposals[0].diff).toEqual(proposal.diff);
    expect(response.json().proposals[0].expiresAt).toBeGreaterThan(Date.now() + 19 * 60_000);
  } finally {
    await app.close();
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
