import { expect, it, vi } from 'vitest';
import type { RegisteredIntegrationTool } from '@homora/integrations/backend/mcp';
import type { McpRuntimeContext } from './tool-context.js';
import { executeIntegrationTool } from './integration-extensions.js';

it('checks scope before executing and confines tools to their own integration connections', async () => {
  const listConnections = vi.fn().mockResolvedValue([
    { id: 1, type: 'alpha' },
    { id: 2, type: 'beta' },
  ]);
  const connectionData = vi.fn().mockResolvedValue({ data: 'private' });
  const execute = vi.fn(async (context) => {
    expect(await context.listConnections()).toEqual([{ id: 1, type: 'alpha' }]);
    expect(await context.readConnection(2)).toBeNull();
    expect(await context.readConnection(1)).toEqual({ data: 'private' });
    return context.result('ok');
  });
  const tool: RegisteredIntegrationTool = {
    integrationType: 'alpha',
    name: 'alpha_tool',
    title: 'Alpha',
    description: 'Read',
    scopes: ['alpha:read'],
    execute,
  };
  const context = {
    options: { connections: { listConnections, connectionData } },
    authorize: vi.fn(() => null),
    result: (value: unknown) => ({ content: [{ type: 'text' as const, text: String(value) }] }),
    failed: () => ({
      content: [{ type: 'text' as const, text: 'failed' }],
      isError: true as const,
    }),
  } as unknown as Pick<McpRuntimeContext, 'options' | 'authorize' | 'result' | 'failed'>;
  expect((await executeIntegrationTool(tool, context)).isError).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  expect(listConnections).not.toHaveBeenCalled();
  vi.mocked(context.authorize).mockReturnValue('agent');
  await executeIntegrationTool(tool, context);
  expect(connectionData).toHaveBeenCalledOnce();
  expect(connectionData).toHaveBeenCalledWith(1);
});
