import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { AGENT_SCOPES } from './agent-scopes.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Owns agent credential issuance, authentication, rotation, revocation, and safe listing. */
export function createAgentIdentityService(sqlite: DatabaseSync) {
  function issue(name: string, scopes: string[]) {
    if (
      !name.trim() ||
      name.length > 80 ||
      !scopes.length ||
      scopes.some((scope) => !(AGENT_SCOPES as readonly string[]).includes(scope))
    )
      throw new Error('Invalid agent identity');
    const token = randomBytes(32).toString('base64url');
    const id = randomBytes(16).toString('hex');
    const normalizedScopes = [...new Set(scopes)];
    sqlite
      .prepare(
        'INSERT INTO agent_identities(id,name,token_hash,scopes,created_at) VALUES(?,?,?,?,?)',
      )
      .run(id, name.trim(), hash(token), JSON.stringify(normalizedScopes), Date.now());
    return { id, name: name.trim(), scopes: normalizedScopes, token };
  }

  function authenticate(token: string | undefined, scope: string) {
    if (!token || token.length > 256) return null;
    const row = sqlite
      .prepare('SELECT id,scopes FROM agent_identities WHERE token_hash=? AND revoked_at IS NULL')
      .get(hash(token)) as { id: string; scopes: string } | undefined;
    if (!row || !(JSON.parse(row.scopes) as string[]).includes(scope)) return null;
    return row.id;
  }

  function revoke(id: string) {
    sqlite
      .prepare('UPDATE agent_identities SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
      .run(Date.now(), id);
  }

  function rotate(id: string) {
    const token = randomBytes(32).toString('base64url');
    const result = sqlite
      .prepare('UPDATE agent_identities SET token_hash=? WHERE id=? AND revoked_at IS NULL')
      .run(hash(token), id);
    if (!result.changes) throw new Error('Identity unavailable');
    return token;
  }

  function list() {
    return sqlite
      .prepare(
        'SELECT id,name,scopes,created_at as createdAt,revoked_at as revokedAt FROM agent_identities ORDER BY created_at DESC',
      )
      .all();
  }

  return { issue, authenticate, revoke, rotate, list };
}
