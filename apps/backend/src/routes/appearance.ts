import type { FastifyInstance } from 'fastify';
import {
  IMAGE_MAX_BYTES,
  IMAGE_NAME,
  IMAGE_DIM_MAX,
  IMAGE_DIM_STEP,
  contrastProblems,
  parseAppearance,
  type Appearance,
} from '@homora/shared';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import type { AppearanceStore } from '../appearance.js';
import {
  ImageRejected,
  processBackgroundImage,
  type BackgroundStore,
} from '../background-image.js';
import { ERROR_MESSAGES, errorBody } from '../api-error.js';

type Auth = ReturnType<typeof createAuth>;

const summary = (a: Appearance) =>
  `accent:${a.accent === 'custom' ? a.customAccent : a.accent} background:${a.image ? 'image' : a.background} opacity:${a.cardOpacity} blur:${a.blur ? 'on' : 'off'}`;

const contrastBody = (appearance: Appearance) => ({
  code: 'appearance-contrast' as const,
  error: ERROR_MESSAGES['appearance-contrast'],
  problems: contrastProblems(appearance),
});

/**
 * Authenticated read/write of the instance appearance. There is deliberately no MCP tool and no
 * agent scope for it: agents never change how Homora looks.
 */
export function registerAppearanceRoutes(
  app: FastifyInstance,
  appearance: AppearanceStore,
  auth: Auth,
  audit: AuditLog,
  background?: BackgroundStore,
) {
  const actor = async (headers: Parameters<Auth['session']>[0]) => {
    const session = await auth.session(headers);
    return session ? `user:${session.userId}` : 'user:unknown';
  };

  app.get('/api/appearance', async () => ({ appearance: appearance.get() }));

  app.put('/api/appearance', async (request, reply) => {
    const parsed = parseAppearance(request.body);
    if (!parsed) return reply.code(400).send(errorBody('invalid-data'));
    const stored = appearance.get();
    let next = parsed;
    if (parsed.image) {
      // The file facts are measured by the server; a client may only change how it is shown.
      if (!stored.image) return reply.code(400).send(errorBody('invalid-data'));
      next = {
        ...parsed,
        image: { ...stored.image, dim: parsed.image.dim, position: parsed.image.position },
      };
    } else if (stored.image) {
      // Removing the picture goes through its own endpoint so the file is deleted too.
      return reply.code(400).send(errorBody('invalid-data'));
    }
    if (contrastProblems(next).length > 0) return reply.code(422).send(contrastBody(next));
    appearance.set(next);
    audit.record({
      actor: await actor(request.headers),
      action: 'appearance-update',
      result: 'ok',
      detail: summary(next),
      ipAddress: request.ip,
    });
    return { appearance: appearance.get() };
  });

  app.delete('/api/appearance', async (request) => {
    appearance.reset();
    await background?.remove();
    audit.record({
      actor: await actor(request.headers),
      action: 'appearance-reset',
      result: 'ok',
      ipAddress: request.ip,
    });
    return { appearance: appearance.get() };
  });

  // Encapsulated: the raw-bytes parser and the size limit apply to the picture routes only.
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
      { parseAs: 'buffer', bodyLimit: IMAGE_MAX_BYTES },
      (_request, body, done) => done(null, body),
    );
    scope.setErrorHandler((error, _request, reply) => {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 413) return reply.code(413).send(errorBody('image-too-large'));
      if (status === 415) return reply.code(415).send(errorBody('image-unsupported'));
      return reply.send(error);
    });

    scope.put(
      '/api/appearance/background',
      { bodyLimit: IMAGE_MAX_BYTES },
      async (request, reply) => {
        if (!background) return reply.code(503).send(errorBody('image-storage-unavailable'));
        if (!Buffer.isBuffer(request.body))
          return reply.code(415).send(errorBody('image-unsupported'));
        let processed;
        try {
          processed = await processBackgroundImage(request.body);
        } catch (error) {
          if (error instanceof ImageRejected)
            return reply
              .code(error.code === 'image-too-large' ? 413 : 415)
              .send(errorBody(error.code));
          throw error;
        }
        const current = appearance.get();
        const image = {
          name: processed.name,
          dim: current.image?.dim ?? 40,
          position: current.image?.position ?? ('fill' as const),
          average: processed.average,
          width: processed.width,
          height: processed.height,
          bytes: processed.bytes,
          originalBytes: processed.originalBytes,
        };
        // Start from the user's dimming and fade further until the picture keeps text readable.
        let next: Appearance = { ...current, image };
        while (contrastProblems(next).length > 0 && next.image!.dim < IMAGE_DIM_MAX)
          next = { ...next, image: { ...next.image!, dim: next.image!.dim + IMAGE_DIM_STEP } };
        if (contrastProblems(next).length > 0) return reply.code(422).send(contrastBody(next));
        await background.write(processed.data);
        appearance.set(next);
        audit.record({
          actor: await actor(request.headers),
          action: 'appearance-update',
          result: 'ok',
          detail: `image:set ${Math.round(processed.bytes / 1024)}KB`,
          ipAddress: request.ip,
        });
        return { appearance: appearance.get() };
      },
    );

    scope.delete('/api/appearance/background', async (request) => {
      const current = appearance.get();
      if (current.image) {
        appearance.set({ ...current, image: null });
        audit.record({
          actor: await actor(request.headers),
          action: 'appearance-update',
          result: 'ok',
          detail: 'image:removed',
          ipAddress: request.ip,
        });
      }
      await background?.remove();
      return { appearance: appearance.get() };
    });

    scope.get<{ Params: { name: string } }>(
      '/api/appearance/background/:name',
      async (request, reply) => {
        const { name } = request.params;
        const current = appearance.get();
        if (!IMAGE_NAME.test(name) || current.image?.name !== name || !background)
          return reply.code(404).send(errorBody('not-found'));
        const data = await background.read();
        if (!data) return reply.code(404).send(errorBody('not-found'));
        // The name changes with every upload, so the browser may keep this one for good.
        return reply
          .header('Content-Type', 'image/webp')
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .header('X-Content-Type-Options', 'nosniff')
          .header('Content-Security-Policy', "default-src 'none'")
          .send(data);
      },
    );
  });
}
