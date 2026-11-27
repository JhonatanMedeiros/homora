import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import type { OidcConfig } from './oidc-config.js';

export const IDP_CLIENT_ID = 'homora-client';
export const IDP_CLIENT_SECRET = 'client-secret-for-tests-only';

type Claims = Record<string, unknown>;
type Grant = { challenge: string; nonce: string; claims: Claims; redirectUri: string };

/**
 * A real HTTP OpenID provider on a loopback port: discovery, keys and a token endpoint that
 * checks PKCE, the client credentials, the redirect URI and single use of the code, and signs
 * genuine JWTs. Better Auth talks to it exactly as it would to Authentik or Keycloak.
 */
export async function createMockIdp() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' };
  const grants = new Map<string, Grant>();
  const requests: string[] = [];
  const state = {
    down: false,
    discovery: {} as Record<string, unknown>,
    tokenStatus: 200,
    withoutIdToken: false,
    signingKey: undefined as CryptoKey | undefined,
  };
  let issuer = '';

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', issuer || 'http://127.0.0.1');
    requests.push(url.pathname);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (state.down) return send(503, {});
    const origin = new URL(issuer).origin;
    if (url.pathname === '/application/o/homora/.well-known/openid-configuration')
      return send(200, {
        issuer,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        jwks_uri: `${origin}/jwks`,
        userinfo_endpoint: `${origin}/userinfo`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
        ...state.discovery,
      });
    if (url.pathname === '/jwks') return send(200, { keys: [jwk] });
    // Answers with the linked subject, as an attacker without a signed token would want.
    if (url.pathname === '/userinfo')
      return send(200, { sub: 'subject-1', email: 'idp@example.test' });
    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const form = new URLSearchParams(raw);
      const code = form.get('code') ?? '';
      const grant = grants.get(code);
      grants.delete(code);
      const basic = req.headers.authorization;
      const secretOk =
        basic ===
          `Basic ${Buffer.from(`${IDP_CLIENT_ID}:${IDP_CLIENT_SECRET}`).toString('base64')}` ||
        (form.get('client_id') === IDP_CLIENT_ID &&
          form.get('client_secret') === IDP_CLIENT_SECRET);
      if (
        state.tokenStatus !== 200 ||
        !secretOk ||
        !grant ||
        form.get('redirect_uri') !== grant.redirectUri ||
        createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url') !== grant.challenge
      )
        return send(state.tokenStatus === 200 ? 400 : state.tokenStatus, {
          error: 'invalid_grant',
        });
      const jwt = new SignJWT({ nonce: grant.nonce, ...grant.claims }).setProtectedHeader({
        alg: 'RS256',
        kid: 'key-1',
      });
      if (grant.claims.iss === undefined) jwt.setIssuer(issuer);
      if (grant.claims.aud === undefined) jwt.setAudience(IDP_CLIENT_ID);
      if (grant.claims.iat === undefined) jwt.setIssuedAt();
      if (grant.claims.exp === undefined) jwt.setExpirationTime('5m');
      return send(200, {
        access_token: 'access-token-never-stored',
        refresh_token: 'refresh-token-never-stored',
        token_type: 'Bearer',
        id_token: state.withoutIdToken ? undefined : await jwt.sign(state.signingKey ?? privateKey),
      });
    }
    return send(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/application/o/homora/`;

  return {
    issuer,
    requests,
    state,
    config(overrides: Partial<OidcConfig> = {}): OidcConfig {
      return {
        issuer,
        clientId: IDP_CLIENT_ID,
        clientSecret: IDP_CLIENT_SECRET,
        name: 'Test IdP',
        redirectOrigin: 'http://localhost:5173',
        ...overrides,
      };
    },
    /** The person approves at the provider: returns the redirect (path and query) it sends back. */
    approve(
      authorizationUrl: string,
      claims: Claims = { sub: 'subject-1', email: 'idp@example.test' },
    ) {
      const params = new URL(authorizationUrl).searchParams;
      const code = randomUUID();
      grants.set(code, {
        challenge: params.get('code_challenge') ?? '',
        nonce: params.get('nonce') ?? '',
        claims,
        redirectUri: params.get('redirect_uri') ?? '',
      });
      const back = new URL(params.get('redirect_uri') ?? '');
      back.searchParams.set('code', code);
      back.searchParams.set('state', params.get('state') ?? '');
      return `${back.pathname}${back.search}`;
    },
    async foreignKey() {
      return (await generateKeyPair('RS256')).privateKey;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
export type MockIdp = Awaited<ReturnType<typeof createMockIdp>>;
