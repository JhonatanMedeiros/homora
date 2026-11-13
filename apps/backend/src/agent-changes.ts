import { z } from 'zod';
import { AGENT_SCOPES } from './agent-scopes.js';

/** Reviewable agent identity changes (ADR 0002). Shared by proposal creation and review. */
const identityId = z.string().regex(/^[0-9a-f]{32}$/);
const identityScopes = z
  .array(z.enum(AGENT_SCOPES))
  .min(1)
  .max(AGENT_SCOPES.length)
  .refine((items) => new Set(items).size === items.length);
export const agentChangeSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('create'),
      name: z.string().trim().min(1).max(80),
      scopes: identityScopes,
    })
    .strict(),
  z.object({ op: z.literal('update-scopes'), id: identityId, scopes: identityScopes }).strict(),
  z.object({ op: z.literal('revoke'), id: identityId }).strict(),
  z.object({ op: z.literal('rotate'), id: identityId }).strict(),
]);
