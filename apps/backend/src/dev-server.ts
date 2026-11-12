import { mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { root } from './config.js';
import { seedDevelopmentDatabase, seedDevelopmentIntegrationMocks } from './dev-seed.js';

const dataDir = join(root, 'data');
const databasePath = join(dataDir, 'homora-dev.sqlite');
mkdirSync(dataDir, { recursive: true });
let created = false;
try {
  closeSync(openSync(databasePath, 'wx'));
  created = true;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
}
if (created) {
  const database = createDatabase(databasePath);
  try {
    seedDevelopmentDatabase(getSqliteHandle(database.db));
  } finally {
    database.close();
  }
  console.log('Development database created with sample services.');
}
{
  const database = createDatabase(databasePath);
  try {
    seedDevelopmentIntegrationMocks(getSqliteHandle(database.db));
  } finally {
    database.close();
  }
}
process.env.HOMORA_DATABASE_PATH = databasePath;
process.env.HOMORA_DEV_MOCKS = 'true';
await import('./server.js');
