import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AGENT_SCOPES } from './agent-scopes.js';
import { integrationTools } from '@homora/integrations/backend/mcp';
import type { McpRuntimeContext } from './mcp-tool-context.js';

export function registerMcpCapabilitiesTool(
  server: McpServer,
  context: Pick<
    McpRuntimeContext,
    | 'authorize'
    | 'unauthorized'
    | 'result'
    | 'proposalAuthor'
    | 'options'
    | 'dockerPush'
    | 'publicStatusEnabled'
  >,
) {
  const {
    authorize,
    unauthorized,
    result,
    proposalAuthor,
    options,
    dockerPush,
    publicStatusEnabled,
  } = context;
  server.registerTool(
    'get_homora_capabilities',
    {
      title: 'Capacidades',
      description: 'Lista os escopos autorizados e ferramentas disponíveis para esta identidade.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const scopes = AGENT_SCOPES.filter((scope) => authorize(scope));
      if (!scopes.length) return unauthorized();
      const granted = new Set<string>(scopes);
      const remoteSources = dockerPush.countActive();
      const definitions: Array<{ name: string; scopes: string[]; enabled?: boolean }> = [
        { name: 'get_homora_capabilities', scopes: [] },
        ...[
          'list_services',
          'get_service',
          'list_pages',
          'list_groups',
          'list_service_status',
          'get_group',
          'list_group_services',
          'get_service_status',
        ].map((name) => ({
          name,
          scopes: ['services:read'],
        })),
        ...['list_agents', 'get_agent'].map((name) => ({ name, scopes: ['agents:read'] })),
        { name: 'list_audit_history', scopes: ['audit:read'] },
        { name: 'list_status_history', scopes: ['services:read'] },
        { name: 'list_service_dependencies', scopes: ['services:read'] },
        ...[
          'propose_agent_create',
          'propose_agent_update_scopes',
          'propose_agent_revoke',
          'propose_agent_rotate',
        ].map((name) => ({ name, scopes: ['agents:propose'] })),
        ...integrationTools().map(({ name, scopes }) => ({ name, scopes: [...scopes] })),
        ...['propose_service_card', 'propose_card_order'].map((name) => ({
          name,
          scopes: ['proposals:create'],
        })),
        { name: 'propose_group_change', scopes: ['groups:propose'] },
        ...['list_maintenance', 'propose_maintenance'].map((name) => ({
          name,
          scopes: ['maintenance:propose'],
        })),
        { name: 'list_widgets', scopes: ['widgets:read'] },
        { name: 'propose_widget_change', scopes: ['widgets:propose'] },
        ...['list_integrations', 'get_integration_status'].map((name) => ({
          name,
          scopes: ['integrations:read'],
        })),
        { name: 'propose_connection_setup', scopes: ['connections:propose'] },
        { name: 'list_host_suggestions', scopes: ['hosts:read'] },
        { name: 'propose_host_link', scopes: ['hosts:propose'] },
        ...['list_docker_push_sources', 'list_docker_push_suggestions'].map((name) => ({
          name,
          scopes: ['discovery:read'],
        })),
        { name: 'propose_docker_push_card', scopes: ['discovery:read', 'proposals:create'] },
        {
          name: 'list_discovery_suggestions',
          scopes: ['discovery:read'],
          enabled: Boolean(options.docker),
        },
        {
          name: 'propose_discovered_card',
          scopes: ['discovery:read', 'proposals:create'],
          enabled: Boolean(options.docker),
        },
      ];
      return result({
        scopes,
        discoveryEnabled: Boolean(options.docker) || remoteSources > 0,
        discovery: {
          enabled: Boolean(options.docker) || remoteSources > 0,
          sources: remoteSources + Number(Boolean(options.docker)),
        },
        // Read-only: agents cannot change what is public; that is an administrator decision.
        publicStatusEnabled: publicStatusEnabled(),
        tools: [
          ...definitions.map(({ name, scopes: required, enabled }) => ({
            name,
            requiredScopes: required,
            available: enabled !== false && required.every((scope) => granted.has(scope)),
          })),
          ...['list_proposals', 'get_proposal', 'withdraw_proposal'].map((name) => ({
            name,
            requiredScopes: ['any proposal scope'],
            available: Boolean(proposalAuthor()),
          })),
          {
            name: 'propose_batch',
            requiredScopes: ['scope for each item'],
            available: Boolean(proposalAuthor()),
          },
        ],
      });
    },
  );
}
