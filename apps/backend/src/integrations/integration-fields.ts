import { z } from 'zod';
import { integrationDefinitions, type IntegrationDefinition } from '@homora/integrations';

/** Types and stored fields come from the definitions, so no schema lists them by hand. */
export const integrationTypes = integrationDefinitions.map(({ type }) => type) as [
  string,
  ...string[],
];
export const integrationTypeSchema = z.enum(integrationTypes);

/** Public (non-secret) keys across all integrations, stored in `public_config`. */
export const publicFieldKeys = [
  ...new Set(
    integrationDefinitions.flatMap(({ fields }) =>
      fields.filter(({ kind }) => kind === 'text').map(({ key }) => key),
    ),
  ),
];
export const publicFieldShape = (max: number, trim = false) =>
  Object.fromEntries(
    publicFieldKeys.map((key) => [
      key,
      (trim ? z.string().trim() : z.string()).max(max).optional(),
    ]),
  ) as Record<string, z.ZodOptional<z.ZodString>>;

export const definitionOf = (type: string): IntegrationDefinition | undefined =>
  integrationDefinitions.find((definition) => definition.type === type);
export const publicFieldsOf = (type: string) =>
  definitionOf(type)?.fields.filter(({ kind }) => kind === 'text') ?? [];
export const hasField = (type: string, kind: string) =>
  !!definitionOf(type)?.fields.some((field) => field.kind === kind);
