import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createMcp } from './index.js';
import { createProposalService } from '../proposals/index.js';

const text = (response: unknown) => (response as { content: { text: string }[] }).content[0].text;

async function setup() {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO pages(name,position) VALUES('Lab',5)").run();
  db.prepare(
    "INSERT INTO service_groups(name,position,page_id) VALUES('Apps',0,1),('Media',1,1)",
  ).run();
  db.prepare(
    "INSERT INTO page_widgets(id,page_id,type,name,config) VALUES(1,1,'x','A','{}'),(2,1,'x','B','{}')",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('organizer', ['organization:propose', 'widgets:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { storage, db, proposals, client };
}

const layout = (db: ReturnType<typeof getSqliteHandle>) => ({
  groups: db.prepare('SELECT id,page_id AS pageId FROM service_groups ORDER BY id').all(),
  widgets: db.prepare('SELECT id,page_id AS pageId,position FROM page_widgets ORDER BY id').all(),
});

it('accepts and applies a mixed page and widget batch atomically', async () => {
  const { storage, db, proposals, client } = await setup();
  try {
    const response = await client.callTool({
      name: 'propose_batch',
      arguments: {
        items: [
          { kind: 'page', change: { op: 'assign-group', id: 1, pageId: 2 } },
          { kind: 'page', change: { op: 'assign-group', id: 2, pageId: 2 } },
          { kind: 'widget', change: { op: 'move', id: 1, pageId: 2, position: 0 } },
          { kind: 'widget', change: { op: 'move', id: 2, pageId: 2, position: 1 } },
        ],
      },
    });
    expect(response.isError).not.toBe(true);
    const batch = JSON.parse(text(response));
    expect(batch.proposals).toHaveLength(4);
    expect(layout(db).groups).toEqual([
      { id: 1, pageId: 1 },
      { id: 2, pageId: 1 },
    ]);
    expect(proposals.decideBatch(batch.batchId, true, 'human')).toBe('approved');
    expect(layout(db)).toEqual({
      groups: [
        { id: 1, pageId: 2 },
        { id: 2, pageId: 2 },
      ],
      widgets: [
        { id: 1, pageId: 2, position: 0 },
        { id: 2, pageId: 2, position: 1 },
      ],
    });
  } finally {
    await client.close();
    storage.close();
  }
});

it('rejects the whole batch, naming the invalid item, and changes nothing', async () => {
  const { storage, db, client } = await setup();
  try {
    const before = layout(db);
    const versionBefore = db.prepare('SELECT version FROM config_version').get();
    const response = await client.callTool({
      name: 'propose_batch',
      arguments: {
        items: [
          { kind: 'page', change: { op: 'assign-group', id: 1, pageId: 2 } },
          { kind: 'widget', change: { op: 'move', id: 1, pageId: 2, position: 5 } },
        ],
      },
    });
    expect(response.isError).toBe(true);
    expect(text(response)).toBe(
      'batch-item-invalid: items[1] (widget): invalid-widget-position. The whole batch was rejected and nothing was changed.',
    );
    expect(layout(db)).toEqual(before);
    expect(db.prepare('SELECT version FROM config_version').get()).toEqual(versionBefore);
    expect(db.prepare('SELECT COUNT(*) AS n FROM service_proposals').get()).toEqual({ n: 0 });
  } finally {
    await client.close();
    storage.close();
  }
});
