import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createMcp } from './index.js';
import { createProposalService } from '../proposals/index.js';

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0]!.text;
async function fixture(scopes = ['services:read', 'proposals:create', 'organization:propose']) {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.exec(`INSERT INTO service_groups(name,position,page_id) VALUES('Inbox',0,1),('Media',1,1);
    INSERT INTO monitors(id,name) VALUES(1,'Cinema'),(2,'Music'),(3,'Notes');
    INSERT INTO services(id,url,category,description,position) VALUES
    (1,'https://cinema.example.test/?token=synthetic-canary','Inbox','Movies and television',0),
    (2,'https://music.example.test/','Inbox','Music library',1),
    (3,'https://notes.example.test/','Inbox','Personal notes',2);`);
  const proposals = createProposalService(db);
  const identity = proposals.issue('synthetic-agent', scopes);
  const server = createMcp(db, { token: identity.token });
  const client = new Client({ name: 'organization-scenarios', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const snapshot = () => ({
    cards: db.prepare('SELECT id,category,position FROM services ORDER BY id').all(),
    pages: db.prepare('SELECT id,name FROM pages ORDER BY id').all(),
    pins: db.prepare('SELECT service_id FROM service_pins ORDER BY service_id').all(),
  });
  const close = async () => {
    await client.close();
    storage.close();
  };
  return { db, proposals, client, snapshot, close, token: identity.token };
}
const moves = [
  {
    kind: 'card-order',
    change: { op: 'move', id: 1, targetCategory: 'Media', sourceIds: [2, 3], targetIds: [1] },
  },
  {
    kind: 'card-order',
    change: { op: 'move', id: 2, targetCategory: 'Media', sourceIds: [3], targetIds: [1, 2] },
  },
];
const createAndPin = [
  { kind: 'page', change: { op: 'create', name: 'Screening' } },
  { kind: 'pin', change: { op: 'pin', serviceId: 1 } },
];

it('returns a reviewable media grouping and leaves all cards unchanged when rejected', async () => {
  const f = await fixture();
  try {
    const inventory = await f.client.callTool({ name: 'list_services' });
    expect(text(inventory)).not.toContain('synthetic-canary');
    expect(text(inventory).includes(f.token)).toBe(false);
    expect(JSON.parse(text(inventory)).map((item: { name: string }) => item.name)).toEqual([
      'Cinema',
      'Music',
      'Notes',
    ]);
    const before = f.snapshot();
    const response = await f.client.callTool({
      name: 'propose_batch',
      arguments: { items: moves },
    });
    expect(response.isError).not.toBe(true);
    const batch = JSON.parse(text(response));
    expect(batch.proposals).toHaveLength(2);
    expect(
      batch.proposals.map(
        (item: { diff: { change: { change: { id: number } } } }) => item.diff.change.change.id,
      ),
    ).toEqual([1, 2]);
    expect(JSON.stringify(batch)).not.toContain('synthetic-canary');
    expect(JSON.stringify(batch).includes(f.token)).toBe(false);
    expect(f.snapshot()).toEqual(before);
    expect(f.proposals.decideBatch(batch.batchId, false, 'synthetic-reviewer')).toBe('rejected');
    expect(f.snapshot()).toEqual(before);
  } finally {
    await f.close();
  }
});

it('creates a page and pins the selected service only after one human review', async () => {
  const f = await fixture();
  try {
    const before = f.snapshot();
    const response = await f.client.callTool({
      name: 'propose_batch',
      arguments: { items: createAndPin },
    });
    const batch = JSON.parse(text(response));
    expect(response.isError).not.toBe(true);
    expect(
      batch.proposals.map((item: { diff: { change: { kind: string } } }) => item.diff.change.kind),
    ).toEqual(['page', 'pin']);
    expect(f.snapshot()).toEqual(before);
    expect(f.proposals.decideBatch(batch.batchId, true, 'synthetic-reviewer')).toBe('approved');
    expect(f.snapshot().pages).toContainEqual({ id: 2, name: 'Screening' });
    expect(f.snapshot().pins).toEqual([{ service_id: 1 }]);
    expect(
      f.db.prepare("SELECT action FROM audit_events WHERE action='page-update'").get(),
    ).toBeTruthy();
    expect(() => f.proposals.decideBatch(batch.batchId, true, 'synthetic-reviewer')).toThrow();
  } finally {
    await f.close();
  }
});

it('refuses missing scope, unknown targets, stale data and expired batches without partial changes', async () => {
  const limited = await fixture(['services:read']);
  try {
    const before = limited.snapshot();
    const denied = await limited.client.callTool({
      name: 'propose_batch',
      arguments: { items: createAndPin },
    });
    expect(denied.isError).toBe(true);
    expect(limited.snapshot()).toEqual(before);
    expect(limited.db.prepare('SELECT count(*) AS n FROM service_proposals').get()).toEqual({
      n: 0,
    });
  } finally {
    await limited.close();
  }
  const f = await fixture();
  try {
    const before = f.snapshot();
    const empty = await f.client.callTool({ name: 'propose_batch', arguments: { items: [] } });
    expect(empty.isError).toBe(true);
    const invalid = await f.client.callTool({
      name: 'propose_batch',
      arguments: {
        items: [createAndPin[1]!, { kind: 'pin', change: { op: 'pin', serviceId: 999 } }],
      },
    });
    expect(invalid.isError).toBe(true);
    expect(text(invalid)).toContain('items[1]');
    expect(f.db.prepare('SELECT count(*) AS n FROM service_proposals').get()).toEqual({ n: 0 });
    expect(f.snapshot()).toEqual(before);
    const stale = JSON.parse(
      text(await f.client.callTool({ name: 'propose_batch', arguments: { items: createAndPin } })),
    );
    f.db.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
    expect(() => f.proposals.decideBatch(stale.batchId, true, 'synthetic-reviewer')).toThrow(
      'Configuration has changed',
    );
    expect(f.snapshot()).toEqual(before);
    expect(f.proposals.decideBatch(stale.batchId, false, 'synthetic-reviewer')).toBe('rejected');
    const expired = JSON.parse(
      text(await f.client.callTool({ name: 'propose_batch', arguments: { items: createAndPin } })),
    );
    f.db.prepare('UPDATE service_proposals SET expires_at=0 WHERE batch_id=?').run(expired.batchId);
    expect(() => f.proposals.decideBatch(expired.batchId, true, 'synthetic-reviewer')).toThrow(
      'unavailable',
    );
    expect(f.snapshot()).toEqual(before);
  } finally {
    await f.close();
  }
});
