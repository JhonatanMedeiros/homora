import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const MAX_ATTEMPTS = 5;
const WINDOW = 15 * 60 * 1000;
const SESSION = 8 * 60 * 60 * 1000;
type Account = { salt: string; hash: string };
export function createAuth(path: string) {
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; until: number }>();
  function readAccount(): Account | null {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8')) as Account;
      if (!/^[0-9a-f]{32}$/.test(data.salt) || !/^[0-9a-f]{128}$/.test(data.hash))
        throw new Error('Invalid authentication file.');
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  function setup(password: unknown) {
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 1024)
      throw new Error('Password must be between 8 characters and 1024 bytes.');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    writeFileSync(path, JSON.stringify({ salt, hash }), { flag: 'wx', mode: 0o600 });
  }
  function login(password: unknown, client: string) {
    const now = Date.now();
    const current = attempts.get(client);
    if (current && current.until > now && current.count >= MAX_ATTEMPTS) return null;
    const account = readAccount();
    if (!account || typeof password !== 'string' || Buffer.byteLength(password) > 1024) return null;
    const actual = scryptSync(password, account.salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(account.hash, 'hex'))) {
      const state = current && current.until > now ? current : { count: 0, until: now + WINDOW };
      state.count++;
      attempts.set(client, state);
      return null;
    }
    attempts.delete(client);
    const token = randomBytes(32).toString('base64url');
    sessions.set(createHash('sha256').update(token).digest('hex'), now + SESSION);
    return token;
  }
  function authorized(cookie: string | undefined) {
    const token = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('homora_session='))
      ?.slice('homora_session='.length);
    if (!token || !/^[\w-]{43}$/.test(token)) return false;
    const key = createHash('sha256').update(token).digest('hex');
    const expires = sessions.get(key);
    if (!expires || expires < Date.now()) {
      sessions.delete(key);
      return false;
    }
    return true;
  }
  function logout(cookie: string | undefined) {
    const token = cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('homora_session='))
      ?.slice('homora_session='.length);
    if (token) sessions.delete(createHash('sha256').update(token).digest('hex'));
  }
  return { configured: () => readAccount() !== null, setup, login, authorized, logout };
}
