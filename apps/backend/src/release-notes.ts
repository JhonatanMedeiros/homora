import { getAuthorizedResponse } from './network-request.js';

const URL = 'https://github.com/JhonatanMedeiros/homora/releases.atom';
const POLICY = { origins: ['https://github.com'], allowPrivate: false };
const SUCCESS_TTL = 6 * 60 * 60 * 1000;
const ERROR_TTL = 60 * 1000;
type Request = typeof getAuthorizedResponse;

/** One fixed public destination, shared across signed-in sessions; no request or user data leaves Homora. */
export function createReleaseNotes(request: Request = getAuthorizedResponse, now = Date.now) {
  let cache: { body: string | null; expires: number } | undefined;
  let pending: Promise<string | null> | undefined;
  return async (): Promise<string | null> => {
    if (cache && cache.expires > now()) return cache.body;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await request(URL, POLICY, {
          timeoutMs: 8000,
          maxBodyBytes: 512_000,
          headers: { accept: 'application/atom+xml' },
        });
        if (response.status !== 200) throw new Error('Release feed unavailable');
        cache = { body: response.body, expires: now() + SUCCESS_TTL };
      } catch {
        cache = { body: null, expires: now() + ERROR_TTL };
      }
      return cache.body;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}
