import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript6';

const root = resolve(import.meta.dirname, '../..');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name))
          : /\.[cm]?[jt]sx?$/.test(entry.name)
            ? [join(dir, entry.name)]
            : [],
      ),
    )
  ).flat();
}
const literal = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
function violations(source, file, types, host = false) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  const moduleRoot = join(root, 'packages/widgets/src/widgets');
  const own = file.slice(moduleRoot.length + 1).split(sep)[0];
  function visit(node) {
    if (
      host &&
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(node.operatorToken.kind) &&
      (types.includes(literal(node.left)) || types.includes(literal(node.right)))
    )
      problems.push('widget type comparison');
    let specifier;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      specifier = literal(node.moduleSpecifier);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      specifier = literal(node.arguments[0]);
    if (!host && specifier) {
      const target = specifier.startsWith('.') ? resolve(dirname(file), specifier) : specifier;
      const other = types.filter((type) => type !== own);
      if (
        other.some(
          (type) =>
            target === join(moduleRoot, type) ||
            target.startsWith(join(moduleRoot, type) + sep) ||
            target === join(root, 'packages/widgets/src', `${type}.js`) ||
            target.startsWith(`@homora/widgets/${type}`),
        )
      )
        problems.push('cross-widget import');
      if (
        target.startsWith(join(root, 'apps') + sep) ||
        target.startsWith(join(root, 'packages/integrations') + sep) ||
        /^@homora\/(?:frontend|backend|integrations)(?:\/|$)/.test(target) ||
        target.startsWith('@/')
      )
        problems.push('application or integration import');
      if (
        !file
          .slice(moduleRoot.length + 1)
          .split(sep)
          .includes('ui') &&
        /^(?:react|react-dom|@homora\/ui)(?:\/|$)/.test(specifier)
      )
        problems.push('compiled UI import');
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return problems;
}
test('widget modules and host respect boundaries', async () => {
  const dir = join(root, 'packages/widgets/src/widgets');
  const types = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const file of await files(dir))
    assert.deepEqual(violations(await readFile(file, 'utf8'), file, types), [], file);
  for (const folder of ['apps/frontend/src', 'apps/backend/src'])
    for (const file of await files(join(root, folder))) {
      if (/\.(test|spec)\./.test(file)) continue;
      assert.deepEqual(violations(await readFile(file, 'utf8'), file, types, true), [], file);
    }
  const file = join(dir, 'clock/definition.ts');
  assert.ok(violations("import React from 'react';", file, types).length);
  assert.ok(
    violations("import x from '../../../../../apps/backend/src/index.js';", file, types).length,
  );
  assert.ok(violations("import x from '../note/definition.js';", file, types).length);
  assert.ok(violations("if (type === 'clock') {}", file, types, true).length);
});
