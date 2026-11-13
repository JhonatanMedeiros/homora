import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Secret used to sign session cookies. `HOMORA_SESSION_SECRET` wins; otherwise a random secret
 * is created next to the database (mode 0600). Losing it only signs everyone out.
 */
export function loadSessionSecret(path: string, configured?: string): string {
  if (configured) return configured;
  const read = () => {
    const value = readFileSync(path, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid session secret file.');
    return value;
  };
  try {
    return read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return read();
}
