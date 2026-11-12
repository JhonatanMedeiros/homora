import { z } from 'zod';

type OpObject = z.ZodObject<{ op: z.ZodLiteral<string> } & z.ZodRawShape>;

/**
 * The MCP SDK publishes an empty inputSchema for z.discriminatedUnion, so tools
 * advertise a flat strict object derived from the union instead. The union stays
 * the source of truth and re-validates every call.
 *
 * Same-named fields must have the same schema in every branch; otherwise the
 * published schema would be wrong, so this throws (at import time).
 */
export function discoverySchema(tool: string, union: { options: readonly unknown[] }) {
  const options = union.options as OpObject[];
  const shape: Record<string, z.ZodType> = {
    op: z.enum(options.map((option) => option.shape.op.value) as [string, ...string[]]),
  };
  const fingerprints = new Map<string, string>();
  for (const option of options)
    for (const [key, field] of Object.entries(option.shape)) {
      if (key === 'op') continue;
      const fingerprint = JSON.stringify(z.toJSONSchema(field as z.ZodType));
      const seen = fingerprints.get(key);
      if (seen === undefined) {
        fingerprints.set(key, fingerprint);
        shape[key] = (field as z.ZodType).optional();
      } else if (seen !== fingerprint)
        throw new Error(`${tool}: field "${key}" has diverging schemas across union branches`);
    }
  return z.object(shape).strict();
}
