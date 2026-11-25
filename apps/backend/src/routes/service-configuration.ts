import type { FastifyInstance } from 'fastify';
import { HostLinkError, ServiceLinkError } from '../service-configuration.js';
import {
  ServiceValidationError,
  isServiceAlias,
  UPTIME_RANGES,
  type UptimeRange,
} from '@homora/shared';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createObservationStore, createServiceMonitor } from '../monitoring/index.js';
import {
  groupColumnsSchema,
  groupCreateSchema,
  groupNameSchema,
  groupOrderSchema,
  parseId,
  hostBodySchema,
  pinBodySchema,
  acknowledgeBodySchema,
  serviceFormSchema,
  serviceDefaultsSchema,
  serviceOrderSchema,
} from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { createPublicStatus } from '../public-status.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import type { createServiceAttention } from '../service-attention.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;
type Observations = ReturnType<typeof createObservationStore>;
const publicService = <
  T extends { allowPrivate: number | boolean; checkInsecure: number | boolean },
>(
  row: T,
) => ({
  ...row,
  allowPrivate: Boolean(row.allowPrivate),
  checkInsecure: Boolean(row.checkInsecure),
});

export function registerServiceConfigurationRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
  observations: Observations,
  publicStatus: ReturnType<typeof createPublicStatus>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
  attention: ReturnType<typeof createServiceAttention>,
) {
  app.get<{ Params: { alias: string } }>('/api/go/:alias', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const row = isServiceAlias(request.params.alias)
      ? configuration.findAlias(request.params.alias)
      : undefined;
    if (!row) return reply.code(404).send(errorBody('not-found'));
    try {
      const url = new URL(row.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
      return { url: url.href };
    } catch {
      return reply.code(404).send(errorBody('not-found'));
    }
  });
  app.get('/api/services', async () => {
    const shared = publicStatus.publicIds();
    const pinned = attention.pinnedIds();
    const pinOrder = new Map(attention.pinnedOrder().map((id, index) => [id, index]));
    return configuration.listServices().map((row) => ({
      ...row,
      isPublic: shared.has(row.id),
      pinned: pinned.has(row.id),
      pinnedPosition: pinOrder.get(row.id) ?? null,
    }));
  });
  app.get('/api/acknowledgements', async () => attention.list());
  const record = async (
    request: { headers: Parameters<typeof auth.session>[0]; ip: string },
    action: 'service-pin' | 'service-unpin' | 'service-acknowledge' | 'service-acknowledge-clear',
    id: number,
    detail = '',
  ) => {
    const session = await auth.session(request.headers);
    audit.record({
      actor: session ? `user:${session.userId}` : 'user:unknown',
      action,
      result: 'ok',
      detail: `service:${id}${detail}`,
      ipAddress: request.ip,
    });
  };
  app.put<{ Params: { id: string } }>('/api/services/:id/pin', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = pinBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    if (!attention.setPinned(id, parsed.data.pinned))
      return reply.code(404).send(errorBody('service-not-found'));
    await record(request, parsed.data.pinned ? 'service-pin' : 'service-unpin', id);
    return { pinned: parsed.data.pinned };
  });
  app.put<{ Params: { id: string } }>(
    '/api/services/:id/acknowledgement',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('service-not-found'));
      const parsed = acknowledgeBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
      const state = attention.acknowledge(
        id,
        parsed.data.incidentId ?? null,
        parsed.data.muteMinutes,
      );
      if (!state) return reply.code(404).send(errorBody('service-not-found'));
      await record(
        request,
        'service-acknowledge',
        id,
        parsed.data.muteMinutes ? ` mute:${parsed.data.muteMinutes}m` : '',
      );
      return state;
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/api/services/:id/acknowledgement',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('service-not-found'));
      if (!attention.clear(id)) return reply.code(404).send(errorBody('service-not-found'));
      await record(request, 'service-acknowledge-clear', id);
      return reply.code(204).send();
    },
  );
  app.get('/api/service-defaults', async () => ({
    allowPrivate: configuration.newServicesAllowPrivate(),
  }));
  app.put('/api/service-defaults', async (request, reply) => {
    const parsed = serviceDefaultsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const before = configuration.newServicesAllowPrivate();
    configuration.setNewServicesAllowPrivate(parsed.data.allowPrivate);
    if (before !== parsed.data.allowPrivate) {
      const session = await auth.session(request.headers);
      audit.record({
        actor: session ? `user:${session.userId}` : 'user:unknown',
        action: 'service-defaults-update',
        result: 'ok',
        detail: parsed.data.allowPrivate ? 'allow-private:on' : 'allow-private:off',
        ipAddress: request.ip,
      });
    }
    return { allowPrivate: parsed.data.allowPrivate };
  });
  app.get('/api/service-status', async () => monitor.snapshot());
  app.get<{ Params: { id: string } }>('/api/services/:id/status-detail', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    try {
      return observations.detail(id);
    } catch {
      return reply.code(404).send(errorBody('service-not-found'));
    }
  });
  const rangeOf = (value: unknown): UptimeRange | null =>
    value === undefined ? '24h' : (UPTIME_RANGES.find((range) => range === value) ?? null);
  app.get<{ Querystring: { range?: string } }>('/api/services/uptime', async (request, reply) => {
    const range = rangeOf(request.query.range);
    if (!range) return reply.code(400).send(errorBody('invalid-query'));
    // Pre-serialized and shared: a large inventory would otherwise be copied once per request.
    return reply.type('application/json; charset=utf-8').send(await observations.uptimeBody(range));
  });
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    '/api/services/:id/uptime',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const range = rangeOf(request.query.range);
      if (!range) return reply.code(400).send(errorBody('invalid-query'));
      const summary = id === null ? undefined : observations.uptime(range, Date.now(), id)[id];
      return summary ?? reply.code(404).send(errorBody('service-not-found'));
    },
  );
  app.get('/api/groups', async () => configuration.listGroups());

  app.post('/api/groups', async (request, reply) => {
    const parsed = groupCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-group-name'));
    if (parsed.data.pageId !== undefined && !configuration.pageExists(parsed.data.pageId))
      return reply.code(404).send(errorBody('page-not-found'));
    try {
      return reply.code(201).send(configuration.createGroup(parsed.data.name, parsed.data.pageId));
    } catch {
      return reply.code(409).send(errorBody('group-exists'));
    }
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const parsed = groupNameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-group-name'));
    try {
      const updated = configuration.renameGroup(id, parsed.data.name);
      return updated ?? reply.code(404).send(errorBody('group-not-found'));
    } catch {
      return reply.code(409).send(errorBody('group-exists'));
    }
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id/columns', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const parsed = groupColumnsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-columns'));
    return (
      configuration.setGroupColumns(id, parsed.data.columns) ??
      reply.code(404).send(errorBody('group-not-found'))
    );
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const result = configuration.deleteGroup(id);
    if (result === 'missing') return reply.code(404).send(errorBody('group-not-found'));
    if (result === 'not-empty') return reply.code(409).send(errorBody('group-not-empty'));
    return { deleted: true };
  });

  app.put('/api/groups/order', async (request, reply) => {
    const parsed = groupOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-group-order'));
    return configuration.reorderGroups(parsed.data.names)
      ? { ok: true }
      : reply.code(400).send(errorBody('invalid-group-order'));
  });

  app.put('/api/services/order', async (request, reply) => {
    const parsed = serviceOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-card-order'));
    return configuration.reorderServices(parsed.data.category, parsed.data.ids)
      ? { ok: true }
      : reply.code(400).send(errorBody('invalid-card-order'));
  });

  app.post('/api/services', async (request, reply) => {
    const parsed = serviceFormSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const { host, links, ...input } = parsed.data;
    try {
      // Only the UI create path applies the instance default, and only when the form sent no value.
      const created = configuration.createService(
        { ...input, allowPrivate: input.allowPrivate ?? configuration.newServicesAllowPrivate() },
        host ?? null,
        links,
      );
      if (created.checkInsecure) {
        const session = await auth.session(request.headers);
        audit.record({
          actor: session ? `user:${session.userId}` : 'user:unknown',
          action: 'monitoring-tls-insecure',
          result: 'ok',
          detail: `service:${created.id}:on`,
          ipAddress: request.ip,
        });
      }
      void monitor.invalidate();
      return reply.code(201).send(publicService(created));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: services.alias')
      )
        return reply.code(409).send(errorBody('alias-exists'));
      return reply
        .code(400)
        .send(
          errorBody(
            error instanceof ServiceValidationError ||
              error instanceof HostLinkError ||
              error instanceof ServiceLinkError
              ? error.code
              : 'invalid-data',
          ),
        );
    }
  });

  app.put<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = serviceFormSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const { host, links, ...input } = parsed.data;
    try {
      const before = configuration.findService(id);
      const updated = configuration.updateService(id, input, host, links);
      if (!updated) return reply.code(404).send(errorBody('service-not-found'));
      if (Boolean(before?.checkInsecure) !== Boolean(updated.checkInsecure)) {
        const session = await auth.session(request.headers);
        audit.record({
          actor: session ? `user:${session.userId}` : 'user:unknown',
          action: 'monitoring-tls-insecure',
          result: 'ok',
          detail: `service:${id}:${updated.checkInsecure ? 'on' : 'off'}`,
          ipAddress: request.ip,
        });
      }
      void monitor.invalidate();
      return publicService(updated);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: services.alias')
      )
        return reply.code(409).send(errorBody('alias-exists'));
      return reply
        .code(400)
        .send(
          errorBody(
            error instanceof ServiceValidationError ||
              error instanceof HostLinkError ||
              error instanceof ServiceLinkError
              ? error.code
              : 'invalid-data',
          ),
        );
    }
  });

  app.put<{ Params: { id: string } }>('/api/services/:id/host', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = hostBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      if (!configuration.setServiceHost(id, parsed.data.host, parsed.data.external))
        return reply.code(404).send(errorBody('service-not-found'));
    } catch (error) {
      if (error instanceof HostLinkError) return reply.code(400).send(errorBody(error.code));
      throw error;
    }
    const session = await auth.session(request.headers);
    audit.record({
      actor: session ? `user:${session.userId}` : 'user:unknown',
      action: parsed.data.host
        ? 'service-host-link'
        : parsed.data.external
          ? 'service-host-external'
          : 'service-host-unlink',
      result: 'ok',
      detail: `service:${id}`,
      ipAddress: request.ip,
    });
    return { host: parsed.data.host, hostExternal: Boolean(parsed.data.external) };
  });

  app.delete<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ deleted: false });
    const deleted = configuration.deleteService(id);
    if (deleted) void monitor.invalidate();
    return reply.code(deleted ? 200 : 404).send({ deleted });
  });
}
