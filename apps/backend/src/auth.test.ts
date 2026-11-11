import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createAuth } from './auth.js';
it('stores only hash, rate-limits attempts and revokes session', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-auth-test-'));
  try {
    const path = join(dir, 'auth');
    const auth = createAuth(path);
    expect(auth.configured()).toBe(false);
    expect(() => auth.setup('1234567')).toThrow();
    auth.setup('12345678');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(auth.configured()).toBe(true);
    expect(() => auth.setup('another-long-password')).toThrow();
    const token = auth.login('12345678', 'client');
    expect(token).toBeTruthy();
    expect(auth.authorized(`homora_session=${token}`)).toBe(true);
    auth.logout(`homora_session=${token}`);
    expect(auth.authorized(`homora_session=${token}`)).toBe(false);
    for (let i = 0; i < 5; i++) expect(auth.login('wrong-password', 'other')).toBeNull();
    expect(auth.login('12345678', 'other')).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
