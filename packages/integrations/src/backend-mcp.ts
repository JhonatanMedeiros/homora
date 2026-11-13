/** Only read-only integration queries are exposed; the host owns authentication and transport. */
import { mcpFactories } from './generated/mcp.js';
import { integrationAgentScopeIds } from './generated/definitions.js';

export type IntegrationToolResponse = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};
export type IntegrationToolContext = {
  authorize(scope: string): string | null;
  listConnections(): Promise<{ id: number; type: string }[] | null>;
  readConnection(id: number): Promise<unknown | null>;
  result(value: unknown): IntegrationToolResponse;
  failed(): IntegrationToolResponse;
};
export type IntegrationTool = {
  name: string;
  title: string;
  description: string;
  scopes: readonly string[];
  unauthorizedMessage?: string;
  execute(context: IntegrationToolContext): Promise<IntegrationToolResponse>;
};

export type RegisteredIntegrationTool = IntegrationTool & { integrationType: string };

export function integrationTools(): readonly RegisteredIntegrationTool[] {
  const names = new Set<string>();
  return mcpFactories.flatMap(({ type, definition, create }) => {
    if (definition.type !== type) throw new Error(`Invalid tool registration: ${type}`);
    const tools = create();
    for (const tool of tools) {
      if (names.has(tool.name)) throw new Error(`Duplicate integration tool: ${tool.name}`);
      if (
        tool.scopes.length === 0 ||
        tool.scopes.some(
          (scope) =>
            !scope.startsWith(`${type}:`) ||
            !(integrationAgentScopeIds as readonly string[]).includes(scope),
        )
      )
        throw new Error(`Invalid integration tool scopes: ${tool.name}`);
      names.add(tool.name);
    }
    return tools.map((tool) => ({ ...tool, integrationType: type }));
  });
}
