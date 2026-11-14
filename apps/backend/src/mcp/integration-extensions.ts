import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { integrationTools } from '@homora/integrations/backend/mcp';
import type { RegisteredIntegrationTool } from '@homora/integrations/backend/mcp';
import type { McpRuntimeContext } from './tool-context.js';

export async function executeIntegrationTool(
  tool: RegisteredIntegrationTool,
  context: Pick<McpRuntimeContext, 'options' | 'authorize' | 'result' | 'failed'>,
) {
  if (!tool.scopes.every((scope) => context.authorize(scope)))
    return {
      content: [
        {
          type: 'text' as const,
          text: tool.unauthorizedMessage ?? 'Agent lacks the required scope.',
        },
      ],
      isError: true,
    };
  const listConnections = async () => {
    const connections = await context.options.connections?.listConnections();
    return connections?.filter((connection) => connection.type === tool.integrationType) ?? null;
  };
  return tool.execute({
    authorize: context.authorize,
    listConnections,
    readConnection: async (id) => {
      const connections = await listConnections();
      if (!connections?.some((connection) => connection.id === id)) return null;
      return (await context.options.connections?.connectionData(id)) ?? null;
    },
    result: context.result,
    failed: context.failed,
  });
}

/** Host-owned authentication and connection access are injected into built-in read-only tools. */
export function registerIntegrationTools(
  server: McpServer,
  context: Pick<McpRuntimeContext, 'options' | 'authorize' | 'result' | 'failed'>,
) {
  for (const tool of integrationTools()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      },
      () => executeIntegrationTool(tool, context),
    );
  }
}
