import type { FastifyInstance } from 'fastify';
import type { createProposalService } from '../proposals.js';

type Proposals = ReturnType<typeof createProposalService>;

export function registerAgentProposalRoutes(app: FastifyInstance, proposals: Proposals) {
  app.get('/api/proposals', async () => proposals.list());
  app.post('/api/agents', async (request, reply) => {
    try {
      const input = request.body as { name: string; scopes: string[] };
      return reply.code(201).send(proposals.issue(input.name, input.scopes));
    } catch {
      return reply.code(400).send({ error: 'Identidade ou escopos inválidos.' });
    }
  });
  app.get('/api/agents', async () => proposals.listAgents());
  app.post<{ Params: { id: string } }>('/api/agents/:id/revoke', async (request) => {
    proposals.revoke(request.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/agents/:id/rotate', async (request, reply) => {
    try {
      return { token: proposals.rotate(request.params.id) };
    } catch {
      return reply.code(404).send({ error: 'Identidade não encontrada.' });
    }
  });
  app.post<{ Params: { id: string } }>('/api/proposals/:id/review', async (request, reply) => {
    const accept = (request.body as { approve?: unknown })?.approve;
    if (typeof accept !== 'boolean') return reply.code(400).send({ error: 'Decisão inválida.' });
    try {
      return { state: proposals.decide(request.params.id, accept, 'local-admin') };
    } catch (error) {
      return reply
        .code(409)
        .send({ error: error instanceof Error ? error.message : 'Proposta indisponível.' });
    }
  });
}
