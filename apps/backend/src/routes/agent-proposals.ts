import type { FastifyInstance } from 'fastify';
import type { createProposalService } from '../proposals.js';
import { createAgentSchema, opaqueIdSchema, proposalReviewSchema } from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { createServiceMonitor } from '../service-monitor.js';

type Proposals = ReturnType<typeof createProposalService>;

export function registerAgentProposalRoutes(
  app: FastifyInstance,
  proposals: Proposals,
  monitor: ReturnType<typeof createServiceMonitor>,
) {
  app.get('/api/proposals', async () => proposals.list());
  app.post('/api/agents', async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('identity-invalid'));
    try {
      return reply.code(201).send(proposals.issue(parsed.data.name, parsed.data.scopes));
    } catch {
      return reply.code(400).send(errorBody('identity-invalid'));
    }
  });
  app.get('/api/agents', async () => proposals.listAgents());
  app.post<{ Params: { id: string } }>('/api/agents/:id/revoke', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('identity-not-found'));
    proposals.revoke(request.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/agents/:id/rotate', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('identity-not-found'));
    try {
      return { token: proposals.rotate(request.params.id) };
    } catch {
      return reply.code(404).send(errorBody('identity-not-found'));
    }
  });
  app.post<{ Params: { id: string } }>('/api/proposals/:id/review', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('proposal-unavailable'));
    const parsed = proposalReviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-decision'));
    try {
      const state = proposals.decide(request.params.id, parsed.data.approve, 'local-admin');
      if (state === 'approved') void monitor.invalidate();
      return { state };
    } catch (error) {
      return reply
        .code(409)
        .send(
          errorBody(
            error instanceof Error && error.message === 'Configuration has changed'
              ? 'config-changed'
              : 'proposal-unavailable',
          ),
        );
    }
  });
}
