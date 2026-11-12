import type { FastifyInstance } from 'fastify';
import type { createProposalService } from '../proposals.js';
import { createAgentSchema, opaqueIdSchema, proposalReviewSchema } from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { createServiceMonitor } from '../service-monitor.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

type Proposals = ReturnType<typeof createProposalService>;

export function registerAgentProposalRoutes(
  app: FastifyInstance,
  proposals: Proposals,
  monitor: ReturnType<typeof createServiceMonitor>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  const agentName = (id: string) =>
    (proposals.listAgents() as { id: string; name: string }[]).find((row) => row.id === id)?.name;
  const recordAgentEvent = async (
    request: { headers: Parameters<typeof auth.session>[0]; ip: string },
    action: string,
    name: string | undefined,
  ) => {
    const session = await auth.session(request.headers);
    if (session)
      audit.record({
        actor: `user:${session.userId}`,
        action,
        result: 'ok',
        detail: name,
        ipAddress: request.ip,
      });
  };
  app.get('/api/proposals', async () => proposals.list());
  app.get('/api/proposal-settings', async () => ({ ttlMinutes: proposals.proposalTtlMinutes() }));
  app.put('/api/proposal-settings', async (request, reply) => {
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    const body = request.body as { ttlMinutes?: unknown } | null;
    if (
      !body ||
      Object.keys(body).length !== 1 ||
      typeof body.ttlMinutes !== 'number' ||
      !Number.isInteger(body.ttlMinutes) ||
      body.ttlMinutes < 1 ||
      body.ttlMinutes > 120
    )
      return reply.code(400).send(errorBody('invalid-data'));
    proposals.setProposalTtlMinutes(body.ttlMinutes, `user:${session.userId}`);
    return { ttlMinutes: body.ttlMinutes };
  });
  app.post<{ Params: { id: string } }>('/api/proposals/:id/recreate', async (request, reply) => {
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('proposal-unavailable'));
    try {
      return reply.code(201).send(proposals.recreate(request.params.id, `user:${session.userId}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const codes = {
        'Service not found': 'service-not-found',
        'Group not found': 'group-not-found',
        'Group not empty': 'group-not-empty',
        'Connection not found': 'integration-not-found',
        'Widget not found': 'widget-not-found',
        'Identity unavailable': 'identity-not-found',
        'Proposal diff changed': 'config-changed',
        'Pending proposal limit reached': 'proposal-limit',
        'Invalid order': 'batch-conflict',
        'Invalid move': 'batch-conflict',
      } as const;
      const code = codes[message as keyof typeof codes] ?? 'proposal-unavailable';
      return reply.code(409).send(errorBody(code));
    }
  });
  app.post('/api/agents', async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('identity-invalid'));
    try {
      const issued = proposals.issue(parsed.data.name, parsed.data.scopes);
      await recordAgentEvent(request, 'agent-issue', issued.name);
      return reply.code(201).send(issued);
    } catch {
      return reply.code(400).send(errorBody('identity-invalid'));
    }
  });
  app.get('/api/agents', async () => proposals.listAgents());
  app.post<{ Params: { id: string } }>('/api/agents/:id/revoke', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('identity-not-found'));
    const name = agentName(request.params.id);
    proposals.revoke(request.params.id);
    await recordAgentEvent(request, 'agent-revoke', name);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/agents/:id/rotate', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('identity-not-found'));
    try {
      const token = proposals.rotate(request.params.id);
      await recordAgentEvent(request, 'agent-rotate', agentName(request.params.id));
      reply.header('Cache-Control', 'no-store');
      return { token };
    } catch {
      return reply.code(404).send(errorBody('identity-not-found'));
    }
  });
  app.post<{ Params: { id: string } }>(
    '/api/proposal-batches/:id/review',
    async (request, reply) => {
      if (!opaqueIdSchema.safeParse(request.params.id).success)
        return reply.code(404).send(errorBody('proposal-unavailable'));
      const parsed = proposalReviewSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorBody('invalid-decision'));
      const session = await auth.session(request.headers);
      if (!session) return reply.code(401).send(errorBody('auth-required'));
      try {
        const state = proposals.decideBatch(
          request.params.id,
          parsed.data.approve,
          `user:${session.userId}`,
        );
        if (state === 'approved') void monitor.invalidate();
        reply.header('Cache-Control', 'no-store');
        return { state };
      } catch (error) {
        return reply
          .code(409)
          .send(
            errorBody(
              error instanceof Error && error.message === 'Configuration has changed'
                ? 'config-changed'
                : error instanceof Error && error.message === 'Batch changes conflict'
                  ? 'batch-conflict'
                  : 'proposal-unavailable',
            ),
          );
      }
    },
  );
  app.post<{ Params: { id: string } }>('/api/proposals/:id/review', async (request, reply) => {
    if (!opaqueIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send(errorBody('proposal-unavailable'));
    const parsed = proposalReviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-decision'));
    try {
      // The reviewer is recorded as the signed-in account (the guard guarantees a session).
      const session = await auth.session(request.headers);
      if (!session) return reply.code(401).send(errorBody('auth-required'));
      const state = proposals.decide(
        request.params.id,
        parsed.data.approve,
        `user:${session.userId}`,
      );
      if (state === 'approved') void monitor.invalidate();
      reply.header('Cache-Control', 'no-store');
      return typeof state === 'string' ? { state } : state;
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
