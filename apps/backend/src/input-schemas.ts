import {
  CHECK_INTERVAL_MAX,
  CHECK_TYPES,
  CHECK_INTERVAL_MIN,
  DEGRADED_LATENCY_MAX,
  DEGRADED_LATENCY_MIN,
  ICON_MAX_LENGTH,
  isCheckMatch,
  isCheckPath,
  isExpectedStatus,
  MAINTENANCE_NOTE_MAX,
  isNodeName,
  isVmid,
  THRESHOLD_MAX,
} from '@homora/shared';
import { z } from 'zod';
import { LEGACY_WIDGET_SOURCES } from '@homora/integrations';
import { AGENT_SCOPES } from './agent-scopes.js';
import {
  integrationTypeSchema as integrationType,
  publicFieldShape,
} from './integration-fields.js';

const boundedText = (max: number) => z.string().max(max);

export const serviceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: z.string().trim().min(1).max(2048),
    category: z.string().trim().min(1).max(40),
    description: z.string().trim().max(140).optional(),
    icon: z.string().trim().max(ICON_MAX_LENGTH).optional(),
    position: z.number().int().safe().min(0).optional(),
    allowPrivate: z.boolean().optional(),
    checkType: z.enum(CHECK_TYPES).optional(),
    expectedStatus: z
      .union([z.string().refine(isExpectedStatus), z.number().int().min(100).max(599)])
      .nullable()
      .optional(),
    checkPath: z.string().refine(isCheckPath).nullable().optional(),
    checkMatch: z.string().refine(isCheckMatch).nullable().optional(),
    checkInterval: z
      .number()
      .int()
      .min(CHECK_INTERVAL_MIN)
      .max(CHECK_INTERVAL_MAX)
      .nullable()
      .optional(),
  })
  .strict();

export const hostLinkSchema = z
  .object({
    connectionId: z.number().int().safe().positive(),
    node: z.string().refine(isNodeName),
    vmid: z.number().int().safe().refine(isVmid),
    type: z.enum(['qemu', 'lxc']),
  })
  .strict();
/** Web UI only: agent proposals keep using `serviceInputSchema`, which rejects `host`. */
export const serviceFormSchema = serviceInputSchema.extend({
  host: hostLinkSchema.nullable().optional(),
});
export const dismissalBodySchema = z
  .object({ host: hostLinkSchema, dismissed: z.boolean() })
  .strict();
export const hostBodySchema = z.object({ host: hostLinkSchema.nullable() }).strict();

const serviceIdSchema = z.number().int().safe().positive();
export const serviceProposalSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('create'),
      service: serviceInputSchema,
      // Only used when the card's group does not exist yet; the first page when omitted.
      page: z.string().trim().min(1).max(40).optional(),
    })
    .strict(),
  z.object({ op: z.literal('update'), id: serviceIdSchema, service: serviceInputSchema }).strict(),
  z.object({ op: z.literal('delete'), id: serviceIdSchema }).strict(),
]);

export const groupNameSchema = z.object({ name: z.string().trim().min(1).max(40) }).strict();

export const groupCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    pageId: z.number().int().safe().positive().optional(),
  })
  .strict();

export const groupColumnsSchema = z
  .object({ columns: z.number().int().min(1).max(6).nullable() })
  .strict();

export const groupOrderSchema = z.object({ names: z.array(z.string()) }).strict();

export const serviceOrderSchema = z
  .object({
    category: z.string().min(1).max(40),
    ids: z.array(z.number().int().safe().positive()),
  })
  .strict();

const passwordValueSchema = z
  .string()
  .max(1024)
  .refine((password) => Buffer.byteLength(password) <= 1024);

export const setupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.email().max(254),
    password: passwordValueSchema.min(8),
  })
  .strict();

export const profileSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: passwordValueSchema.min(1),
    newPassword: passwordValueSchema.min(8),
    revokeOthers: z.boolean().default(true),
  })
  .strict();

export const auditQuerySchema = z
  .object({
    kind: z.enum(['access', 'account', 'proposal', 'agent']).optional(),
    outcome: z.enum(['success', 'failure', 'refused']).optional(),
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const createAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(AGENT_SCOPES)).min(1).max(AGENT_SCOPES.length),
  })
  .strict();

export const serviceDefaultsSchema = z.object({ allowPrivate: z.boolean() }).strict();
export const proposalReviewSchema = z.object({ approve: z.boolean() }).strict();
export const opaqueIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

const connectionFields = z
  .object({
    type: integrationType.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    url: z.string().trim().min(1).max(2048).optional(),
    allowPrivate: z.boolean().optional(),
    ...publicFieldShape(255),
    tokenId: boundedText(255).optional(),
    secret: boundedText(65536).optional(),
    ca: boundedText(65536).optional(),
    removeCa: z.boolean().optional(),
  })
  .strict();

export const createConnectionSchema = connectionFields.extend({
  type: integrationType,
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(2048),
});

export const updateConnectionSchema = connectionFields;

export const createWidgetSchema = z
  .object({
    integrationId: z.number().int().safe().positive().optional(),
    source: z.enum(LEGACY_WIDGET_SOURCES).optional(),
    name: z.string().trim().min(1).max(80),
    serviceId: z.number().int().safe().positive().nullable().optional(),
  })
  .strict()
  .refine((value) => (value.integrationId === undefined) !== (value.source === undefined));

export const updateWidgetSchema = z
  .object({
    serviceId: z.number().int().safe().positive().nullable().optional(),
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine((value) => value.serviceId !== undefined || value.name !== undefined);

export const refreshQuerySchema = z
  .object({ refresh: z.enum(['true', 'false']).optional() })
  .strict();

const numericIdSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().safe().positive());

export function parseId(value: string): number | null {
  const parsed = numericIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const publicStatusSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    title: z.string().trim().max(60).optional(),
    description: z.string().trim().max(160).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.enabled !== undefined || value.title !== undefined || value.description !== undefined,
  );
export const servicePublicSchema = z.object({ isPublic: z.boolean() }).strict();

/** Alert thresholds and the "degraded" latency of one service; every field is required. */
export const monitorSettingsSchema = z
  .object({
    failureThreshold: z.number().int().min(1).max(THRESHOLD_MAX),
    recoveryThreshold: z.number().int().min(1).max(THRESHOLD_MAX),
    degradedLatencyMs: z
      .number()
      .int()
      .min(DEGRADED_LATENCY_MIN)
      .max(DEGRADED_LATENCY_MAX)
      .nullable(),
  })
  .strict();
export const latencyQuerySchema = z
  .object({ range: z.enum(['24h', '7d', '30d']).optional() })
  .strict();
export const maintenanceSchema = z
  .object({
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    note: z.string().trim().max(MAINTENANCE_NOTE_MAX).default(''),
  })
  .strict();
export const incidentQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    before: z.coerce.number().int().positive().optional(),
  })
  .strict();
