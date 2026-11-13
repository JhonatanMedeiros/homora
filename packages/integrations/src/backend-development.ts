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
