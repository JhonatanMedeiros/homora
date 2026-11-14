import type { ConnectionData, Credentials } from './integration-connection-config.js';
import type { IntegrationTransport, IntegrationRegistration } from './index.js';
import { getAuthorizedResponse } from '../network-request.js';

/** Builds the JSON transport shared by integration reads and host address lookups. */
export function createIntegrationTransport(
  data: ConnectionData,
  credentials: Credentials,
  invalidJson: 'error' | 'empty' = 'error',
  defaultMaxBodyBytes?: number,
  sessionAuth?: IntegrationRegistration['sessionAuth'],
): IntegrationTransport {
  let session: { id: string; expires: number; ttl: number } | undefined;
  let pending: Promise<string> | undefined;
  const policy = { origins: [new URL(data.url).origin], allowPrivate: data.allowPrivate };
  const safeKey = (key: string) =>
    typeof key === 'string' &&
    /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(key) &&
    !['constructor', 'prototype', '__proto__'].includes(key);
  const safePath = (path: readonly string[]) =>
    Array.isArray(path) && path.length > 0 && path.length <= 6 && path.every(safeKey);
  const readPath = (value: unknown, path: readonly string[]): unknown => {
    let current = value;
    for (const key of path) {
      if (
        !current ||
        typeof current !== 'object' ||
        Array.isArray(current) ||
        !Object.hasOwn(current, key)
      )
        return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };
  function validateProfile(): NonNullable<typeof sessionAuth> {
    const p = sessionAuth;
    if (
      !p ||
      !/^\/(?:[a-zA-Z0-9_.~-]+\/)*[a-zA-Z0-9_.~-]+$/.test(p.loginPath) ||
      p.loginPath.split('/').some((part) => part === '.' || part === '..') ||
      p.loginPath.length > 256 ||
      !p.body ||
      typeof p.body !== 'object' ||
      Array.isArray(p.body) ||
      Object.keys(p.body).length < 1 ||
      Object.keys(p.body).length > 8 ||
      !Object.entries(p.body).every(
        ([key, field]) =>
          safeKey(key) &&
          field &&
          (field.source === 'secret' ||
            field.source === 'tokenId' ||
            (field.source === 'config' && safeKey(field.key))),
      ) ||
      !Object.values(p.body).some((field) => field.source === 'secret') ||
      !safePath(p.tokenPath) ||
      (p.validPath !== undefined && !safePath(p.validPath)) ||
      (p.validityPath !== undefined && !safePath(p.validityPath)) ||
      (p.validityPath === undefined &&
        (typeof p.defaultValiditySeconds !== 'number' ||
          !Number.isFinite(p.defaultValiditySeconds) ||
          p.defaultValiditySeconds <= 0)) ||
      !['base64', 'printable'].includes(p.tokenFormat) ||
      !p.sendAs ||
      (p.sendAs.type !== 'bearer' &&
        (p.sendAs.type !== 'header' || !['x-ftl-sid', 'x-api-key'].includes(p.sendAs.name))) ||
      typeof p.refreshOnSuccess !== 'boolean'
    )
      throw new Error('Integration authentication unavailable.');
    return p;
  }
  async function login(): Promise<string> {
    const profile = validateProfile();
    if (session && session.expires > Date.now()) return session.id;
    if (pending) return pending;
    const task = (async () => {
      const body: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const [key, field] of Object.entries(profile.body)) {
        const value =
          field.source === 'config'
            ? Object.hasOwn(data, field.key)
              ? data[field.key]
              : undefined
            : credentials[field.source];
        if (typeof value !== 'string' || value.length === 0 || value.length > 4096)
          throw new Error('Integration authentication unavailable.');
        body[key] = value;
      }
      const result = await getAuthorizedResponse(
        new URL(profile.loginPath, data.url).href,
        policy,
        {
          jsonBody: JSON.stringify(body),
          sensitiveBody: true,
          maxBodyBytes: 16384,
          ca: credentials.ca,
        },
      );
      if (result.status !== 200) throw new Error('Integration authentication failed.');
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.body) as unknown;
      } catch {
        throw new Error('Integration authentication failed.');
      }
      const token = readPath(parsed, profile.tokenPath);
      const validity = profile.validityPath
        ? readPath(parsed, profile.validityPath)
        : profile.defaultValiditySeconds;
      const tokenPattern =
        profile.tokenFormat === 'base64' ? /^[A-Za-z0-9+/=_-]{1,256}$/ : /^[\x21-\x7e]{1,2048}$/;
      if (
        (profile.validPath && readPath(parsed, profile.validPath) !== true) ||
        typeof token !== 'string' ||
        !tokenPattern.test(token) ||
        typeof validity !== 'number' ||
        !Number.isFinite(validity) ||
        validity <= 0
      )
        throw new Error('Integration authentication failed.');
      const lifetime = Math.min(validity, 86400);
      const ttl = (lifetime - Math.min(5, lifetime * 0.1)) * 1000;
      session = { id: token, expires: Date.now() + ttl, ttl };
      return token;
    })();
    pending = task;
    try {
      return await task;
    } finally {
      if (pending === task) pending = undefined;
    }
  }
  return async (request) => {
    const send = async (sid?: string) =>
      getAuthorizedResponse(new URL(request.path, request.origin).href, policy, {
        headers: {
          ...(request.authorization ? { authorization: request.authorization } : {}),
          ...(request.apiKey ? { 'x-api-key': request.apiKey } : {}),
          ...(sid && sessionAuth?.sendAs.type === 'header'
            ? { [sessionAuth.sendAs.name]: sid }
            : {}),
          ...(sid && sessionAuth?.sendAs.type === 'bearer'
            ? { authorization: `Bearer ${sid}` }
            : {}),
        },
        ca: credentials.ca,
        ...((request.maxBodyBytes ?? defaultMaxBodyBytes)
          ? { maxBodyBytes: request.maxBodyBytes ?? defaultMaxBodyBytes }
          : {}),
      });
    let sid = sessionAuth ? await login() : undefined;
    let response = await send(sid);
    if (sessionAuth && response.status === 401) {
      if (session?.id === sid) session = undefined;
      sid = await login();
      response = await send(sid);
    }
    if (response.status === 401 && session?.id === sid) session = undefined;
    if (
      sessionAuth?.refreshOnSuccess &&
      response.status >= 200 &&
      response.status < 300 &&
      session &&
      session.id === sid
    )
      session.expires = Date.now() + session.ttl;

    let body: unknown = null;
    if (response.body) {
      try {
        body = JSON.parse(response.body) as unknown;
      } catch {
        if (invalidJson === 'error') throw new Error('Resposta JSON inválida.');
      }
    }
    return {
      status: response.status,
      body,
      ...(response.retryAfterSeconds ? { retryAfterSeconds: response.retryAfterSeconds } : {}),
    };
  };
}
