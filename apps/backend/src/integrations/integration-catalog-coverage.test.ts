import { expect, it } from 'vitest';
import { integrationDefinitions } from '@homora/integrations';
import { integrationRegistry } from './integration-registry.js';
import { BRAND_ICON_NAMES } from '@homora/icons';

it('registers every built-in definition with matching metadata and a bundled icon', () => {
  const definitions = integrationDefinitions.map(({ type }) => type).sort();
  expect(
    integrationRegistry
      .list()
      .map(({ type }) => type)
      .sort(),
  ).toEqual(definitions);
  for (const definition of integrationDefinitions) {
    expect(integrationRegistry.get(definition.type)?.definition).toBe(definition);
    if (definition.brandIcon) expect(BRAND_ICON_NAMES).toContain(definition.brandIcon);
  }
});
