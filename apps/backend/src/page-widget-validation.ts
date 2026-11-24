import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { integrationWidgetDefinition, resolveWidget } from '@homora/integrations';
import {
  isInternalSource,
  isWeatherSource,
  supportsSource,
  type WidgetDefinition,
} from '@homora/widgets';

const id = z.number().int().safe().positive();
export const pageWidgetBodySchema = z
  .object({
    pageId: id,
    type: z.string().min(1).max(80),
    name: z.string().trim().max(80),
    config: z.unknown(),
    connectionId: id.nullable(),
    size: z.enum(['normal', 'wide']).default('normal'),
  })
  .strict();
export type PageWidgetValue = z.infer<typeof pageWidgetBodySchema>;

/** Stable reasons for rejecting a page widget; the UI collapses them, reviewed proposals expose them. */
export type PageWidgetRejection =
  | 'invalid-widget'
  | 'unknown-page'
  | 'unknown-connection'
  | 'unsupported-type';

/**
 * The single rule set for placing a widget on a page, shared by the gallery route and the reviewed
 * proposal so an agent can never create a tile the UI would refuse.
 */
export function checkPageWidget(
  sqlite: DatabaseSync,
  raw: unknown,
  resolve: (type: string) => WidgetDefinition<unknown> | undefined = resolveWidget,
): { ok: true; value: PageWidgetValue } | { ok: false; code: PageWidgetRejection } {
  const parsed = pageWidgetBodySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid-widget' };
  const value = parsed.data;
  if (!sqlite.prepare('SELECT id FROM pages WHERE id=?').get(value.pageId))
    return { ok: false, code: 'unknown-page' };
  const definition = resolve(value.type);
  if (!definition || !(definition.sizes ?? ['normal']).includes(value.size))
    return { ok: false, code: 'unsupported-type' };
  const config = definition.parseConfig(value.config);
  if (config === null) return { ok: false, code: 'invalid-widget' };
  if (
    definition.source === null ||
    isInternalSource(definition.source) ||
    isWeatherSource(definition.source)
  )
    return value.connectionId === null
      ? { ok: true, value: { ...value, config } }
      : { ok: false, code: 'unsupported-type' };
  if (value.connectionId === null) return { ok: false, code: 'unknown-connection' };
  const connection = sqlite
    .prepare('SELECT type FROM integration_instances WHERE id=?')
    .get(value.connectionId) as { type: string } | undefined;
  if (!connection) return { ok: false, code: 'unknown-connection' };
  const offered = integrationWidgetDefinition(connection.type)?.source;
  if (!offered || !supportsSource(definition.source, offered))
    return { ok: false, code: 'unsupported-type' };
  return { ok: true, value };
}
