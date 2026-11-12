import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { customCssProblem } from '@homora/shared';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import type { CustomCssStore } from '../custom-css.js';
import { ERROR_MESSAGES, errorBody } from '../api-error.js';

type Auth = ReturnType<typeof createAuth>;

const bodySchema = z
  .object({ css: z.string().max(200_000).optional(), enabled: z.boolean().optional() })
  .strict()
  .refine((value) => value.css !== undefined || value.enabled !== undefined);

/** Custom CSS administration and the stylesheet itself (same origin, behind the session). */
export function registerCustomCssRoutes(
  app: FastifyInstance,
  customCss: CustomCssStore,
  auth: Auth,
  audit: AuditLog,
) {
  const actor = async (headers: Parameters<Auth['session']>[0]) => {
    const session = await auth.session(headers);
    return session ? `user:${session.userId}` : 'user:unknown';
  };

  app.get('/api/appearance/custom-css', async () => customCss.get());

  app.put('/api/appearance/custom-css', async (request, reply) => {
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
    if (body.data.css !== undefined) {
      const problem = customCssProblem(body.data.css);
      if (problem)
        return reply.code(422).send({
          code: 'custom-css-invalid',
          error: ERROR_MESSAGES['custom-css-invalid'],
          problem,
        });
    }
    const before = customCss.get();
    if (body.data.css !== undefined) customCss.setCss(body.data.css);
    if (body.data.enabled !== undefined) customCss.setEnabled(body.data.enabled);
    const after = customCss.get();
    const who = await actor(request.headers);
    // Events carry sizes and states, never the stylesheet itself.
    if (body.data.css !== undefined && before.version !== after.version)
      audit.record({
        actor: who,
        action: 'custom-css-update',
        result: 'ok',
        detail: `saved ${after.bytes} bytes`,
        ipAddress: request.ip,
      });
    if (body.data.enabled !== undefined && before.enabled !== after.enabled)
      audit.record({
        actor: who,
        action: 'custom-css-update',
        result: 'ok',
        detail: after.enabled ? 'enabled' : 'disabled',
        ipAddress: request.ip,
      });
    return after;
  });

  app.get('/api/appearance/custom.css', async (_request, reply) => {
    const { css, enabled } = customCss.get();
    return reply
      .header('Content-Type', 'text/css; charset=utf-8')
      .header('X-Content-Type-Options', 'nosniff')
      .send(enabled ? css : '');
  });
}
