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
import { createDockerPush } from './discovery/index.js';
import { createMcpIdentity } from './mcp-identity.js';
import { failed, publicUrl, result, unauthorized } from './mcp-responses.js';

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
  const { token, authorize, proposalAuthor } = createMcpIdentity(
    proposalService,
    () => options.token ?? process.env.HOMORA_AGENT_TOKEN,
  );
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
