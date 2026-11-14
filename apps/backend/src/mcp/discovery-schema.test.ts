import { expect, it } from 'vitest';
import { z } from 'zod';
import { discoverySchema } from './discovery-schema.js';

it('derives a flat strict schema from branches sharing field schemas', () => {
  const schema = discoverySchema(
    'tool',
    z.discriminatedUnion('op', [
      z.object({ op: z.literal('a'), id: z.number() }).strict(),
      z.object({ op: z.literal('b'), id: z.number(), name: z.string() }).strict(),
    ]),
  );
  expect(Object.keys(schema.shape)).toEqual(['op', 'id', 'name']);
  expect(schema.safeParse({ op: 'a' }).success).toBe(true);
  expect(schema.safeParse({ op: 'c' }).success).toBe(false);
  expect(schema.safeParse({ op: 'a', extra: 1 }).success).toBe(false);
});

it('fails when a field has diverging schemas across branches', () => {
  expect(() =>
    discoverySchema(
      'propose_card_order',
      z.discriminatedUnion('op', [
        z.object({ op: z.literal('a'), id: z.string() }).strict(),
        z.object({ op: z.literal('b'), id: z.number() }).strict(),
      ]),
    ),
  ).toThrow('propose_card_order: field "id" has diverging schemas across union branches');
});
