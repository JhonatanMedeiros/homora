import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Create only a new integration directory. Registration remains a deliberate review step. */
export async function createIntegration(root, id, kind) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length < 2 || id.length > 40)
    throw new Error('Use a 2–40 character lowercase id with letters, numbers and hyphens.');
  if (kind !== 'manifest' && kind !== 'code') throw new Error('Kind must be manifest or code.');

  const parent = join(root, 'packages/integrations/src/integrations');
  const target = join(parent, id);
  await mkdir(parent, { recursive: true });
  // No recursive option: an existing directory is never overwritten.
  await mkdir(target);
  await mkdir(join(target, 'fixtures'));
  const name = JSON.stringify(id);
  const identity = `  type: ${name},\n  label: ${name},\n  mark: 'NEW',\n  capabilities: ['summary'],\n  fields: [urlField({ httpsOnly: true })],`;
  const content =
    kind === 'manifest'
      ? `import type { IntegrationManifest } from '../../integration-manifest.js';\nimport { urlField } from '../fields.js';\n\n// TODO: replace the illustrative endpoint, response and display before registration.\nexport const definition: IntegrationManifest = {\n  kind: 'manifest',\n${identity}\n  auth: { type: 'none' },\n  requests: [{ id: 'summary', path: '/example' }],\n  extract: [{ op: 'pick', out: 'name', path: ['name'], type: 'string', maxLength: 128 }],\n  display: { summary: { text: '{name}' }, stats: [{ label: 'Name', value: '{name}' }] },\n};\n`
      : `import type { CodeDefinition } from '../../integration-manifest.js';\nimport { urlField } from '../fields.js';\n\n// TODO: describe the real fields and capabilities before registration.\nexport const definition: CodeDefinition = {\n  kind: 'code',\n${identity}\n  display: 'custom',\n};\n`;
  const fixture = {
    _source: {
      kind: 'illustrative',
      docs: 'TODO: link to official documentation or describe a sanitized live recording',
      note: 'Placeholder only; replace with a sourced, sanitized response before registration.',
    },
    body: { name: 'Example' },
  };
  const test = `// Template: rename to contract.test.ts and replace the illustrative values.\nimport { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';\nimport { createManifestAdapter } from '../../../../../apps/backend/src/manifest-adapter.js';\nimport { fixture } from '../../../../../apps/backend/src/integration-test-support.js';\nimport { definition } from './definition.js';\n\nrunAdapterContract({\n  name: ${name},\n  create: (transport) => createManifestAdapter(definition, transport),\n  validConfig: { url: 'https://service.example.test' },\n  secrets: [],\n  invalidConfigs: [{ label: 'credentials in URL', config: { url: 'https://user:pass@example.test' } }],\n  fixtures: {\n    valid: { body: fixture('${id}/example.json'), expected: { name: 'Example' } },\n    wrongShape: [{ label: 'missing name', body: {} }],\n    oversized: [{ label: 'long name', body: { name: 'x'.repeat(129) } }],\n  },\n  authenticated: false,\n});\n`;
  const codeTest = test
    .replace(
      "import { createManifestAdapter } from '../../../../../apps/backend/src/manifest-adapter.js';\n",
      '',
    )
    .replace(
      "import { definition } from './definition.js';",
      "import { createAdapter } from './backend.js';",
    )
    .replace(
      'create: (transport) => createManifestAdapter(definition, transport),',
      'create: createAdapter,',
    );
  const backend = `// Template: rename to backend.ts and implement validation and collection.\nimport { defineBackendIntegration, type IntegrationAdapter, type IntegrationTransport } from '../../backend.js';\nimport { definition } from './definition.js';\n\ntype Config = { url: string };\ntype Data = { name: string };\n\nexport function createAdapter(_transport: IntegrationTransport): IntegrationAdapter<Config, Data> {\n  return {\n    type: definition.type, label: definition.label, capabilities: definition.capabilities,\n    validate(_config) { throw new Error('Validation not implemented.'); },\n    async collect(_config) { throw new Error('Collection not implemented.'); },\n  };\n}\n\nexport const registration = defineBackendIntegration(definition, {\n  prepare(context) {\n    if (!context.transport) throw new Error('Integration transport unavailable.');\n    const adapter = createAdapter(context.transport);\n    const config = adapter.validate({ url: String(context.publicConfig.url ?? '') });\n    return () => adapter.collect(config);\n  },\n});\n`;
  const frontend = `// Template: rename to frontend.ts and implement a presentation factory.\nimport { definePresentation } from '../../frontend.js';\n\nexport const presentation = definePresentation({\n  stats(_value) {\n    // TODO: validate returned data and produce translated widget stats.\n    return null;\n  },\n});\n`;
  const readme = `# ${id}\n\nThis is an unregistered ${kind} skeleton, not a working integration.\n\n- Replace the example definition and fixture with the service's documented API and record the fixture source.\n- Rename contract.test.ts.example to contract.test.ts and adapt its cases, including credentials and all failure paths.\n- Register the definition explicitly in packages/integrations/src/integration-manifest.ts.\n${kind === 'code' ? '- Implement and register the backend adapter and frontend presentation; see docs/adapters.md.\n' : ''}- Document required read-only permissions and mark the integration unvalidated until checked against a real instance.\n- Run pnpm check and pnpm build.\n\nNever use a network client directly: use the host-provided restricted transport.\n`;
  await Promise.all([
    writeFile(join(target, 'definition.ts'), content, { flag: 'wx' }),
    writeFile(join(target, 'fixtures/example.json'), `${JSON.stringify(fixture, null, 2)}\n`, {
      flag: 'wx',
    }),
    writeFile(join(target, 'README.md'), readme, { flag: 'wx' }),
    writeFile(join(target, 'contract.test.ts.example'), kind === 'manifest' ? test : codeTest, {
      flag: 'wx',
    }),
    ...(kind === 'code'
      ? [
          writeFile(join(target, 'backend.ts.example'), backend, { flag: 'wx' }),
          writeFile(join(target, 'frontend.ts.example'), frontend, { flag: 'wx' }),
        ]
      : []),
  ]);
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , id, kind] = process.argv;
  try {
    if (!id || !kind || process.argv.length !== 4)
      throw new Error('Usage: pnpm integration:create <id> <manifest|code>');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const target = await createIntegration(root, id, kind);
    console.log(`Created ${target}. Follow its README before registering the integration.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not create integration.');
    process.exitCode = 1;
  }
}
