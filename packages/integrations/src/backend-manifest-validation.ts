export type ManifestValidationHost = {
  isBrandIcon(name: string): boolean;
  isErrorCode(code: string): boolean;
};
import { z } from 'zod';
import { type IntegrationDefinition, type IntegrationManifest } from './integration-manifest.js';

/**
 * Static validation of built-in definitions. It runs when the registry is created, so an invalid
 * manifest fails the tests and the build, never production traffic. Manifests are data: the
 * schema only admits the closed vocabulary the interpreter in `manifest-adapter.ts` understands.
 */
export const RESERVED_KEYS = [
  'url',
  'secret',
  'tokenId',
  'allowPrivate',
  'ca',
  'removeCa',
  'name',
  'type',
];
const keyName = /^[a-z][A-Za-z0-9]{0,31}$/;
const segment = z
  .union([z.string().min(1).max(64), z.number().int().min(0).max(1000)])
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(String(value)));
const path = z.array(segment).min(1).max(8);
/** An empty path addresses the whole body (a root array). */
const collectionPath = z.array(segment).max(8);
const literal = z.union([z.string().max(64), z.number().finite(), z.boolean()]);
const states = z.record(z.string().regex(keyName), z.array(literal).min(1).max(16));
const text = (max: number) => z.string().min(1).max(max);

const field = z
  .object({
    key: z.string().regex(/^[a-z][A-Za-z0-9]{0,31}$/),
    kind: z.enum(['url', 'text', 'secret', 'token-id']),
    label: text(80),
    labelKey: text(80).optional(),
    placeholder: text(120).optional(),
    placeholderKey: text(80).optional(),
    help: text(300).optional(),
    required: z.boolean(),
    maxLength: z.number().int().min(1).max(65536),
    pattern: z
      .string()
      .max(200)
      .refine((value) => {
        try {
          new RegExp(`^(?:${value})$`);
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
    httpsOnly: z.boolean().optional(),
    allowPath: z.boolean().optional(),
    picker: z.literal('host-node').optional(),
    identity: z.boolean().optional(),
    defaultValue: z.string().max(2048).optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z-]{2,40}$/)
      .optional(),
  })
  .strict();

const extraction = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('pick'),
      out: z.string().regex(keyName),
      request: z.string().optional(),
      path,
      type: z.enum(['string', 'boolean', 'integer', 'number']),
      maxLength: z.number().int().min(1).max(4096).optional(),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
      optional: z.boolean().optional(),
    })
    .strict()
    .refine((value) => value.type !== 'string' || value.maxLength !== undefined, 'string bound')
    .refine(
      (value) =>
        !['integer', 'number'].includes(value.type) ||
        (value.min !== undefined && value.max !== undefined),
      'number bounds',
    ),
  z.object({ op: z.literal('config'), out: z.string().regex(keyName), key: z.string() }).strict(),
  z
    .object({
      op: z.literal('count'),
      out: z.string().regex(keyName),
      request: z.string().optional(),
      path: collectionPath,
      where: z.object({ path, equals: literal }).strict().optional(),
      max: z.number().int().min(1).max(100000).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('sum'),
      out: z.string().regex(keyName),
      request: z.string().optional(),
      path: collectionPath,
      field: path,
      max: z.number().finite().positive(),
    })
    .strict(),
  z
    .object({
      op: z.literal('last'),
      out: z.string().regex(keyName),
      request: z.string().optional(),
      path,
      field: path,
      type: z.enum(['string', 'integer', 'number', 'boolean']),
      maxLength: z.number().int().min(1).max(4096).optional(),
    })
    .strict()
    .refine((value) => value.type !== 'string' || value.maxLength !== undefined, 'string bound'),
  z
    .object({
      op: z.literal('state'),
      out: z.string().regex(keyName),
      request: z.string().optional(),
      path,
      states,
      other: z.string().regex(keyName),
    })
    .strict(),
  z
    .object({
      op: z.literal('rows'),
      out: z.string().regex(keyName),
      request: z.string().optional(),
      path,
      items: path,
      key: path,
      keyType: z.enum(['integer', 'string']),
      maxKeyLength: z.number().int().min(1).max(4096).optional(),
      fields: z.record(
        z.string().regex(keyName),
        z
          .object({
            source: z.enum(['item', 'group']),
            path,
            type: z.enum(['string', 'integer', 'number', 'boolean']),
            maxLength: z.number().int().min(1).max(4096).optional(),
            min: z.number().finite().optional(),
            max: z.number().finite().optional(),
          })
          .strict()
          .refine((v) => v.type !== 'string' || v.maxLength !== undefined)
          .refine(
            (v) =>
              !['integer', 'number'].includes(v.type) ||
              (v.min !== undefined && v.max !== undefined),
          ),
      ),
      max: z.number().int().min(1).max(1000),
      lookup: z
        .object({
          out: z.string().regex(keyName),
          request: z.string(),
          path,
          field: path,
          states,
          other: z.string().regex(keyName),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      op: z.literal('tally'),
      request: z.string().optional(),
      path,
      field: path,
      states,
      other: z.string().regex(keyName),
    })
    .strict(),
]);

const manifestSchema = z
  .object({
    kind: z.literal('manifest'),
    type: z.string().regex(/^[a-z0-9-]{2,40}$/),
    label: text(60),
    mark: z.string().regex(/^[A-Za-z0-9]{1,3}$/),
    brandIcon: z.string().optional(),
    capabilities: z
      .array(z.string().regex(/^[a-z-]{2,40}$/))
      .min(1)
      .max(8),
    inventoryDomain: z.enum(['hosts', 'resources']).optional(),
    systemTelemetry: z.boolean().optional(),
    fields: z.array(field).min(1).max(8),
    auth: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }).strict(),
      z.object({ type: z.literal('bearer') }).strict(),
      z.object({ type: z.literal('token') }).strict(),
      z.object({ type: z.literal('api-key') }).strict(),
      z.object({ type: z.literal('basic-key') }).strict(),
      z.object({ type: z.literal('basic'), usernameField: z.string() }).strict(),
    ]),
    requests: z
      .array(
        z
          .object({
            id: z.string().regex(keyName),
            path: z.string().max(300),
            query: z
              .record(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), z.string().max(100))
              .optional(),
            expectStatus: z.number().int().min(200).max(299).optional(),
            maxBodyBytes: z.number().int().min(1024).max(2_000_000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    require: z
      .array(
        z
          .object({
            request: z.string().optional(),
            path,
            equalsConfig: z.string().optional(),
            equals: literal.optional(),
          })
          .strict()
          .refine((value) => (value.equalsConfig === undefined) !== (value.equals === undefined)),
      )
      .max(8)
      .optional(),
    extract: z.array(extraction).min(1).max(24),
    display: z
      .object({
        values: z
          .record(
            z.string().regex(keyName),
            z
              .object({
                from: z.string(),
                map: z
                  .record(
                    z.string(),
                    z.object({ text: text(40), key: text(80).optional() }).strict(),
                  )
                  .optional(),
              })
              .strict(),
          )
          .optional(),
        summary: z.object({ text: text(300), key: text(80).optional() }).strict(),
        stats: z
          .array(
            z
              .object({
                label: text(40),
                labelKey: text(80).optional(),
                value: text(120),
                hideWhenZero: z.string().optional(),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict(),
    messages: z
      .object({ notFound: text(120).optional() })
      .strict()
      .optional(),
  })
  .strict();

const placeholders = (template: string) =>
  [...template.matchAll(/\{([A-Za-z0-9]+)\}/g)].map((match) => match[1]!);
const hasStrayBraces = (template: string) =>
  template.replace(/\{[A-Za-z0-9]+\}/g, '').match(/[{}]/);

/** Outputs a manifest produces, so display and requests can be cross-checked. */
export function outputKeys(manifest: IntegrationManifest) {
  return manifest.extract.flatMap((step) =>
    step.op === 'tally' ? [...Object.keys(step.states), step.other] : [step.out],
  );
}

/** Throws a descriptive Error when a definition is invalid. Code definitions need only metadata. */
export function assertValidDefinition(
  definition: IntegrationDefinition,
  host: ManifestValidationHost,
): void {
  const name = definition.type;
  const fail = (message: string): never => {
    throw new Error(`Invalid integration definition "${name}": ${message}`);
  };
  if (definition.brandIcon !== undefined && !host.isBrandIcon(definition.brandIcon))
    fail(`unknown brand icon ${definition.brandIcon}`);
  if (
    definition.inventoryDomain !== undefined &&
    !['hosts', 'resources'].includes(definition.inventoryDomain)
  )
    fail('unknown inventory domain');
  if (definition.systemTelemetry !== undefined && typeof definition.systemTelemetry !== 'boolean')
    fail('invalid system telemetry flag');
  const keys = new Set<string>();
  for (const item of definition.fields) {
    if (item.errorCode && !host.isErrorCode(item.errorCode))
      fail(`unknown error code ${item.errorCode}`);
    if (keys.has(item.key)) fail(`duplicate field ${item.key}`);
    keys.add(item.key);
    if (item.kind === 'url' && item.key !== 'url') fail('the url field must be named url');
    if (item.kind === 'secret' && item.key !== 'secret')
      fail('the secret field must be named secret');
    if (item.kind === 'token-id' && item.key !== 'tokenId')
      fail('the token field must be named tokenId');
    if (item.kind === 'text' && RESERVED_KEYS.includes(item.key)) fail(`reserved key ${item.key}`);
    if (item.picker && (item.kind !== 'text' || definition.inventoryDomain !== 'hosts'))
      fail('host node picker requires a text field and host inventory');
  }
  if (!keys.has('url')) fail('missing url field');
  if (definition.kind === 'code') return;
  const parsed = manifestSchema.safeParse(definition);
  if (!parsed.success)
    fail(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  const textKeys = new Set(
    definition.fields.filter((item) => item.kind === 'text').map((item) => item.key),
  );
  const publicKeys = new Set(
    definition.fields.filter((item) => item.kind !== 'secret').map((item) => item.key),
  );
  const secret = definition.fields.some((item) => item.kind === 'secret');
  if (definition.auth.type !== 'none' && !secret) fail('authentication requires a secret field');
  if (definition.auth.type === 'basic' && !textKeys.has(definition.auth.usernameField))
    fail('basic authentication needs a text username field');
  const ids = new Set<string>();
  for (const request of definition.requests) {
    if (ids.has(request.id)) fail(`duplicate request ${request.id}`);
    ids.add(request.id);
    if (
      !/^\/[A-Za-z0-9._~\-/{}]*$/.test(request.path) ||
      request.path.split('/').includes('..') ||
      request.path.includes('//')
    )
      fail(`unsafe path ${request.path}`);
    if (hasStrayBraces(request.path)) fail(`malformed placeholder in ${request.path}`);
    for (const template of [request.path, ...Object.values(request.query ?? {})]) {
      if (hasStrayBraces(template)) fail(`malformed placeholder in ${template}`);
      for (const key of placeholders(template))
        if (!textKeys.has(key)) fail(`placeholder {${key}} is not a text field`);
    }
  }
  const known = (id: string | undefined) => id === undefined || ids.has(id);
  const outputs = outputKeys(definition);
  if (new Set(outputs).size !== outputs.length) fail('duplicate output key');
  for (const step of definition.extract) {
    if (step.op !== 'config' && !known(step.request)) fail(`unknown request ${step.request}`);
    if (
      step.op === 'rows' &&
      (Object.keys(step.fields).length === 0 ||
        Object.keys(step.fields).length > 16 ||
        Object.hasOwn(step.fields, step.lookup.out) ||
        (step.keyType === 'string' && step.maxKeyLength === undefined))
    )
      fail('invalid rows fields');
    if (step.op === 'rows' && !ids.has(step.lookup.request))
      fail(`unknown request ${step.lookup.request}`);
    if (step.op === 'config' && !publicKeys.has(step.key))
      fail(`config key ${step.key} is not a public field`);
  }
  for (const rule of definition.require ?? []) {
    if (!known(rule.request)) fail(`unknown request ${rule.request}`);
    if (rule.equalsConfig !== undefined && !textKeys.has(rule.equalsConfig))
      fail(`require key ${rule.equalsConfig} is not a text field`);
  }
  const values = definition.display.values ?? {};
  for (const [valueName, value] of Object.entries(values))
    if (!outputs.includes(value.from))
      fail(`display value ${valueName} reads unknown output ${value.from}`);
  const names = new Set([...outputs, ...Object.keys(values)]);
  for (const template of [
    definition.display.summary.text,
    ...definition.display.stats.map((stat) => stat.value),
  ])
    for (const key of placeholders(template))
      if (!names.has(key)) fail(`display uses unknown value {${key}}`);
  for (const stat of definition.display.stats)
    if (stat.hideWhenZero && !outputs.includes(stat.hideWhenZero))
      fail(`unknown output ${stat.hideWhenZero}`);
}
