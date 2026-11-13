import type { DatabaseSync } from 'node:sqlite';
import type { createProposalService } from './proposals.js';
import type { createIntegrationConnections } from './integration-connections.js';
import type { createDockerPush } from './docker-push.js';
import type { DockerSource } from './docker-discovery.js';
import type { createServiceConfiguration } from './service-configuration.js';

export type McpToolContext = {
  database: DatabaseSync;
  configuration: ReturnType<typeof createServiceConfiguration>;
  proposalService: ReturnType<typeof createProposalService>;
  token: () => string | undefined;
  authorize: (scope: string) => string | null;
  unauthorized: () => {
    content: { type: 'text'; text: string }[];
    isError: true;
  };
  failed: (error?: unknown) => {
    content: { type: 'text'; text: string }[];
    isError: true;
  };
  result: (value: unknown) => { content: { type: 'text'; text: string }[] };
  publicUrl: (value: string) => string;
  groupsWithPage: () => { id: number; name: string; page: string | null }[];
  proposalAuthor: () => string | null;
};

export type McpOptions = {
  connections?: ReturnType<typeof createIntegrationConnections>;
  docker?: DockerSource;
  token?: string;
};

export type McpRuntimeContext = McpToolContext & {
  options: McpOptions;
  dockerPush: ReturnType<typeof createDockerPush>;
  publicStatusEnabled: () => boolean;
};
