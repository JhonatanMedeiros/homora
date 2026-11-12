import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createAuditLog } from './audit.js';

let database: ReturnType<typeof createDatabase> | undefined;
afterEach(() => {
  database?.close();
  database = undefined;
});

function setup() {
  database = createDatabase(':memory:');
  return createAuditLog(getSqliteHandle(database.db));
}

describe('audit log query', () => {
  it('combines kind and outcome filters on the server', () => {
    const audit = setup();
    audit.record({ actor: 'anonymous', action: 'login', result: 'failed' });
    audit.record({ actor: 'user:1', action: 'login', result: 'ok' });
    audit.record({ actor: 'user:1', action: 'review', result: 'rejected', proposalId: 'p-1' });
    audit.record({ actor: 'agent-1', action: 'proposal', result: 'created', proposalId: 'p-1' });
    const pick = (filter: Parameters<typeof audit.list>[0]) =>
      audit.list(filter).events.map((event) => [event.action, event.outcome]);
    expect(pick({ kind: 'access', outcome: 'failure' })).toEqual([['login', 'failure']]);
    expect(pick({ kind: 'proposal', outcome: 'refused' })).toEqual([['review', 'refused']]);
    expect(pick({ kind: 'access', outcome: 'refused' })).toEqual([]);
    expect(pick({ kind: 'proposal' })).toHaveLength(2);
  });

  it('exposes the proposal an event refers to', () => {
    const audit = setup();
    audit.record({ actor: 'user:1', action: 'review', result: 'approved', proposalId: 'p-9' });
    audit.record({ actor: 'user:1', action: 'logout', result: 'ok' });
    const [logout, review] = audit.list().events;
    expect(review?.proposalId).toBe('p-9');
    expect(logout?.proposalId).toBeNull();
  });

  it('pages with the cursor without repeating or skipping events', () => {
    const audit = setup();
    for (let index = 0; index < 7; index++)
      audit.record({ actor: 'user:1', action: 'logout', result: 'ok', detail: String(index) });
    const seen: number[] = [];
    let before: number | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = audit.list({ limit: 3, before });
      seen.push(...page.events.map((event) => event.id));
      if (page.nextBefore === null) break;
      // Events recorded while paging must not shift the next page.
      audit.record({ actor: 'user:1', action: 'logout', result: 'ok' });
      before = page.nextBefore;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
  });

  it('names user, agent and anonymous actors', () => {
    const audit = setup();
    audit.record({ actor: 'anonymous', action: 'login', result: 'failed' });
    audit.record({ actor: 'user:missing', action: 'logout', result: 'ok' });
    const [user, anonymous] = audit.list().events;
    expect(anonymous?.actor).toEqual({ type: 'anonymous', name: null });
    expect(user?.actor).toEqual({ type: 'user', name: null });
  });
});
