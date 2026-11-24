import type { DatabaseSync } from 'node:sqlite';
import { developmentPlugins } from './generated/development.js';

export function seedDevelopmentIntegrationMocks(sqlite: DatabaseSync) {
  for (const plugin of developmentPlugins) plugin.seedDevelopmentMock(sqlite);
}
export function developmentMockData(connection: { type: string; name: string }) {
  for (const plugin of developmentPlugins) {
    const data = plugin.developmentMockData(connection);
    if (data) return data;
  }
  return null;
}

/** Host inventory (nodes and guests) of a demo connection, for the Home rail and Map in dev. */
export function developmentMockInventory(connection: { type: string; name: string }) {
  for (const plugin of developmentPlugins) {
    const inventory = plugin.developmentMockInventory(connection);
    if (inventory) return inventory;
  }
  return null;
}

/** Synthetic resource inventories are available only when development mocks are enabled. */
export function developmentMockResources(connection: { type: string; name: string }) {
  for (const plugin of developmentPlugins) {
    if (
      'developmentMockResources' in plugin &&
      typeof plugin.developmentMockResources === 'function'
    ) {
      const inventory = plugin.developmentMockResources(connection);
      if (inventory) return inventory;
    }
  }
  return null;
}
