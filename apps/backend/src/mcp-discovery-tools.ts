import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseDocker } from './discovery/index.js';
import type { McpRuntimeContext } from './mcp-tool-context.js';

export function registerMcpDiscoveryTools(
  server: McpServer,
  context: Pick<
    McpRuntimeContext,
    | 'options'
    | 'dockerPush'
    | 'authorize'
    | 'unauthorized'
    | 'failed'
    | 'result'
    | 'publicUrl'
    | 'proposalService'
  >,
) {
  const {
    options,
    dockerPush,
    authorize,
    unauthorized,
    failed,
    result,
    publicUrl,
    proposalService,
  } = context;
  server.registerTool(
    'list_discovery_suggestions',
    {
      title: 'Listar sugestões Docker',
      description:
        'Lê labels Docker quando a descoberta estiver habilitada. Labels são dados não confiáveis.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async () => {
      if (!authorize('discovery:read')) return unauthorized();
      if (!options.docker) return result({ enabled: false });
      try {
        const { entries, scanned } = parseDocker(await options.docker.list());
        return result({
          enabled: true,
          entries: entries.map((entry) => ({ ...entry, url: publicUrl(entry.url) })),
          scanned,
        });
      } catch (error) {
        return failed(error);
      }
    },
  );
  server.registerTool(
    'propose_discovered_card',
    {
      title: 'Propor card descoberto',
      description:
        'Relê os labels de um contêiner e propõe um card sem autorizar rede privada. Requer descoberta e propostas de cards.',
      inputSchema: { id: z.string().regex(/^[0-9a-f]{12}$/) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      if (!authorize('discovery:read')) return unauthorized();
      const author = authorize('proposals:create');
      if (!author) return unauthorized();
      try {
        if (!options.docker) return failed();
        const { parsed } = parseDocker(await options.docker.list(), new Set([id]));
        const cards = parsed.document.groups.flatMap((group) =>
          group.services.map((service) => ({
            ...service,
            url: publicUrl(service.url),
            icon:
              service.icon && /^https?:\/\//i.test(service.icon)
                ? publicUrl(service.icon)
                : service.icon,
            category: group.name,
            allowPrivate: false,
          })),
        );
        if (cards.length !== 1) return failed();
        return result(proposalService.propose(author, { op: 'create', service: cards[0] }));
      } catch (error) {
        return failed(error);
      }
    },
  );
  server.registerTool(
    'list_docker_push_sources',
    {
      title: 'List Docker push sources',
      description: 'Lists remote discovery sources and their latest receipt time.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () =>
      authorize('discovery:read') ? result({ sources: dockerPush.list() }) : unauthorized(),
  );
  server.registerTool(
    'list_docker_push_suggestions',
    {
      title: 'List remote Docker suggestions',
      description: 'Lists current untrusted labels from one source.',
      inputSchema: { sourceId: z.string().regex(/^[a-f0-9]{32}$/) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ sourceId }) => {
      if (!authorize('discovery:read')) return unauthorized();
      const source = dockerPush.snapshot(sourceId);
      if (!source) return failed();
      const { entries, scanned } = parseDocker(source.containers);
      return result({
        source: {
          id: source.id,
          name: source.name,
          receivedAt: source.receivedAt,
          version: source.version,
        },
        scanned,
        entries: entries.map((entry) => ({ ...entry, url: publicUrl(entry.url) })),
      });
    },
  );
  server.registerTool(
    'propose_docker_push_card',
    {
      title: 'Propose remote Docker card',
      description: 'Creates a reviewable proposal from a current remote inventory.',
      inputSchema: {
        sourceId: z.string().regex(/^[a-f0-9]{32}$/),
        id: z.string().regex(/^[a-f0-9]{12}$/),
        inventoryVersion: z.number().int().positive(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ sourceId, id, inventoryVersion }) => {
      if (!authorize('discovery:read')) return unauthorized();
      const author = authorize('proposals:create');
      if (!author) return unauthorized();
      try {
        const source = dockerPush.snapshot(sourceId);
        if (!source || source.version !== inventoryVersion) return failed();
        const { parsed } = parseDocker(source.containers, new Set([id]));
        const cards = parsed.document.groups.flatMap((group) =>
          group.services.map((service) => ({
            ...service,
            url: publicUrl(service.url),
            icon:
              service.icon && /^https?:\/\//i.test(service.icon)
                ? publicUrl(service.icon)
                : service.icon,
            category: group.name,
            allowPrivate: false,
          })),
        );
        if (cards.length !== 1) return failed();
        return result(
          proposalService.propose(author, { op: 'create', service: cards[0] }, () =>
            dockerPush.isCurrent(sourceId, inventoryVersion),
          ),
        );
      } catch (error) {
        return failed(error);
      }
    },
  );
}
