import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import ts from 'typescript';

const within = (file, folder) => file === folder || file.startsWith(`${folder}${sep}`);
const literal = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;

async function files(folder) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) return files(path);
        return /\.[cm]?[jt]sx?$/.test(entry.name) &&
          !/\.(test|spec|d)\.[cm]?[jt]sx?$/.test(entry.name)
          ? [path]
          : [];
      }),
    )
  ).flat();
}

/** Build workspace-level runtime edges from declared dependencies and literal source imports. */
export async function workspaceGraph(root) {
  const workspaces = [];
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folder = join(root, parent, entry.name);
      let manifest;
      try {
        manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      workspaces.push({ name: manifest.name, folder, manifest });
    }
  }
  const names = new Set(workspaces.map((item) => item.name));
  const graph = new Map(workspaces.map((item) => [item.name, new Set()]));
  for (const workspace of workspaces) {
    const edges = graph.get(workspace.name);
    for (const name of Object.keys({
      ...workspace.manifest.dependencies,
      ...workspace.manifest.optionalDependencies,
      ...workspace.manifest.peerDependencies,
    }))
      if (names.has(name)) edges.add(name);
    for (const file of await files(join(workspace.folder, 'src'))) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function add(specifier) {
        if (!specifier) return;
        const target =
          specifier.startsWith('.') || specifier.startsWith('/')
            ? workspaces.find((item) => within(resolve(dirname(file), specifier), item.folder))
                ?.name
            : workspaces.find(
                (item) => specifier === item.name || specifier.startsWith(`${item.name}/`),
              )?.name;
        if (target && target !== workspace.name) edges.add(target);
      }
      function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
          add(literal(node.moduleSpecifier));
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        )
          add(literal(node.arguments[0]));
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  return graph;
}

/** Return one shortest dependency chain to a forbidden workspace, including cycles safely. */
export function findForbiddenPath(graph, start, forbidden) {
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    for (const next of graph.get(path.at(-1)) ?? []) {
      const candidate = [...path, next];
      if (forbidden.has(next)) return candidate;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(candidate);
      }
    }
  }
  return null;
}
