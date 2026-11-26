import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createMcp } from './index.js';
import { createProposalService } from '../proposals/index.js';

const responseText = (response: unknown) =>
  (response as { content: { text: string }[] }).content[0].text;

it('restricts operational reads and returns only approved fields', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare(
    "INSERT INTO monitors(id,name,check_url) VALUES(1,'Probe','https://example.test/?secret=hidden')",
  ).run();
  db.prepare(
    "INSERT INTO service_incidents(service_id,started_at,ended_at,reason) VALUES(1,100,200,'no-response')",
  ).run();
  db.prepare(
    "INSERT INTO notification_channels(name,type,secret,enabled,created_at) VALUES('Alerts','webhook','hidden',1,'today')",
  ).run();
  db.prepare(
    "INSERT INTO service_maintenance(service_id,starts_at,ends_at,note) VALUES(1,?,?,'hidden')",
  ).run(Date.now() - 1000, Date.now() + 60000);
  db.prepare("INSERT INTO app_settings(key,value) VALUES('public_status_title','Status')").run();
  const identities = createProposalService(db);
  const makeClient = async (scopes: string[]) => {
    const server = createMcp(db, { token: identities.issue(scopes.join(','), scopes).token });
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    return client;
  };
  const reader = await makeClient([
    'services:read',
    'probes:read',
    'incidents:read',
    'notifications:read',
  ]);
  const denied = await makeClient(['audit:read']);
  const names = [
    'list_probes',
    'list_pins',
    'get_status_overview',
    'list_incidents',
    'get_incident',
    'investigate_incident',
    'list_tags',
    'list_link_types',
    'list_notification_channels',
    'get_public_status',
  ];
  try {
    const caps = JSON.parse(
      responseText(await reader.callTool({ name: 'get_homora_capabilities' })),
    );
    for (const name of names) {
      const args = name === 'get_incident' || name === 'investigate_incident' ? { id: 1 } : {};
      const value = await reader.callTool({ name, arguments: args });
      expect(value.isError, name).not.toBe(true);
      expect(JSON.stringify(value), name).not.toContain('hidden');
      expect(caps.tools).toContainEqual(expect.objectContaining({ name, available: true }));
      expect((await denied.callTool({ name, arguments: args })).isError, name).toBe(true);
    }
    expect(
      (
        await denied.callTool({
          name: 'propose_page_change',
          arguments: { op: 'create', name: 'Denied' },
        })
      ).isError,
    ).toBe(true);
    for (const [name, args] of [
      ['list_trusted_ca', {}],
      ['list_page_widgets', {}],
      ['test_connection', { id: 1 }],
      ['propose_probe', { op: 'delete', id: 1 }],
      ['propose_acknowledgement', { op: 'clear', serviceId: 1 }],
      ['propose_service_tags', { serviceId: 1, tags: [] }],
      ['propose_resource_link', { op: 'unlink', serviceId: 1 }],
      ['propose_pin', { op: 'pin', serviceId: 1 }],
    ] as const) {
      expect((await denied.callTool({ name, arguments: args })).isError, name).toBe(true);
    }
    const incidents = JSON.parse(responseText(await reader.callTool({ name: 'list_incidents' })));
    expect(incidents.incidents).toMatchObject([
      { id: 1, serviceId: 1, startedAt: 100, endedAt: 200, durationMs: 100 },
    ]);
    const overview = JSON.parse(
      responseText(await reader.callTool({ name: 'get_status_overview' })),
    );
    expect(overview).toMatchObject({
      states: { maintenance: 1 },
      activeMaintenance: 1,
      openIncidents: 0,
    });
    const channels = JSON.parse(
      responseText(await reader.callTool({ name: 'list_notification_channels' })),
    );
    expect(channels).toEqual([
      { id: 1, name: 'Alerts', type: 'webhook', enabled: true, hasSecret: true },
    ]);
  } finally {
    await reader.close();
    await denied.close();
    storage.close();
  }
});

it('requires review for page proposals and rejects stale batches', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  const proposals = createProposalService(db);
  const agent = proposals.issue('organizer', ['organization:propose', 'services:read']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const pending = await client.callTool({
      name: 'propose_page_change',
      arguments: { op: 'create', name: 'Media' },
    });
    expect(pending.isError).not.toBe(true);
    const proposal = JSON.parse(responseText(pending));
    expect(db.prepare("SELECT id FROM pages WHERE name='Media'").get()).toBeUndefined();
    expect(proposal.diff.before.pages).toHaveLength(1);
    expect(proposals.decide(proposal.id, true, 'human')).toBe('approved');
    expect(db.prepare("SELECT name FROM pages WHERE name='Media'").get()).toEqual({
      name: 'Media',
    });
    expect(
      db
        .prepare("SELECT action FROM audit_events WHERE proposal_id=? AND action='page-update'")
        .get(proposal.id),
    ).toEqual({ action: 'page-update' });
    const media = db.prepare("SELECT id FROM pages WHERE name='Media'").get() as { id: number };
    const callPage = async (change: Record<string, unknown>) => {
      const response = await client.callTool({ name: 'propose_page_change', arguments: change });
      expect(response.isError).not.toBe(true);
      return JSON.parse(responseText(response)) as { id: string };
    };
    const rename = await callPage({ op: 'rename', id: media.id, name: 'Films' });
    proposals.decide(rename.id, true, 'human');
    expect(db.prepare('SELECT name FROM pages WHERE id=?').get(media.id)).toEqual({
      name: 'Films',
    });
    const reorder = await callPage({ op: 'reorder', ids: [media.id, 1] });
    proposals.decide(reorder.id, true, 'human');
    expect(db.prepare('SELECT id FROM pages ORDER BY position').all()).toEqual([
      { id: media.id },
      { id: 1 },
    ]);
    db.prepare("INSERT INTO service_groups(name,position,page_id) VALUES('Group',0,1)").run();
    const group = db.prepare("SELECT id FROM service_groups WHERE name='Group'").get() as {
      id: number;
    };
    const move = await callPage({ op: 'assign-group', id: group.id, pageId: media.id });
    proposals.decide(move.id, true, 'human');
    expect(db.prepare('SELECT page_id FROM service_groups WHERE id=?').get(group.id)).toEqual({
      page_id: media.id,
    });
    const deletion = await callPage({ op: 'delete', id: media.id, moveTo: 1 });
    proposals.decide(deletion.id, true, 'human');
    expect(db.prepare('SELECT page_id FROM service_groups WHERE id=?').get(group.id)).toEqual({
      page_id: 1,
    });
    const batch = JSON.parse(
      responseText(
        await client.callTool({
          name: 'propose_batch',
          arguments: { items: [{ kind: 'page', change: { op: 'create', name: 'Other' } }] },
        }),
      ),
    );
    db.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
    expect(() => proposals.decideBatch(batch.batchId, true, 'human')).toThrow(
      'Configuration has changed',
    );
    expect(db.prepare("SELECT id FROM pages WHERE name='Other'").get()).toBeUndefined();
    const fresh = JSON.parse(
      responseText(
        await client.callTool({
          name: 'propose_batch',
          arguments: { items: [{ kind: 'page', change: { op: 'create', name: 'Other' } }] },
        }),
      ),
    );
    expect(proposals.decideBatch(fresh.batchId, true, 'human')).toBe('approved');
    expect(db.prepare("SELECT name FROM pages WHERE name='Other'").get()).toEqual({
      name: 'Other',
    });
  } finally {
    await client.close();
    storage.close();
  }
});

it('reviews probe proposals, audits changes and detects intervening probe edits', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  const proposals = createProposalService(db);
  const agent = proposals.issue('probe bot', ['probes:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const propose = async (change: Record<string, unknown>) => {
    const response = await client.callTool({ name: 'propose_probe', arguments: change });
    expect(response.isError).not.toBe(true);
    return JSON.parse(responseText(response)) as {
      id: string;
      diff: { change: { change: { probe?: { name: string } } } };
    };
  };
  try {
    const created = await propose({
      op: 'create',
      probe: { name: ' WAN ', address: 'https://example.test/', checkMatch: 'private-match' },
    });
    expect(created.diff.change.change.probe?.name).toBe('WAN');
    expect(JSON.stringify(created)).not.toContain('private-match');
    expect(db.prepare('SELECT id FROM monitors').all()).toEqual([]);
    proposals.decide(created.id, true, 'human');
    expect(db.prepare('SELECT name FROM monitors').all()).toEqual([{ name: 'WAN' }]);
    expect(db.prepare('SELECT id FROM services').all()).toEqual([]);
    expect(
      db
        .prepare("SELECT detail FROM audit_events WHERE proposal_id=? AND action='probe-create'")
        .get(created.id),
    ).toEqual({ detail: 'probe:1' });
    const stale = await propose({
      op: 'update',
      id: 1,
      probe: { name: 'Changed', address: 'https://example.test' },
    });
    db.prepare("UPDATE monitors SET name='External' WHERE id=1").run();
    expect(() => proposals.decide(stale.id, true, 'human')).toThrow('Configuration has changed');
    const update = await propose({
      op: 'update',
      id: 1,
      probe: { name: 'Changed', address: 'https://example.test' },
    });
    expect(JSON.stringify(update)).not.toContain('private-match');
    proposals.decide(update.id, true, 'human');
    expect(db.prepare('SELECT check_match FROM monitors WHERE id=1').get()).toEqual({
      check_match: 'private-match',
    });
    const del = await propose({ op: 'delete', id: 1 });
    proposals.decide(del.id, true, 'human');
    expect(db.prepare('SELECT id FROM monitors').all()).toEqual([]);
    expect(
      db
        .prepare(
          "SELECT action FROM audit_events WHERE proposal_id IN (?,?) AND action LIKE 'probe-%' ORDER BY id",
        )
        .all(update.id, del.id),
    ).toEqual([{ action: 'probe-update' }, { action: 'probe-delete' }]);
  } finally {
    await client.close();
    storage.close();
  }
});

it('proposes normalized service tags and rejects edits after the tags change', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Card')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://example.test','Apps','')",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('organizer', ['organization:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const request = async () =>
      JSON.parse(
        responseText(
          await client.callTool({
            name: 'propose_service_tags',
            arguments: { serviceId: 1, tags: [' Prod ', 'prod', 'Media Server'] },
          }),
        ),
      );
    const proposal = await request();
    expect(proposal.diff.change.change.tags).toEqual(['media-server', 'prod']);
    expect(db.prepare('SELECT * FROM service_tags').all()).toEqual([]);
    proposals.decide(proposal.id, true, 'human');
    expect(db.prepare('SELECT tag FROM service_tags ORDER BY tag').all()).toEqual([
      { tag: 'media-server' },
      { tag: 'prod' },
    ]);
    expect(
      db
        .prepare(
          "SELECT action FROM audit_events WHERE proposal_id=? AND action='service-tags-update'",
        )
        .get(proposal.id),
    ).toEqual({ action: 'service-tags-update' });
    const stale = await request();
    db.prepare("INSERT INTO service_tags(service_id,tag) VALUES(1,'external')").run();
    expect(() => proposals.decide(stale.id, true, 'human')).toThrow('Configuration has changed');
  } finally {
    await client.close();
    storage.close();
  }
});

it('proposes an acknowledgement without hiding an incident until review', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Probe')").run();
  db.prepare(
    "INSERT INTO service_incidents(id,service_id,started_at,reason) VALUES(1,1,1,'no-response')",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('incidents', ['incidents:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const response = await client.callTool({
      name: 'propose_acknowledgement',
      arguments: { op: 'ack', serviceId: 1, incidentId: 1, muteMinutes: 30 },
    });
    expect(response.isError).not.toBe(true);
    const proposal = JSON.parse(responseText(response));
    expect(db.prepare('SELECT * FROM service_acknowledgements').all()).toEqual([]);
    proposals.decide(proposal.id, true, 'human');
    const row = db
      .prepare(
        'SELECT incident_id AS incidentId,acknowledged_at AS at,muted_until AS until FROM service_acknowledgements WHERE service_id=1',
      )
      .get() as { incidentId: number; at: number; until: number };
    expect(row.incidentId).toBe(1);
    expect(row.until - row.at).toBe(30 * 60_000);
    expect(
      db
        .prepare(
          "SELECT action FROM audit_events WHERE proposal_id=? AND action='service-acknowledge'",
        )
        .get(proposal.id),
    ).toEqual({ action: 'service-acknowledge' });
    const bad = await client.callTool({
      name: 'propose_acknowledgement',
      arguments: { op: 'ack', serviceId: 1, incidentId: 999 },
    });
    expect(bad.isError).toBe(true);
    const clear = JSON.parse(
      responseText(
        await client.callTool({
          name: 'propose_acknowledgement',
          arguments: { op: 'clear', serviceId: 1 },
        }),
      ),
    );
    db.prepare('UPDATE service_acknowledgements SET muted_until=0 WHERE service_id=1').run();
    expect(() => proposals.decide(clear.id, true, 'human')).toThrow('Configuration has changed');
  } finally {
    await client.close();
    storage.close();
  }
});

it('moves page widgets only after review and keeps both pages ordered', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO pages(id,name,position) VALUES(2,'Other',1)").run();
  db.prepare(
    "INSERT INTO page_widgets(id,page_id,type,name,config,version,position) VALUES(1,1,'clock','Clock','{}',1,0),(2,1,'clock','Clock 2','{}',1,1),(3,2,'clock','Clock 3','{}',1,0)",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('widget bot', ['widgets:read', 'widgets:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const listed = JSON.parse(responseText(await client.callTool({ name: 'list_page_widgets' })));
    expect(listed).toHaveLength(3);
    const response = await client.callTool({
      name: 'propose_widget_change',
      arguments: { op: 'move', id: 1, pageId: 2, position: 0 },
    });
    expect(response.isError).not.toBe(true);
    const proposal = JSON.parse(responseText(response));
    expect(db.prepare('SELECT page_id FROM page_widgets WHERE id=1').get()).toEqual({ page_id: 1 });
    proposals.decide(proposal.id, true, 'human');
    expect(
      db.prepare('SELECT id,page_id,position FROM page_widgets ORDER BY page_id,position').all(),
    ).toEqual([
      { id: 2, page_id: 1, position: 0 },
      { id: 1, page_id: 2, position: 0 },
      { id: 3, page_id: 2, position: 1 },
    ]);
    expect(
      (
        await client.callTool({
          name: 'propose_widget_change',
          arguments: { op: 'move', id: 1, pageId: 2, position: 99 },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    storage.close();
  }
});

it('reviews resource links and rejects URLs with credentials or query strings', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Card')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://example.test','Apps','')",
  ).run();
  db.prepare(
    "INSERT INTO integration_instances(id,type,name,public_config) VALUES(1,'coolify','Server','{}')",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('organizer', ['organization:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const change = {
      op: 'link',
      serviceId: 1,
      integrationId: 1,
      resourceUuid: 'app-1',
      resourceType: 'application',
      name: 'App',
      url: 'https://app.example.test/',
    };
    expect(
      (
        await client.callTool({
          name: 'propose_resource_link',
          arguments: { ...change, url: 'https://app.example.test/?token=hidden' },
        })
      ).isError,
    ).toBe(true);
    const response = await client.callTool({ name: 'propose_resource_link', arguments: change });
    expect(response.isError).not.toBe(true);
    const proposal = JSON.parse(responseText(response));
    expect(db.prepare('SELECT id FROM integration_resource_links').all()).toEqual([]);
    proposals.decide(proposal.id, true, 'human');
    expect(db.prepare('SELECT resource_uuid FROM integration_resource_links').get()).toEqual({
      resource_uuid: 'app-1',
    });
    const unlink = JSON.parse(
      responseText(
        await client.callTool({
          name: 'propose_resource_link',
          arguments: { op: 'unlink', serviceId: 1 },
        }),
      ),
    );
    proposals.decide(unlink.id, true, 'human');
    expect(db.prepare('SELECT id FROM integration_resource_links').all()).toEqual([]);
    expect(
      db
        .prepare(
          "SELECT action FROM audit_events WHERE proposal_id=? AND action='resource-link-remove'",
        )
        .get(unlink.id),
    ).toEqual({ action: 'resource-link-remove' });
  } finally {
    await client.close();
    storage.close();
  }
});

it('reviews pin changes and exact order without changing cards before approval', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'A'),(2,'B')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://a.test','Apps',''),(2,'https://b.test','Apps','')",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('organizer', ['organization:propose', 'services:read']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const propose = async (change: Record<string, unknown>) => {
    const response = await client.callTool({ name: 'propose_pin', arguments: change });
    expect(response.isError).not.toBe(true);
    return JSON.parse(responseText(response)) as { id: string };
  };
  try {
    const one = await propose({ op: 'pin', serviceId: 1 });
    expect(db.prepare('SELECT * FROM service_pins').all()).toEqual([]);
    proposals.decide(one.id, true, 'human');
    const two = await propose({ op: 'pin', serviceId: 2 });
    proposals.decide(two.id, true, 'human');
    expect(
      (await client.callTool({ name: 'propose_pin', arguments: { op: 'reorder', ids: [1] } }))
        .isError,
    ).toBe(true);
    const reorder = await propose({ op: 'reorder', ids: [2, 1] });
    proposals.decide(reorder.id, true, 'human');
    expect(
      db.prepare("SELECT value FROM app_settings WHERE key='service_pin_order'").get(),
    ).toEqual({ value: '[2,1]' });
    expect(JSON.parse(responseText(await client.callTool({ name: 'list_pins' })))).toEqual([
      { id: 2, name: 'B' },
      { id: 1, name: 'A' },
    ]);
    const unpin = await propose({ op: 'unpin', serviceId: 2 });
    proposals.decide(unpin.id, true, 'human');
    expect(
      db.prepare("SELECT value FROM app_settings WHERE key='service_pin_order'").get(),
    ).toEqual({ value: '[1]' });
  } finally {
    await client.close();
    storage.close();
  }
});

it('hides connection URLs from MCP proposals while retaining them for human review', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  const proposals = createProposalService(db);
  const agent = proposals.issue('setup', ['connections:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const response = await client.callTool({
      name: 'propose_connection_setup',
      arguments: { type: 'jellyfin', name: 'Media', url: 'https://connection.example.test' },
    });
    expect(response.isError).not.toBe(true);
    expect(responseText(response)).not.toContain('connection.example.test');
    const proposal = JSON.parse(responseText(response));
    expect(
      String(
        (
          db.prepare('SELECT diff FROM service_proposals WHERE id=?').get(proposal.id) as {
            diff: string;
          }
        ).diff,
      ),
    ).toContain('connection.example.test');
    expect(
      responseText(await client.callTool({ name: 'get_proposal', arguments: { id: proposal.id } })),
    ).not.toContain('connection.example.test');
    expect(responseText(await client.callTool({ name: 'list_proposals' }))).not.toContain(
      'connection.example.test',
    );
  } finally {
    await client.close();
    storage.close();
  }
});

it('reviews a mixed batch of all new proposal kinds atomically', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Card')").run();
  db.prepare(
    "INSERT INTO services(id,url,category,description) VALUES(1,'https://card.test','Apps','')",
  ).run();
  db.prepare(
    "INSERT INTO integration_instances(id,type,name,public_config) VALUES(1,'coolify','Server','{}')",
  ).run();
  const proposals = createProposalService(db);
  const agent = proposals.issue('all', ['organization:propose', 'probes:propose']);
  const server = createMcp(db, { token: agent.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const items = [
      { kind: 'page', change: { op: 'create', name: 'Media' } },
      {
        kind: 'probe',
        change: { op: 'create', probe: { name: 'WAN', address: 'https://example.test' } },
      },
      { kind: 'tag', change: { serviceId: 1, tags: ['prod'] } },
      { kind: 'pin', change: { op: 'pin', serviceId: 1 } },
      {
        kind: 'link',
        change: {
          op: 'link',
          serviceId: 1,
          integrationId: 1,
          resourceUuid: 'app-1',
          resourceType: 'application',
          name: 'App',
          url: null,
        },
      },
    ];
    const response = await client.callTool({ name: 'propose_batch', arguments: { items } });
    expect(response.isError).not.toBe(true);
    const batch = JSON.parse(responseText(response));
    expect(batch.proposals).toHaveLength(5);
    expect(db.prepare('SELECT service_id FROM service_pins').all()).toEqual([]);
    expect(proposals.decideBatch(batch.batchId, true, 'human')).toBe('approved');
    expect(db.prepare("SELECT name FROM pages WHERE name='Media'").get()).toBeDefined();
    expect(db.prepare("SELECT name FROM monitors WHERE name='WAN'").get()).toBeDefined();
    expect(db.prepare('SELECT tag FROM service_tags').get()).toEqual({ tag: 'prod' });
    expect(db.prepare('SELECT service_id FROM service_pins').get()).toEqual({ service_id: 1 });
    expect(db.prepare('SELECT resource_uuid FROM integration_resource_links').get()).toEqual({
      resource_uuid: 'app-1',
    });
    expect(db.prepare("SELECT action FROM audit_events WHERE action='probe-create'").get()).toEqual(
      { action: 'probe-create' },
    );
  } finally {
    await client.close();
    storage.close();
  }
});

it('redacts URL query secrets from card proposal responses and proposal history', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  const proposals = createProposalService(db);
  const identity = proposals.issue('cards', ['proposals:create']);
  const server = createMcp(db, { token: identity.token });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  try {
    const response = await client.callTool({
      name: 'propose_service_card',
      arguments: {
        op: 'create',
        service: {
          name: 'A',
          category: 'Apps',
          url: 'https://example.test/?token=synthetic-secret',
          icon: 'https://example.test/icon?token=synthetic-secret',
        },
      },
    });
    expect(response.isError).not.toBe(true);
    expect(responseText(response)).not.toContain('synthetic-secret');
    const proposal = JSON.parse(responseText(response));
    expect(
      responseText(await client.callTool({ name: 'get_proposal', arguments: { id: proposal.id } })),
    ).not.toContain('synthetic-secret');
    expect(responseText(await client.callTool({ name: 'list_proposals' }))).not.toContain(
      'synthetic-secret',
    );
  } finally {
    await client.close();
    storage.close();
  }
});

it('requires both read scopes for an investigation and excludes raw check fields', async () => {
  const storage = createDatabase(':memory:');
  const db = getSqliteHandle(storage.db);
  const now = Date.now();
  db.prepare("INSERT INTO monitors(id,name) VALUES(1,'Hostile untrusted name')").run();
  db.prepare(
    "INSERT INTO service_incidents(id,service_id,started_at,reason) VALUES(1,1,?,'no-response')",
  ).run(now - 60_000);
  db.prepare(
    'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
  ).run(
    1,
    'fixture',
    now - 30_000,
    JSON.stringify({ status: 'unavailable', reason: 'secret-canary' }),
  );
  const identities = createProposalService(db);
  const clients: Client[] = [];
  try {
    for (const scopes of [
      ['incidents:read'],
      ['services:read'],
      ['incidents:read', 'services:read'],
    ]) {
      const server = createMcp(db, { token: identities.issue(scopes.join(','), scopes).token });
      const client = new Client({ name: 'test', version: '1' });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(a), server.connect(b)]);
      clients.push(client);
    }
    for (const client of clients.slice(0, 2))
      expect(
        (await client.callTool({ name: 'investigate_incident', arguments: { id: 1 } })).isError,
      ).toBe(true);
    const response = await clients[2]!.callTool({
      name: 'investigate_incident',
      arguments: { id: 1 },
    });
    expect(response.isError).not.toBe(true);
    expect(JSON.stringify(response)).not.toContain('secret-canary');
    expect(JSON.stringify(response)).not.toContain('Hostile untrusted name');
    expect(JSON.parse(responseText(response)).evidence.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'monitor-check' })]),
    );
    const missing = await clients[2]!.callTool({
      name: 'investigate_incident',
      arguments: { id: 999 },
    });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toEqual({ code: 'not-found', id: 999 });
    expect(JSON.parse(responseText(missing))).toEqual({ code: 'not-found', id: 999 });
    const invalid = await clients[2]!.callTool({
      name: 'investigate_incident',
      arguments: { id: -1 },
    });
    expect(invalid.isError).toBe(true);
    db.prepare(
      "INSERT INTO service_incidents(id,service_id,started_at,reason) VALUES(2,1,?,'secret-canary')",
    ).run(now + 86_400_000);
    const failure = await clients[2]!.callTool({
      name: 'investigate_incident',
      arguments: { id: 2 },
    });
    expect(failure.isError).toBe(true);
    expect(responseText(failure)).toBe('The request could not be completed.');
    expect(JSON.stringify(failure)).not.toContain('secret-canary');
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    storage.close();
  }
});
