import { z } from 'zod';

const integrationType = z.enum(['jellyfin', 'home-assistant', 'uptime-kuma', 'adguard-home']);
const boundedText = (max: number) => z.string().max(max);

export const serviceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: z.string().trim().min(1).max(2048),
    category: z.string().trim().min(1).max(40),
    description: z.string().trim().max(140).optional(),
    icon: z.string().trim().max(8).optional(),
    position: z.number().int().safe().min(0).optional(),
    allowPrivate: z.boolean().optional(),
  })
  .strict();

const serviceIdSchema = z.number().int().safe().positive();
export const serviceProposalSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), service: serviceInputSchema }).strict(),
  z.object({ op: z.literal('update'), id: serviceIdSchema, service: serviceInputSchema }).strict(),
  z.object({ op: z.literal('delete'), id: serviceIdSchema }).strict(),
]);

export const groupNameSchema = z.object({ name: z.string().trim().min(1).max(40) }).strict();

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

export const passwordSchema = z.object({ password: passwordValueSchema.min(8) }).strict();

export const loginPasswordSchema = z.object({ password: passwordValueSchema }).strict();

export const createAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z
      .array(z.enum(['services:read', 'proxmox:read', 'proposals:create']))
      .min(1)
      .max(3),
  })
  .strict();

export const proposalReviewSchema = z.object({ approve: z.boolean() }).strict();
export const opaqueIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

const connectionFields = z
  .object({
    type: integrationType.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    url: z.string().trim().min(1).max(2048).optional(),
    allowPrivate: z.boolean().optional(),
    entityId: boundedText(255).optional(),
    username: boundedText(255).optional(),
    slug: boundedText(255).optional(),
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
    integrationId: z.number().int().safe().positive(),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const proxmoxInputSchema = z
  .object({
    url: boundedText(2048).optional(),
    tokenId: boundedText(256).optional(),
    secret: boundedText(512).optional(),
    ca: boundedText(65536).optional(),
    removeCa: z.boolean().optional(),
  })
  .strict();

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
