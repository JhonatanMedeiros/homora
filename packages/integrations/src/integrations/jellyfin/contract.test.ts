import { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';
import {
  fixture,
  urlCases,
  long,
} from '../../../../../apps/backend/src/integration-test-support.js';
import { jellyfinManifest } from './definition.js';
import { createManifestAdapter } from '../../../../../apps/backend/src/manifest-adapter.js';

const jellyfin = fixture('jellyfin/system-info-public.json') as Record<string, unknown>;
runAdapterContract({
  name: 'jellyfin',
  create: (transport) => createManifestAdapter(jellyfinManifest, transport),
  validConfig: { url: 'https://jelly.example.test' },
  secrets: [],
  invalidConfigs: [...urlCases(), { label: 'missing url', url: undefined }]
    .map(({ label, url }) => ({ label, config: { url } }))
    .concat([{ label: 'null config', config: null as never }]),
  fixtures: {
    valid: { body: jellyfin, expected: { name: 'Server', version: '10.10.3' } },
    wrongShape: [
      { label: 'no fields', body: {} },
      { label: 'numeric name', body: { ServerName: 42, Version: '1' } },
    ],
    oversized: [
      { label: 'long name', body: { ServerName: long, Version: '1' } },
      { label: 'long version', body: { ServerName: 'a', Version: long } },
    ],
  },
  authenticated: false,
});
