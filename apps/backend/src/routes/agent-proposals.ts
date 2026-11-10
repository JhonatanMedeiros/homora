import type { FastifyInstance } from 'fastify';
import type { createProposalService } from '../proposals.js';
import { createAgentSchema, opaqueIdSchema, proposalReviewSchema } from '../input-schemas.js';

type Proposals = ReturnType<typeof createProposalService>;

export function registerAgentProposalRoutes(app: FastifyInstance, proposals: Proposals) {
  app.get('/api/proposals', async () => proposals.list());
  app.post('/api/agents', async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Identidade ou escopos inválidos.' });
    try {
      return reply.code(201).send(proposals.issue(parsed.data.name, parsed.data.scopes));
    } catch {
      return reply.code(400).send({ error: 'Identidade ou escopos inválidos.' });
    }
  });
  app.get('/api/agents', async () => proposals.listAgents());
  app.post<{ Params: { id: string } }>('/api/agents/:id/revoke', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send({ error: 'Identidade não encontrada.' });
    proposals.revoke(request.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/agents/:id/rotate', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send({ error: 'Identidade não encontrada.' });
    try {
      return { token: proposals.rotate(request.params.id) };
    } catch {
      return reply.code(404).send({ error: 'Identidade não encontrada.' });
    }
  });
  app.post<{ Params: { id: string } }>('/api/proposals/:id/review', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send({ error: 'Proposta indisponível.' });
    const parsed = proposalReviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Decisão inválida.' });
    try {
      return { state: proposals.decide(request.params.id, parsed.data.approve, 'local-admin') };
    } catch (error) {
      return reply
        .code(409)
        .send({ error: error instanceof Error ? error.message : 'Proposta indisponível.' });
    }
  });
}
