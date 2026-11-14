import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import type { z } from 'zod';
import { createMcp } from './mcp.js';
import { serviceProposalSchema } from './input-schemas.js';
import { cardOrderSchema, groupChangeSchema, widgetChangeSchema } from './managed-proposals.js';
import { createProposalService } from './proposals.js';
import { CARD_SCHEMA } from './test-card-schema.js';
it('validates proposal inputs and lists services without secrets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-'));
  const db = new DatabaseSync(':memory:');
  db.exec(
    CARD_SCHEMA +
      "INSERT INTO service_cards(id,name,url,category,description) VALUES (1,'Jellyfin','http://localhost/','Media',''); CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER); CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT,batch_id TEXT); CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER,detail TEXT);",
  );
  db.prepare(
    "UPDATE services SET url='http://localhost/?api_key=synthetic-secret' WHERE id=1",
  ).run();
  db.exec(
    "CREATE TABLE pages(id INTEGER PRIMARY KEY,name TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0); INSERT INTO pages VALUES(1,'Home',0),(2,'Empty',1); CREATE TABLE service_groups (id INTEGER PRIMARY KEY, name TEXT, position INTEGER, columns INTEGER,page_id INTEGER); INSERT INTO service_groups VALUES (1,'Mídia',0,NULL,1)",
  );
  db.exec(`CREATE TABLE integration_instances(id INTEGER PRIMARY KEY,type TEXT,name TEXT,public_config TEXT,secret_ref TEXT,certificate_ref TEXT);
    CREATE TABLE integration_widgets(id INTEGER PRIMARY KEY,integration_id INTEGER,type TEXT,name TEXT,public_config TEXT,service_id INTEGER);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    INSERT INTO integration_instances VALUES(1,'jellyfin','Media','{"url":"https://media.example"}','sensitive-secret',NULL)`);
  const identity = createProposalService(db).issue('test', ['services:read', 'proposals:create']);
  process.env.HOMORA_AGENT_TOKEN = identity.token;
  const server = createMcp(db, {
    docker: {
      list: async () => [
        {
          Id: 'abcdefabcdef012345',
          Names: ['/demo'],
          Labels: { 'homora.url': 'https://demo.example/?key=synthetic-secret' },
        },
      ],
    },
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual([
      'get_homora_capabilities',
      'list_trusted_ca',
      'list_services',
      'list_service_status',
      'get_service',
      'list_pages',
      'list_groups',
      'get_group',
      'list_group_services',
      'get_service_status',
      'list_status_history',
      'list_agents',
      'get_agent',
      'list_audit_history',
      'list_pins',
      'list_probes',
      'get_status_overview',
      'list_incidents',
      'get_incident',
      'list_tags',
      'list_link_types',
      'list_notification_channels',
      'get_public_status',
      'list_maintenance',
      'propose_maintenance',
      'withdraw_proposal',
      'list_proposals',
      'get_proposal',
      'propose_batch',
      'propose_agent_create',
      'propose_agent_update_scopes',
      'propose_agent_revoke',
      'propose_agent_rotate',
      'propose_service_card',
      'propose_pin',
      'propose_resource_link',
      'propose_acknowledgement',
      'propose_service_tags',
      'propose_probe',
      'propose_page_change',
      'propose_group_change',
      'propose_card_order',
      'list_widgets',
      'list_page_widgets',
      'propose_widget_change',
      'list_integrations',
      'test_connection',
      'get_integration_status',
      'list_service_dependencies',
      'list_host_suggestions',
      'propose_host_link',
      'propose_connection_setup',
      'list_discovery_suggestions',
      'propose_discovered_card',
      'list_docker_push_sources',
      'list_docker_push_suggestions',
      'propose_docker_push_card',
      'list_proxmox_resources',
    ]);
    for (const name of [
      'propose_service_card',
      'propose_group_change',
      'propose_card_order',
      'propose_widget_change',
      'propose_maintenance',
    ]) {
      const tool = tools.tools.find((t) => t.name === name);
      expect(Object.keys(tool?.inputSchema.properties ?? {})).toContain('op');
    }
    // The published discovery schema must list the same fields as the strict schema.
    const strict = {
      propose_service_card: serviceProposalSchema,
      propose_group_change: groupChangeSchema,
      propose_card_order: cardOrderSchema,
      propose_widget_change: widgetChangeSchema,
    };
    for (const [name, schema] of Object.entries(strict)) {
      const expected = new Set(
        schema.options.flatMap((option) => Object.keys((option as z.ZodObject).shape)),
      );
      const published = tools.tools.find((t) => t.name === name)?.inputSchema.properties ?? {};
      expect(new Set(Object.keys(published)), name).toEqual(expected);
      const ops = schema.options.map((option) => (option as z.ZodObject).shape.op.value);
      expect((published.op as { enum: string[] }).enum, name).toEqual(ops);
    }
    const result = await client.callTool({ name: 'list_services', arguments: {} });
    expect(JSON.stringify(await client.callTool({ name: 'list_pages', arguments: {} }))).toContain(
      'Empty',
    );
    expect(JSON.stringify(result)).toContain('Jellyfin');
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
    expect(
      JSON.stringify(await client.callTool({ name: 'list_service_status', arguments: {} })),
    ).toContain('unchecked');
    expect(
      (
        await client.callTool({
          name: 'propose_group_change',
          arguments: { op: 'create', name: 'New' },
        })
      ).isError,
    ).toBe(true);
    expect((await client.callTool({ name: 'list_widgets', arguments: {} })).isError).toBe(true);
    expect(
      JSON.stringify(await client.callTool({ name: 'get_service', arguments: { id: 1 } })),
    ).toContain('Jellyfin');
    expect((await client.callTool({ name: 'get_service', arguments: { id: 999 } })).isError).toBe(
      true,
    );
    expect(JSON.stringify(await client.callTool({ name: 'list_groups', arguments: {} }))).toContain(
      'Mídia',
    );
    expect(
      JSON.stringify(await client.callTool({ name: 'get_group', arguments: { id: 1 } })),
    ).toContain('Mídia');
    expect(
      JSON.stringify(await client.callTool({ name: 'get_service_status', arguments: { id: 1 } })),
    ).toContain('unchecked');
    for (const name of ['list_agents', 'get_agent', 'list_audit_history']) {
      const args = name === 'get_agent' ? { id: identity.id } : {};
      expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
    }
    const reader = createProposalService(db).issue('reader', ['agents:read', 'audit:read']);
    process.env.HOMORA_AGENT_TOKEN = reader.token;
    expect((await client.callTool({ name: 'list_pages', arguments: {} })).isError).toBe(true);
    const agents = JSON.stringify(await client.callTool({ name: 'list_agents', arguments: {} }));
    expect(agents).toContain('reader');
    expect(agents).not.toContain(reader.token);
    expect(agents).not.toContain('token_hash');
    expect(
      JSON.stringify(await client.callTool({ name: 'get_agent', arguments: { id: identity.id } })),
    ).toContain('test');
    expect((await client.callTool({ name: 'list_audit_history', arguments: {} })).isError).not.toBe(
      true,
    );
    process.env.HOMORA_AGENT_TOKEN = 'invalid';
    expect((await client.callTool({ name: 'get_service', arguments: { id: 1 } })).isError).toBe(
      true,
    );
    expect((await client.callTool({ name: 'list_groups', arguments: {} })).isError).toBe(true);
    process.env.HOMORA_AGENT_TOKEN = identity.token;
    const full = createProposalService(db).issue('full', [
      'services:read',
      'groups:propose',
      'widgets:read',
      'widgets:propose',
      'integrations:read',
      'connections:propose',
      'discovery:read',
      'proposals:create',
    ]);
    process.env.HOMORA_AGENT_TOKEN = full.token;
    const group = await client.callTool({
      name: 'propose_group_change',
      arguments: { op: 'create', name: 'New' },
    });
    expect(group.isError, JSON.stringify(group)).not.toBe(true);
    const widget = await client.callTool({
      name: 'propose_widget_change',
      arguments: { op: 'create', integrationId: 1, name: 'Stats', serviceId: 1 },
    });
    expect(widget.isError, JSON.stringify(widget)).not.toBe(true);
    const order = await client.callTool({
      name: 'propose_card_order',
      arguments: { op: 'reorder', category: 'Media', ids: [1] },
    });
    expect(order.isError, JSON.stringify(order)).not.toBe(true);
    for (const [name, args] of [
      ['propose_service_card', { op: 'create' }],
      ['propose_service_card', { op: 'unknown' }],
      ['propose_service_card', { op: 'delete', id: 1, extra: 1 }],
      ['propose_group_change', { op: 'rename', name: 'x' }],
      ['propose_group_change', { op: 'unknown' }],
      ['propose_group_change', { op: 'create', name: 'x', extra: 1 }],
      ['propose_card_order', { op: 'reorder', category: 'Media' }],
      ['propose_card_order', { op: 'unknown' }],
      ['propose_card_order', { op: 'reorder', category: 'Media', ids: [1], extra: 1 }],
      ['propose_widget_change', { op: 'link', id: 1 }],
      ['propose_widget_change', { op: 'unknown' }],
      ['propose_widget_change', { op: 'delete', id: 1, extra: 1 }],
    ] as const) {
      const rejected = await client.callTool({ name, arguments: { ...args } });
      expect(rejected.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
    }
    expect(
      JSON.stringify(await client.callTool({ name: 'list_integrations', arguments: {} })),
    ).not.toContain('sensitive-secret');
    expect(
      JSON.stringify(await client.callTool({ name: 'list_discovery_suggestions', arguments: {} })),
    ).toContain('abcdefabcdef');
    const discovered = await client.callTool({
      name: 'propose_discovered_card',
      arguments: { id: 'abcdefabcdef' },
    });
    expect(discovered.isError).not.toBe(true);
    expect(JSON.stringify(discovered)).not.toContain('synthetic-secret');
    expect(
      (
        await client.callTool({
          name: 'propose_connection_setup',
          arguments: { type: 'jellyfin', name: 'New', url: 'https://example.test', secret: 'x' },
        })
      ).isError,
    ).toBe(true);
    process.env.HOMORA_AGENT_TOKEN = identity.token;
    const invalid = await client.callTool({
      name: 'propose_service_card',
      arguments: { op: 'create', service: { name: 'x' } },
    });
    expect(invalid.isError).toBe(true);
    const unknownField = await client.callTool({
      name: 'propose_service_card',
      arguments: {
        op: 'create',
        service: { name: 'Home', url: 'http://localhost:8000', category: 'Homelab', admin: true },
      },
    });
    expect(unknownField.isError).toBe(true);
    const proposal = await client.callTool({
      name: 'propose_service_card',
      arguments: {
        op: 'create',
        service: { name: 'Home', url: 'http://localhost:8000', category: 'Homelab' },
      },
    });
    expect(proposal.isError, JSON.stringify(proposal)).not.toBe(true);
    const proposalData = JSON.parse((proposal.content as { text: string }[])[0].text) as {
      id: string;
    };
    expect(
      JSON.stringify(
        await client.callTool({ name: 'get_proposal', arguments: { id: proposalData.id } }),
      ),
    ).toContain(proposalData.id);
    const other = createProposalService(db).issue('other', ['proposals:create']);
    process.env.HOMORA_AGENT_TOKEN = other.token;
    expect(
      (await client.callTool({ name: 'withdraw_proposal', arguments: { id: proposalData.id } }))
        .isError,
    ).toBe(true);
    expect(
      (await client.callTool({ name: 'get_proposal', arguments: { id: proposalData.id } })).isError,
    ).toBe(true);
    expect(
      JSON.stringify(await client.callTool({ name: 'list_proposals', arguments: {} })),
    ).not.toContain(proposalData.id);
    process.env.HOMORA_AGENT_TOKEN = identity.token;
    expect(
      (await client.callTool({ name: 'withdraw_proposal', arguments: { id: proposalData.id } }))
        .isError,
    ).not.toBe(true);
    expect(
      (await client.callTool({ name: 'withdraw_proposal', arguments: { id: proposalData.id } }))
        .isError,
    ).toBe(true);
    expect(
      db
        .prepare("SELECT action FROM audit_events WHERE proposal_id=? AND action='withdraw'")
        .get(proposalData.id),
    ).toBeTruthy();
    const absent = await client.callTool({ name: 'list_proxmox_resources', arguments: {} });
    expect(absent.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    db.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  }
});
