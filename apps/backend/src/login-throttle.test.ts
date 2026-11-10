import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const PASSWORD = 'senha-para-testes';

function setup(trustProxy: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'homora-throttle-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup(PASSWORD);
  const app = createApp(db.db, 5173, auth, undefined, [], undefined, { trustProxy });
  const login = (password: string, forwardedFor?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: 'http://localhost:5173',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      payload: { password },
    });
  return {
    login,
    done: async () => {
      await app.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

it('atrás do proxy de confiança, cada cliente tem o próprio limite de tentativas', async () => {
  const { login, done } = setup(true);
  try {
    for (let i = 0; i < 5; i++) expect((await login('errada', '203.0.113.7')).statusCode).toBe(401);
    // o cliente que errou fica bloqueado, mesmo com a senha certa...
    expect((await login(PASSWORD, '203.0.113.7')).statusCode).toBe(401);
    // ...mas outro cliente continua podendo entrar
    expect((await login(PASSWORD, '198.51.100.9')).statusCode).toBe(200);
  } finally {
    await done();
  }
});

it('sem proxy de confiança o cabeçalho é ignorado, então forjá-lo não escapa do limite', async () => {
  const { login, done } = setup(false);
  try {
    for (let i = 0; i < 5; i++)
      expect((await login('errada', `203.0.113.${i}`)).statusCode).toBe(401);
    // trocar o IP informado não zera o contador: o cliente real é o mesmo
    expect((await login(PASSWORD, '198.51.100.9')).statusCode).toBe(401);
  } finally {
    await done();
  }
});

it('lê HOMORA_TRUST_PROXY e recusa valores ambíguos', () => {
  expect(loadConfig({}).trustProxy).toBe(false);
  expect(loadConfig({ HOMORA_TRUST_PROXY: 'false' }).trustProxy).toBe(false);
  expect(loadConfig({ HOMORA_TRUST_PROXY: 'true' }).trustProxy).toBe(true);
  expect(() => loadConfig({ HOMORA_TRUST_PROXY: '1' })).toThrow('HOMORA_TRUST_PROXY');
});
