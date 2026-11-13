import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from 'node:sqlite';
import { createProposalService } from './proposals.js';
import { createServiceConfiguration } from './service-configuration.js';
import { registerMcpServiceTools } from './mcp-service-tools.js';
import { registerMcpProposalTools } from './mcp-proposal-tools.js';
import { registerMcpCapabilitiesTool } from './mcp-capabilities-tools.js';
import { registerMcpIntegrationTools } from './mcp-integration-tools.js';
import { registerMcpHostTools } from './mcp-host-tools.js';
import { registerMcpDiscoveryTools } from './mcp-discovery-tools.js';
import { registerIntegrationTools } from './mcp-integration-extensions.js';
import type { McpOptions } from './mcp-tool-context.js';
import { createDockerPush } from './docker-push.js';

export function createMcp(database: DatabaseSync, options: McpOptions = {}) {
  const configuration = createServiceConfiguration(database);
  /** Groups with the name of the page they are on, so agents can name it. */
  const groupsWithPage = () => {
    const names = new Map(configuration.listPages().map((page) => [page.id, page.name]));
    return configuration.listGroups().map(({ pageId, ...group }) => ({
      ...group,
      page: pageId === null ? null : (names.get(pageId) ?? null),
    }));
  };
  const dockerPush = createDockerPush(database);
  const proposalService = createProposalService(database, configuration);
  const server = new McpServer({ name: 'homora', version: '0.1.0' });
  const publicStatusEnabled = () => {
    try {
      const row = database
        .prepare("SELECT value FROM app_settings WHERE key='public_status_enabled'")
        .get() as { value: string } | undefined;
      return row?.value === 'true';
    } catch {
      return false;
    }
  };
  const token = () => options.token ?? process.env.HOMORA_AGENT_TOKEN;
  const authorize = (scope: string) => proposalService.authenticate(token(), scope);
  const unauthorized = () => ({
    content: [
      {
        type: 'text' as const,
        text: 'Agent identity is missing, revoked, or lacks the required scope.',
      },
    ],
    isError: true as const,
  });
  /** Only the pending-proposal limit is named: it is actionable for the agent and not sensitive. */
  const failed = (error?: unknown) => ({
    content: [
      {
        type: 'text' as const,
        text:
          error instanceof Error && error.message === 'Pending proposal limit reached'
            ? 'Pending proposal limit reached (100). Wait for review or expiry, or withdraw one with withdraw_proposal.'
            : 'The request could not be completed.',
      },
    ],
    isError: true as const,
  });
  const result = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  });
  // URLs may contain API keys in query strings or fragments. Those portions are
  // never needed to identify a connection and must not leave through MCP.
  const publicUrl = (value: string) => {
    try {
      const url = new URL(value);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      return '';
    }
  };
  const proposalAuthor = () =>
    [
      'proposals:create',
      'groups:propose',
      'widgets:propose',
      'connections:propose',
      'hosts:propose',
      'agents:propose',
    ]
      .map(authorize)
      .find(Boolean) ?? null;
  registerMcpCapabilitiesTool(server, {
    authorize,
    unauthorized,
    result,
    proposalAuthor,
    options,
    dockerPush,
    publicStatusEnabled,
  });
  registerMcpServiceTools(server, {
    database,
    configuration,
    proposalService,
    token,
    authorize,
    unauthorized,
    failed,
    result,
    publicUrl,
    groupsWithPage,
  });
  registerMcpProposalTools(server, {
    proposalService,
    token,
    authorize,
    unauthorized,
    failed,
    result,
    proposalAuthor,
  });
  registerMcpIntegrationTools(server, {
    database,
    options,
    authorize,
    unauthorized,
    failed,
    result,
    publicUrl,
    proposalService,
  });
  registerMcpHostTools(server, {
    database,
    options,
    configuration,
    authorize,
    unauthorized,
    failed,
    result,
    proposalService,
  });
  registerMcpDiscoveryTools(server, {
    options,
    dockerPush,
    authorize,
    unauthorized,
    failed,
    result,
    publicUrl,
    proposalService,
  });
  registerIntegrationTools(server, { options, authorize, result, failed });
  return server;
}
