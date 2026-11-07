import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createAuth } from './auth.js';
it('guarda apenas hash, limita tentativas e revoga a sessão', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-auth-test-'));
  try {
    const path = join(dir, 'auth');
    const auth = createAuth(path);
    expect(auth.configured()).toBe(false);
    expect(() => auth.setup('1234567')).toThrow();
    auth.setup('12345678');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(auth.configured()).toBe(true);
    expect(() => auth.setup('outra-senha-longa')).toThrow();
    const token = auth.login('12345678', 'cliente');
    expect(token).toBeTruthy();
    expect(auth.authorized(`homora_session=${token}`)).toBe(true);
    auth.logout(`homora_session=${token}`);
    expect(auth.authorized(`homora_session=${token}`)).toBe(false);
    for (let i = 0; i < 5; i++) expect(auth.login('senha-incorreta', 'outro')).toBeNull();
    expect(auth.login('12345678', 'outro')).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
