import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import type { PageFailure, PagesStore } from '../pages.js';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';

type Auth = ReturnType<typeof createAuth>;

const nameSchema = z.object({ name: z.string().max(200) }).strict();
const orderSchema = z.object({ ids: z.array(z.number().int().safe().positive()).max(50) }).strict();
const groupPageSchema = z.object({ pageId: z.number().int().safe().positive() }).strict();

const STATUS: Record<PageFailure, number> = {
  'invalid-page-name': 400,
  'invalid-page-order': 400,
  'page-not-found': 404,
  'page-exists': 409,
  'page-limit': 409,
  'page-last': 409,
  'page-move-required': 409,
};

/** Pages (tabs of the Home): list, add, rename, delete with a move, reorder, and putting a group on one. */
export function registerPageRoutes(
  app: FastifyInstance,
  pages: PagesStore,
  auth: Auth,
  audit: AuditLog,
) {
  const record = async (
    request: { headers: Parameters<Auth['session']>[0]; ip: string },
    detail: string,
  ) => {
    const session = await auth.session(request.headers);
    audit.record({
      actor: session ? `user:${session.userId}` : 'user:unknown',
      action: 'page-update',
      result: 'ok',
      detail,
      ipAddress: request.ip,
    });
  };
  const view = () => {
    const counts = pages.groupCounts();
    return pages.list().map((page) => ({ ...page, groups: counts.get(page.id) ?? 0 }));
  };

  app.get('/api/pages', async () => view());

  app.post('/api/pages', async (request, reply) => {
    const body = nameSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-page-name'));
    const result = pages.create(body.data.name);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    await record(request, `created:${result.value.name}`);
    return reply.code(201).send(view());
  });

  app.put('/api/pages/order', async (request, reply) => {
    const body = orderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-page-order'));
    const result = pages.reorder(body.data.ids);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    await record(request, 'reordered');
    return view();
  });

  app.put<{ Params: { id: string } }>('/api/pages/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('page-not-found'));
    const body = nameSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-page-name'));
    const before = pages.find(id);
    const result = pages.rename(id, body.data.name);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    if (before && before.name !== result.value.name)
      await record(request, `renamed:${before.name}>${result.value.name}`);
    return view();
  });

  app.delete<{ Params: { id: string }; Querystring: { moveTo?: string } }>(
    '/api/pages/:id',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('page-not-found'));
      const moveTo = request.query.moveTo === undefined ? undefined : parseId(request.query.moveTo);
      if (moveTo === null) return reply.code(400).send(errorBody('invalid-data'));
      const result = pages.remove(id, moveTo);
      if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
      await record(
        request,
        `deleted:${result.value.name} (${result.value.movedGroups} groups moved)`,
      );
      return view();
    },
  );

  app.put<{ Params: { id: string } }>('/api/groups/:id/page', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const body = groupPageSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
    const result = pages.setGroupPage(id, body.data.pageId);
    if (!result.ok)
      return reply
        .code(404)
        .send(errorBody(pages.find(body.data.pageId) ? 'group-not-found' : 'page-not-found'));
    await record(request, `group-moved:${result.value.name}>${result.value.page}`);
    return reply.code(204).send();
  });
}
