import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ImportPlan, IssueCode, ParsedImport } from '../transfer/index.js';
import type { DiscoveryEntry, DiscoveryOverride, DiscoveryRejected } from './labels.js';

const field = (max: number) => z.string().max(max).optional();

/** Review edits by container ID. Only these three fields can be changed, and the parser re-validates them. */
export const overridesSchema = z
  .record(
    z.string().regex(/^[0-9a-f]{12}$/),
    z.object({ name: field(200), group: field(200), url: field(2048) }).strict(),
  )
  .refine((value) => Object.keys(value).length <= 200)
  .optional();

export const toOverrides = (value: Record<string, DiscoveryOverride> | undefined) =>
  new Map(Object.entries(value ?? {}));

/**
 * Digest of exactly what a confirmation would create. The preview returns it and the confirmation
 * compares it with a fresh evaluation, so labels, edits or inventory that changed in between are
 * never applied unreviewed.
 */
export function fingerprintReview(parsed: ParsedImport): string {
  return createHash('sha256').update(JSON.stringify(parsed.document)).digest('hex');
}

export type ImportResult = {
  id: string;
  container: string;
  status: 'created' | 'duplicate' | 'rejected' | 'missing';
  code?: IssueCode;
};

/** One outcome per selected container, in selection order. `entries` align with `plan.services`. */
export function importResults(
  selected: readonly string[],
  entries: readonly DiscoveryEntry[],
  rejected: readonly DiscoveryRejected[],
  plan: ImportPlan,
): ImportResult[] {
  const byId = new Map(
    entries.map((entry, index) => [entry.id, { entry, status: plan.services[index]?.status }]),
  );
  const bad = new Map(rejected.map((item) => [item.id, item]));
  return selected.map((id): ImportResult => {
    const found = byId.get(id);
    if (found)
      return {
        id,
        container: found.entry.container,
        status: found.status === 'new' ? 'created' : 'duplicate',
      };
    const problem = bad.get(id);
    return problem
      ? { id, container: problem.container, status: 'rejected', code: problem.code }
      : { id, container: id, status: 'missing' };
  });
}
