import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertBounded,
  assertRequestIsSafe,
  HOSTILE_PATH_VALUES,
} from '../test-support/adapter-contract.js';
import { fixture, fixtureDir } from '../test-support/integration-test-support.js';
import { integrationDefinitions } from '@homora/integrations';

describe('contract coverage', () => {
  it('has a contract run for every registered integration type', () => {
    for (const { type } of integrationDefinitions)
      expect(existsSync(new URL(`${type}/contract.test.ts`, fixtureDir)), type).toBe(true);
  });
  it('requires a source on every fixture', () => {
    for (const dir of readdirSync(fixtureDir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    ))
      for (const file of readdirSync(new URL(`${dir.name}/fixtures/`, fixtureDir)))
        expect(() => fixture(`${dir.name}/${file}`)).not.toThrow();
  });
  it('helper rejects unsafe requests and unbounded output', () => {
    expect(() => assertRequestIsSafe({ origin: 'https://a.test', path: '/a/../b' }, [])).toThrow();
    expect(() => assertRequestIsSafe({ origin: 'https://a.test', path: '/a b' }, [])).toThrow();
    expect(() =>
      assertRequestIsSafe({ origin: 'https://a.test', path: '/a', method: 'POST' } as never, []),
    ).toThrow();
    expect(() => assertBounded({ a: 'x'.repeat(5000) })).toThrow();
    expect(HOSTILE_PATH_VALUES.length).toBeGreaterThan(10);
  });
});
