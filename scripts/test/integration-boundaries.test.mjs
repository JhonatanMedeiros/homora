import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import ts from 'typescript';

async function sourceFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return files.flat();
}

const within = (path, directory) => path === directory || path.startsWith(`${directory}${sep}`);
const literal = (node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;

/** Checks static imports/exports, literal dynamic imports and direct type dispatch. */
function violations(source, file, root, types, side, symbols = new Set()) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  const integrationDir = join(root, 'packages/integrations/src/integrations');
  const appsDir = join(root, 'apps');
  function inspectImport(specifier) {
    if (specifier === undefined) return;
    const resolved = specifier.startsWith('.') ? resolve(dirname(file), specifier) : specifier;
    if (side === 'app') {
      const packagePrefix = '@homora/integrations/';
      const subpath = specifier.startsWith(packagePrefix)
        ? specifier.slice(packagePrefix.length).split('/')
        : [];
      if (within(resolved, integrationDir) || subpath.some((segment) => types.has(segment)))
        problems.push(`individual integration import: ${specifier}`);
    } else if (
      within(resolved, appsDir) ||
      /^@homora\/(backend|frontend|db|shared)(?:\/|$)/.test(specifier)
    ) {
      problems.push(`application dependency: ${specifier}`);
    }
  }
  function checkNames(node) {
    if (
      side !== 'app' ||
      !node.moduleSpecifier ||
      !['@homora/integrations', '@homora/shared'].includes(literal(node.moduleSpecifier))
    )
      return;
    const bindings = ts.isImportDeclaration(node)
      ? node.importClause?.namedBindings
      : node.exportClause;
    if (!bindings || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) return;
    for (const element of bindings.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (symbols.has(name)) problems.push(`individual integration symbol: ${name}`);
    }
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      inspectImport(literal(node.moduleSpecifier));
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) checkNames(node);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      inspectImport(node.arguments[0] && literal(node.arguments[0]));
    if (side === 'app') {
      if (ts.isPropertyAccessExpression(node) && symbols.has(node.name.text))
        problems.push(`individual integration symbol: ${node.name.text}`);
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ].includes(node.operatorToken.kind)
      ) {
        const left = literal(node.left),
          right = literal(node.right);
        if ((left && types.has(left)) || (right && types.has(right)))
          problems.push('integration-specific comparison');
      }
      if (ts.isCaseClause(node) && types.has(literal(node.expression)))
        problems.push('integration-specific switch');
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return problems;
}

test('boundary checker catches imports and dispatch while ignoring comments and generic code', () => {
  const root = '/repo';
  const file = '/repo/apps/backend/src/example.ts';
  const types = new Set(['example-service']);
  for (const source of [
    "import x from '@homora/integrations/definitions/example-service'",
    "export * from '@homora/integrations/example-service/backend'",
    "import('@homora/integrations/example-service')",
    "import x from '../../../packages/integrations/src/integrations/example-service/definition.js'",
    "if (connection.type !== 'example-service') {}",
    "if ('example-service' === connection.kind) {}",
    "switch (connection.type) { case 'example-service': break; }",
  ])
    assert.notDeepEqual(violations(source, file, root, types, 'app'), [], source);
  assert.deepEqual(
    violations(
      "// type === 'example-service'\nimport x from '@homora/integrations/backend';",
      file,
      root,
      types,
      'app',
    ),
    [],
  );
  assert.notDeepEqual(
    violations(
      "import { exampleManifest as x } from '@homora/shared'",
      file,
      root,
      types,
      'app',
      new Set(['exampleManifest']),
    ),
    [],
  );
  assert.notDeepEqual(
    violations('sdk.exampleManifest', file, root, types, 'app', new Set(['exampleManifest'])),
    [],
  );
  const sdkFile = '/repo/packages/integrations/src/index.ts';
  for (const source of [
    "import x from '../../../apps/backend/src/x.js'",
    "import('@homora/frontend')",
    "export * from '@homora/db'",
  ])
    assert.notDeepEqual(violations(source, sdkFile, root, types, 'sdk'), [], source);
  assert.deepEqual(violations("import { z } from 'zod';", sdkFile, root, types, 'sdk'), []);
});

test('application and integration runtime respect integration boundaries', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const integrationDir = join(root, 'packages/integrations/src/integrations');
  const types = new Set();
  const symbols = new Set();
  for (const entry of await readdir(integrationDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const descriptor = JSON.parse(
        await readFile(join(integrationDir, entry.name, 'integration.json'), 'utf8'),
      );
      types.add(descriptor.type);
      for (const name of [
        descriptor.definition,
        descriptor.backend,
        descriptor.frontend,
        descriptor.mcp,
      ])
        if (name) symbols.add(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const [folder, side] of [
    ['apps/backend/src', 'app'],
    ['apps/frontend/src', 'app'],
    ['packages/integrations/src', 'sdk'],
  ]) {
    for (const file of await sourceFiles(join(root, folder))) {
      const problems = violations(await readFile(file, 'utf8'), file, root, types, side, symbols);
      assert.deepEqual(problems, [], `${file}: ${problems.join(', ')}`);
    }
  }
});

test('integration runtime dependencies do not include application packages', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const manifest = JSON.parse(
    await readFile(join(root, 'packages/integrations/package.json'), 'utf8'),
  );
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }))
    assert.doesNotMatch(name, /^@homora\/(backend|frontend|db|shared)(?:\/|$)/);
});
